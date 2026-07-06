import path from 'upath'

import {makeRunCLI} from '@datadog/datadog-ci-base/helpers/__tests__/testing-tools'

import {FromOtelCommand} from '../from-otel'

const fixture = (name: string) => path.join(__dirname, 'fixtures', name)

describe('trace from-otel', () => {
  const runCLI = makeRunCLI(FromOtelCommand, ['trace', 'from-otel', '--dry-run'])
  const CI_ENV = {GITLAB_CI: '1', DD_BETA_COMMANDS_ENABLED: '1'}

  afterEach(() => {
    jest.resetAllMocks()
  })

  test('is gated behind DD_BETA_COMMANDS_ENABLED', async () => {
    const {context, code} = await runCLI([fixture('otlp-tree.json')], {GITLAB_CI: '1'})
    expect(code).toBe(1)
    expect(context.stderr.toString()).toContain('in beta')
  })

  test('reports every span with hierarchy in dry-run', async () => {
    const {context, code} = await runCLI([fixture('otlp-tree.json')], CI_ENV)
    expect(code).toBe(0)
    const out = context.stdout.toString()
    expect(out).toContain('Reporting 3 custom span(s)')
    expect(out).toContain('"span_id":"aaaaaaaaaaaaaaaa"')
    // Children nest under the root via parent_id (span_id/parent_id convention, PR #2397).
    expect(out).toContain('"parent_id":"aaaaaaaaaaaaaaaa"')
    // The source OTel trace id is carried as a correlation tag, not a payload field.
    expect(out).toContain('"otel.trace_id":"0123456789abcdef0123456789abcdef"')
    // The root span carries no parent_id, so tags directly follow its span_id.
    expect(out).toContain('"span_id":"aaaaaaaaaaaaaaaa","tags"')
  })

  test('applies --tags to every reported span', async () => {
    const {context, code} = await runCLI([fixture('otlp-tree.json'), '--tags', 'team:build'], CI_ENV)
    expect(code).toBe(0)
    const matches = context.stdout.toString().match(/"team":"build"/g) ?? []
    expect(matches).toHaveLength(3)
  })

  test('caps the number of reported spans with --max-spans', async () => {
    const {context, code} = await runCLI([fixture('otlp-tree.json'), '--max-spans', '1'], CI_ENV)
    expect(code).toBe(0)
    expect(context.stderr.toString()).toContain('exceeding --max-spans')
    expect(context.stdout.toString()).toContain('Reporting 1 custom span(s)')
  })

  test('exits 0 with a message when there are no spans', async () => {
    const {context, code} = await runCLI([fixture('otlp-empty.json')], CI_ENV)
    expect(code).toBe(0)
    expect(context.stdout.toString()).toContain('Nothing to report')
  })

  test('fails on an unsupported CI provider', async () => {
    const {context, code} = await runCLI([fixture('otlp-tree.json')], {DD_BETA_COMMANDS_ENABLED: '1'})
    expect(code).toBe(1)
    expect(context.stderr.toString()).toContain('Unsupported CI provider')
  })

  test('fails when the file cannot be read', async () => {
    const {context, code} = await runCLI([fixture('does-not-exist.json')], CI_ENV)
    expect(code).toBe(1)
    expect(context.stderr.toString()).toContain('Could not read OTLP file')
  })

  test('fails on invalid JSON', async () => {
    const {context, code} = await runCLI([fixture('not-json.txt')], CI_ENV)
    expect(code).toBe(1)
    expect(context.stderr.toString()).toContain('Could not parse')
  })

  test('fails on a document that is not an OTLP trace', async () => {
    const {context, code} = await runCLI([fixture('otlp-malformed.json')], CI_ENV)
    expect(code).toBe(1)
    expect(context.stderr.toString()).toContain('Invalid OTLP trace file')
  })

  test('cleanly rejects a non-numeric timestamp (no stack trace)', async () => {
    const {context, code} = await runCLI([fixture('otlp-bad-timestamp.json')], CI_ENV)
    expect(code).toBe(1)
    expect(context.stderr.toString()).toContain('Invalid OTLP trace file')
  })

  test('cleanly rejects a malformed (null) resourceSpans element', async () => {
    const {context, code} = await runCLI([fixture('otlp-null-element.json')], CI_ENV)
    expect(code).toBe(1)
    expect(context.stderr.toString()).toContain('Invalid OTLP trace file')
  })

  test('rejects a non-positive --max-spans', async () => {
    const {context, code} = await runCLI([fixture('otlp-tree.json'), '--max-spans', '0'], CI_ENV)
    expect(code).toBe(1)
    expect(context.stderr.toString()).toContain('--max-spans must be a positive integer')
  })

  test('rejects a non-positive --max-spans even when the file has no spans', async () => {
    const {context, code} = await runCLI([fixture('otlp-empty.json'), '--max-spans', '0'], CI_ENV)
    expect(code).toBe(1)
    expect(context.stderr.toString()).toContain('--max-spans must be a positive integer')
  })

  test('does not let an OTel attribute override authoritative CI context tags', async () => {
    const {context, code} = await runCLI([fixture('otlp-reserved-tag.json')], {
      CIRCLECI: 'true',
      CIRCLE_WORKFLOW_ID: 'wf',
      CIRCLE_BUILD_NUM: '1',
      DD_BETA_COMMANDS_ENABLED: '1',
    })
    expect(code).toBe(0)
    const out = context.stdout.toString()
    expect(out).toContain('"ci.provider.name":"circleci"')
    expect(out).not.toContain('evil-provider')
  })
})
