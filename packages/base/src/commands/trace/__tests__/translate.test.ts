import fs from 'fs'

import path from 'upath'

import {parseOtlpTraces} from '../otel/parse'
import {otelToCustomSpans} from '../otel/translate'

const readFixture = (name: string) =>
  parseOtlpTraces(JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8')))

describe('otelToCustomSpans', () => {
  test('translates a hex-encoded span with attributes, tags and measures', () => {
    const spans = otelToCustomSpans(readFixture('otlp-hex.json'))
    expect(spans).toHaveLength(1)
    const [span] = spans

    expect(span.span_id).toBe('00f067aa0ba902b7')
    expect(span.parent_id).toBeUndefined()
    expect(span.name).toBe('terraform apply')
    expect(span.command).toBe('datadog-ci trace from-otel')
    expect(span.start_time).toBe('2018-12-13T14:51:00.000Z')
    expect(span.end_time).toBe('2018-12-13T14:51:01.500Z')
    expect(span.exit_code).toBe(0)
    expect(span.error_message).toBe('')

    // String / bool attributes and contextual metadata become tags.
    expect(span.tags).toMatchObject({
      'service.name': 'terraform',
      'tf.resource': 'aws_s3_bucket.logs',
      'tf.refresh': 'true',
      'span.kind': 'internal',
      'otel.status_code': 'OK',
      'otel.library.name': 'otel-cli',
      'otel.library.version': '1.0.0',
      // Source OTel trace id is preserved as a correlation tag (not a payload field).
      'otel.trace_id': '0123456789abcdef0123456789abcdef',
    })

    // Numeric attributes (int as OTLP/JSON string, and double) become measures.
    expect(span.measures).toMatchObject({
      'host.cpus': 8,
      'tf.count': 3,
      'tf.duration_ratio': 0.75,
    })
    expect(span.tags).not.toHaveProperty('tf.count')
    expect(span.measures).not.toHaveProperty('tf.resource')
  })

  test('decodes base64-encoded trace and span ids', () => {
    const [span] = otelToCustomSpans(readFixture('otlp-base64.json'))
    expect(span.span_id).toBe('00f067aa0ba902b7')
    expect(span.tags).toMatchObject({
      'service.name': 'gradle',
      'span.kind': 'server',
      'otel.trace_id': '0123456789abcdef0123456789abcdef',
    })
  })

  test('preserves the span tree via span_id / parent_id', () => {
    const spans = otelToCustomSpans(readFixture('otlp-tree.json'))
    expect(spans).toHaveLength(3)
    const byName = Object.fromEntries(spans.map((s) => [s.name, s]))

    expect(byName['root'].parent_id).toBeUndefined()
    // A child's parent_id is byte-identical to its parent's span_id.
    expect(byName['child-a'].parent_id).toBe(byName['root'].span_id)
    expect(byName['child-b'].parent_id).toBe(byName['root'].span_id)
    // All spans of one OTel trace share the same source-trace correlation tag.
    expect(new Set(spans.map((s) => s.tags?.['otel.trace_id'])).size).toBe(1)
  })

  test('maps ERROR status to a non-zero exit code and message', () => {
    const [span] = otelToCustomSpans(readFixture('otlp-error-status.json'))
    expect(span.exit_code).toBe(1)
    expect(span.error_message).toBe('boom')
    expect(span.tags).toMatchObject({'otel.status_code': 'ERROR'})
  })

  test('handles proto3 string-named enums (as emitted by the Collector file exporter)', () => {
    const [span] = otelToCustomSpans(readFixture('otlp-string-enums.json'))
    expect(span.exit_code).toBe(1)
    expect(span.error_message).toBe('upstream 500')
    expect(span.tags).toMatchObject({'otel.status_code': 'ERROR', 'span.kind': 'server'})
  })

  test('accepts numeric enums, numeric-string enums, and omitted (default) kind', () => {
    const base = {
      traceId: '0123456789abcdef0123456789abcdef',
      spanId: '00f067aa0ba902b7',
      startTimeUnixNano: '0',
      endTimeUnixNano: '0',
    }
    const doc = parseOtlpTraces({
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {...base, name: 'numeric', kind: 3, status: {code: 2}},
                {...base, name: 'numeric-string', kind: '3', status: {code: '2'}},
                {...base, name: 'omitted-kind'},
              ],
            },
          ],
        },
      ],
    })
    const [numeric, numericString, omitted] = otelToCustomSpans(doc)
    expect(numeric.tags).toMatchObject({'span.kind': 'client', 'otel.status_code': 'ERROR'})
    expect(numeric.exit_code).toBe(1)
    expect(numericString.tags).toMatchObject({'span.kind': 'client', 'otel.status_code': 'ERROR'})
    expect(numericString.exit_code).toBe(1)
    // Proto3 omits default-valued fields; an absent kind must resolve to 'unspecified', not 'undefined'.
    expect(omitted.tags).toMatchObject({'span.kind': 'unspecified', 'otel.status_code': 'UNSET'})
    expect(omitted.exit_code).toBe(0)
  })

  test('returns no spans for an empty document', () => {
    expect(otelToCustomSpans(readFixture('otlp-empty.json'))).toEqual([])
  })

  test('accepts intValue as a JSON number as well as a string', () => {
    const doc = parseOtlpTraces({
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  traceId: '0123456789abcdef0123456789abcdef',
                  spanId: '00f067aa0ba902b7',
                  name: 's',
                  kind: 0,
                  startTimeUnixNano: '0',
                  endTimeUnixNano: '0',
                  attributes: [{key: 'n', value: {intValue: 5}}],
                  status: {code: 0},
                },
              ],
            },
          ],
        },
      ],
    })
    const [span] = otelToCustomSpans(doc)
    expect(span.measures).toMatchObject({n: 5})
  })
})
