/* eslint-disable no-null/no-null -- exercising null id inputs. */
import {isEmptyOtelId, normalizeOtelId, OtlpIdError} from '../otel/id'

describe('normalizeOtelId', () => {
  test('passes through lowercase hex', () => {
    expect(normalizeOtelId('00f067aa0ba902b7', 'span')).toBe('00f067aa0ba902b7')
    expect(normalizeOtelId('0123456789abcdef0123456789abcdef', 'trace')).toBe('0123456789abcdef0123456789abcdef')
  })

  test('lowercases uppercase hex', () => {
    expect(normalizeOtelId('00F067AA0BA902B7', 'span')).toBe('00f067aa0ba902b7')
  })

  test('decodes base64 span and trace ids to hex', () => {
    expect(normalizeOtelId('APBnqgupArc=', 'span')).toBe('00f067aa0ba902b7')
    expect(normalizeOtelId('ASNFZ4mrze8BI0VniavN7w==', 'trace')).toBe('0123456789abcdef0123456789abcdef')
  })

  test('decodes a Uint8Array to hex', () => {
    expect(normalizeOtelId(Uint8Array.from([0, 240, 103, 170, 11, 169, 2, 183]), 'span')).toBe('00f067aa0ba902b7')
  })

  test('throws on a missing id', () => {
    expect(() => normalizeOtelId(undefined, 'span')).toThrow(OtlpIdError)
    expect(() => normalizeOtelId(null, 'trace')).toThrow(OtlpIdError)
  })

  test('throws on wrong-length hex', () => {
    expect(() => normalizeOtelId('abcd', 'span')).toThrow(OtlpIdError)
    // A 16-byte (trace-length) hex passed as a span id is rejected.
    expect(() => normalizeOtelId('0123456789abcdef0123456789abcdef', 'span')).toThrow(OtlpIdError)
  })

  test('throws on wrong-length Uint8Array', () => {
    expect(() => normalizeOtelId(Uint8Array.from([1, 2, 3]), 'span')).toThrow(OtlpIdError)
  })

  test('throws on non-hex, non-base64 garbage', () => {
    expect(() => normalizeOtelId('not an id!!', 'span')).toThrow(OtlpIdError)
  })
})

describe('isEmptyOtelId', () => {
  test('treats absent ids as empty', () => {
    expect(isEmptyOtelId(undefined)).toBe(true)
    expect(isEmptyOtelId(null)).toBe(true)
    expect(isEmptyOtelId('')).toBe(true)
  })

  test('treats all-zero hex and base64 as empty', () => {
    expect(isEmptyOtelId('0000000000000000')).toBe(true)
    expect(isEmptyOtelId('AAAAAAAAAAA=')).toBe(true)
    expect(isEmptyOtelId(Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0]))).toBe(true)
  })

  test('treats a real id as not empty', () => {
    expect(isEmptyOtelId('00f067aa0ba902b7')).toBe(false)
    expect(isEmptyOtelId('aaaaaaaaaaaaaaaa')).toBe(false)
    expect(isEmptyOtelId('APBnqgupArc=')).toBe(false)
  })
})
