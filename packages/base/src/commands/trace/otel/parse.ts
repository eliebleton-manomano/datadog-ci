import type {IExportTraceServiceRequest} from './otlp-types'

/**
 * Thrown when the input is not a recognizable OTLP/JSON trace document.
 */
export class OtlpParseError extends Error {}

/**
 * Validate the top-level shape of an OTLP/JSON trace document (the `ExportTraceServiceRequest` envelope
 * that an OpenTelemetry collector's `file` exporter, or `otel-cli`, writes). Per-span validation happens
 * in {@link otelToCustomSpans}, which guards each field it reads.
 */
export const parseOtlpTraces = (input: unknown): IExportTraceServiceRequest => {
  if (typeof input !== 'object' || !input || Array.isArray(input)) {
    throw new OtlpParseError('Expected an OTLP/JSON object at the top level.')
  }

  const {resourceSpans} = input as {resourceSpans?: unknown}
  if (!Array.isArray(resourceSpans)) {
    throw new OtlpParseError(
      'Missing or invalid "resourceSpans" array. Expected an OTLP/JSON trace document produced by an OpenTelemetry exporter.'
    )
  }

  return input as IExportTraceServiceRequest
}
