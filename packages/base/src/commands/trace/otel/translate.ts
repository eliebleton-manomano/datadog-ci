/* eslint-disable no-null/no-null -- OTLP/JSON attribute values are nullable per the wire types. */
import type {IAnyValue, IExportTraceServiceRequest, IInstrumentationScope, IKeyValue, ISpan} from './otlp-types'
import type {CustomSpanInput} from '../interfaces'

import {isEmptyOtelId, normalizeOtelId} from './id'

export const FROM_OTEL_COMMAND = 'datadog-ci trace from-otel'

// OTLP enums (opentelemetry-proto: trace/v1/trace.proto). Proto3 JSON encodes an enum as either its
// integer value or its name string (e.g. the OpenTelemetry Collector's Go exporter emits the names),
// so `resolveEnumName` accepts an integer, a numeric string, or the name (with or without prefix).
const STATUS_CODE_NAMES: Record<number, string> = {0: 'UNSET', 1: 'OK', 2: 'ERROR'}
const STATUS_CODE_PREFIX = 'STATUS_CODE_'

const SPAN_KIND_NAMES: Record<number, string> = {
  0: 'unspecified',
  1: 'internal',
  2: 'server',
  3: 'client',
  4: 'producer',
  5: 'consumer',
}
const SPAN_KIND_PREFIX = 'SPAN_KIND_'

const resolveEnumName = (
  value: number | string | undefined,
  numberToName: Record<number, string>,
  namePrefix: string,
  fallback: string
): string => {
  if (value === undefined) {
    return fallback
  }
  if (typeof value === 'number') {
    return numberToName[value] ?? String(value)
  }
  if (value === '') {
    return fallback
  }
  const asNumber = Number(value)
  if (Number.isInteger(asNumber) && numberToName[asNumber] !== undefined) {
    return numberToName[asNumber]
  }

  return value.startsWith(namePrefix) ? value.slice(namePrefix.length) : value
}

type Fixed64 = ISpan['startTimeUnixNano']

const NANOS_PER_MS = BigInt(1000000)

const toBigIntNanos = (value: Fixed64 | undefined): bigint => {
  if (typeof value === 'number') {
    return BigInt(Math.round(value))
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return BigInt(value.trim())
  }

  return BigInt(0)
}

const nanosToISO = (value: Fixed64 | undefined): string => {
  const ms = Number(toBigIntNanos(value) / NANOS_PER_MS)

  return new Date(ms).toISOString()
}

/**
 * Split OTLP attributes into Datadog tags and measures: numeric values (`intValue`/`doubleValue`) become
 * measures, everything else becomes a string tag. Note `intValue` is serialized as a JSON string in
 * OTLP/JSON (to preserve int64 precision), so it may arrive as a string or a number.
 */
const collectAttributes = (
  attributes: IKeyValue[] | undefined,
  tags: Record<string, string>,
  measures: Record<string, number>
): void => {
  for (const attribute of attributes ?? []) {
    if (!attribute || typeof attribute.key !== 'string') {
      continue
    }
    const {key} = attribute
    const value: IAnyValue | undefined = attribute.value
    if (!value) {
      continue
    }

    if (value.intValue !== undefined && value.intValue !== null && value.intValue !== '') {
      const parsed = Number(value.intValue)
      if (!isNaN(parsed)) {
        measures[key] = parsed
      }
    } else if (value.doubleValue !== undefined && value.doubleValue !== null) {
      measures[key] = value.doubleValue
    } else if (value.stringValue !== undefined && value.stringValue !== null) {
      tags[key] = value.stringValue
    } else if (value.boolValue !== undefined && value.boolValue !== null) {
      tags[key] = String(value.boolValue)
    } else if (value.arrayValue !== undefined) {
      tags[key] = JSON.stringify(value.arrayValue.values ?? [])
    } else if (value.kvlistValue !== undefined) {
      tags[key] = JSON.stringify(value.kvlistValue.values ?? [])
    }
  }
}

const translateSpan = (
  span: ISpan,
  resourceTags: Record<string, string>,
  resourceMeasures: Record<string, number>,
  scope: IInstrumentationScope | undefined
): CustomSpanInput => {
  const tags: Record<string, string> = {...resourceTags}
  const measures: Record<string, number> = {...resourceMeasures}

  collectAttributes(span.attributes, tags, measures)

  // Contextual OTel metadata as tags (added last so they are not clobbered by same-named attributes).
  tags['span.kind'] = resolveEnumName(span.kind, SPAN_KIND_NAMES, SPAN_KIND_PREFIX, 'unspecified').toLowerCase()
  const statusCodeName = resolveEnumName(span.status?.code, STATUS_CODE_NAMES, STATUS_CODE_PREFIX, 'UNSET')
  tags['otel.status_code'] = statusCodeName
  if (scope?.name) {
    tags['otel.library.name'] = scope.name
  }
  if (scope?.version) {
    tags['otel.library.version'] = scope.version
  }
  // Hierarchy is carried by span_id/parent_id (per PR #2397); the source OTel trace id is preserved as a
  // tag for correlation back to the originating trace rather than sent as an unsupported payload field.
  tags['otel.trace_id'] = normalizeOtelId(span.traceId, 'trace')

  const isError = statusCodeName === 'ERROR'

  return {
    span_id: normalizeOtelId(span.spanId, 'span'),
    parent_id: isEmptyOtelId(span.parentSpanId) ? undefined : normalizeOtelId(span.parentSpanId, 'span'),
    name: span.name || 'otel.span',
    command: FROM_OTEL_COMMAND,
    start_time: nanosToISO(span.startTimeUnixNano),
    end_time: nanosToISO(span.endTimeUnixNano),
    error_message: isError ? (span.status?.message ?? '') : '',
    exit_code: isError ? 1 : 0,
    tags,
    measures,
  }
}

/**
 * Translate a parsed OTLP/JSON trace document into flat {@link CustomSpanInput}s, preserving the span
 * tree via `span_id` / `parent_id` (the convention `trace span` uses, per PR #2397). A child's
 * `parent_id` is byte-identical to its parent's `span_id`, so the hierarchy is internally consistent.
 * Root spans (absent or all-zero `parentSpanId`) carry no `parent_id` and fall back to job/step linkage.
 *
 * Span `events` and `links` are not mapped in this version.
 */
export const otelToCustomSpans = (traces: IExportTraceServiceRequest): CustomSpanInput[] => {
  const spans: CustomSpanInput[] = []

  for (const resourceSpans of traces.resourceSpans ?? []) {
    const resourceTags: Record<string, string> = {}
    const resourceMeasures: Record<string, number> = {}
    collectAttributes(resourceSpans.resource?.attributes, resourceTags, resourceMeasures)

    for (const scopeSpans of resourceSpans.scopeSpans ?? []) {
      const scope = scopeSpans.scope
      for (const span of scopeSpans.spans ?? []) {
        spans.push(translateSpan(span, resourceTags, resourceMeasures, scope))
      }
    }
  }

  return spans
}
