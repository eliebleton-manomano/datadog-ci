/**
 * Minimal OTLP/JSON trace wire-format types.
 *
 * These describe only the subset of the OpenTelemetry `ExportTraceServiceRequest` (trace) JSON shape
 * that this command reads. They are intentionally hand-declared rather than imported from
 * `@opentelemetry/otlp-transformer`: that package does not export these wire types from its public
 * entry point (they live under private `build/src/**` paths), and pulling it in just for types drags
 * the whole OTLP SDK transformer chain into the dependency tree. The OTLP trace schema is stable
 * (v1, frozen since 2021), so a local subset is low-maintenance.
 *
 * Encodings follow the OTLP/JSON spec + proto3 JSON mapping, so several fields are deliberately wide:
 * - `traceId`/`spanId`/`parentSpanId`: hex (spec) or base64 (Go protojson); see `id.ts`.
 * - `*UnixNano`: uint64 serialized as a JSON string (to preserve precision) or a number.
 * - enum fields (`kind`, `status.code`): the integer value or the proto3 enum name string.
 * - scalar attribute values may be `null` per the proto3 JSON mapping.
 *
 * Spec: https://opentelemetry.io/docs/specs/otlp/#json-protobuf-encoding
 */

export interface IExportTraceServiceRequest {
  resourceSpans?: IResourceSpans[]
}

export interface IResourceSpans {
  resource?: IResource
  scopeSpans?: IScopeSpans[]
}

export interface IResource {
  attributes?: IKeyValue[]
}

export interface IScopeSpans {
  scope?: IInstrumentationScope
  spans?: ISpan[]
}

export interface IInstrumentationScope {
  name?: string
  version?: string
}

export interface ISpan {
  traceId?: string
  spanId?: string
  parentSpanId?: string
  name?: string
  kind?: number | string
  startTimeUnixNano?: string | number
  endTimeUnixNano?: string | number
  attributes?: IKeyValue[]
  status?: IStatus
}

export interface IStatus {
  code?: number | string
  message?: string
}

export interface IKeyValue {
  key?: string
  value?: IAnyValue
}

export interface IAnyValue {
  stringValue?: string | null
  boolValue?: boolean | null
  intValue?: number | string | null
  doubleValue?: number | null
  arrayValue?: {values?: IAnyValue[]}
  kvlistValue?: {values?: IKeyValue[]}
  bytesValue?: string
}
