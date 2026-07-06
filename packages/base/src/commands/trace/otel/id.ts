/* eslint-disable no-null/no-null -- OTLP ids may arrive as null from JSON. */
/**
 * OpenTelemetry ID normalization.
 *
 * OTLP trace IDs are 16 bytes and span IDs are 8 bytes. The OTLP/JSON spec encodes them as lowercase
 * hex strings, but Go's `protojson` (used by the OpenTelemetry Collector's `file` exporter) encodes
 * `bytes` fields as base64 — a well-known interop discrepancy. We therefore accept either encoding and
 * always return canonical lowercase hex.
 *
 * Keeping this conversion behind a single function means the on-wire ID format sent to Datadog can be
 * changed in one place once the custom-spans `parent_id` design lands (see issue #2385).
 */
export class OtlpIdError extends Error {}

const HEX_RE = /^[0-9a-fA-F]+$/
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/

const ID_BYTES = {trace: 16, span: 8} as const

export type OtlpIdKind = keyof typeof ID_BYTES

/**
 * Normalize a raw OTLP trace/span id (hex or base64, or the rare `Uint8Array`) to lowercase hex.
 * Throws {@link OtlpIdError} on a missing or malformed id.
 */
export const normalizeOtelId = (raw: string | Uint8Array | undefined | null, kind: OtlpIdKind): string => {
  const expectedBytes = ID_BYTES[kind]

  if (raw === undefined || raw === null) {
    throw new OtlpIdError(`Missing ${kind} id`)
  }

  if (raw instanceof Uint8Array) {
    if (raw.length !== expectedBytes) {
      throw new OtlpIdError(`Invalid ${kind} id: expected ${expectedBytes} bytes, got ${raw.length}`)
    }

    return Buffer.from(raw).toString('hex')
  }

  const value = raw.trim()

  // Hex first: an 8-byte span id is 16 hex chars vs 12 base64 chars, and a 16-byte trace id is 32 hex
  // chars vs 24 base64 chars, so the encodings never collide by length.
  if (value.length === expectedBytes * 2 && HEX_RE.test(value)) {
    return value.toLowerCase()
  }

  if (BASE64_RE.test(value)) {
    const buffer = Buffer.from(value, 'base64')
    if (buffer.length === expectedBytes) {
      return buffer.toString('hex')
    }
  }

  throw new OtlpIdError(`Invalid ${kind} id: "${raw}" is neither ${expectedBytes * 2}-char hex nor base64`)
}

/**
 * True when an OTLP id is absent or all-zero. Some exporters emit an empty string or an all-zero
 * `parentSpanId` for root spans instead of omitting the field.
 */
export const isEmptyOtelId = (raw: string | Uint8Array | undefined | null): boolean => {
  if (raw === undefined || raw === null) {
    return true
  }
  if (raw instanceof Uint8Array) {
    return raw.every((byte) => byte === 0)
  }
  const value = raw.trim()
  if (value === '' || /^0+$/.test(value)) {
    return true
  }
  if (BASE64_RE.test(value)) {
    const buffer = Buffer.from(value, 'base64')

    return buffer.length > 0 && buffer.every((byte) => byte === 0)
  }

  return false
}
