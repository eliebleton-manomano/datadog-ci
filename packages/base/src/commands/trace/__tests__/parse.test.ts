import {OtlpParseError, parseOtlpTraces} from '../otel/parse'

describe('parseOtlpTraces', () => {
  test('accepts a document with a resourceSpans array', () => {
    const doc = {resourceSpans: []}
    expect(parseOtlpTraces(doc)).toBe(doc)
  })

  test('rejects non-object input', () => {
    expect(() => parseOtlpTraces(42)).toThrow(OtlpParseError)
    expect(() => parseOtlpTraces('nope')).toThrow(OtlpParseError)
    // eslint-disable-next-line no-null/no-null
    expect(() => parseOtlpTraces(null)).toThrow(OtlpParseError)
    expect(() => parseOtlpTraces([])).toThrow(OtlpParseError)
  })

  test('rejects a document without resourceSpans', () => {
    expect(() => parseOtlpTraces({foo: 'bar'})).toThrow(OtlpParseError)
    expect(() => parseOtlpTraces({resourceSpans: {}})).toThrow(OtlpParseError)
  })
})
