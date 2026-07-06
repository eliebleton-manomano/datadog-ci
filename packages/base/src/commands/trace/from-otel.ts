import fs from 'fs'

import chalk from 'chalk'
import {Command, Option} from 'clipanion'

import * as validation from '@datadog/datadog-ci-base/helpers/validation'

import {CustomSpanCommand} from './helper'
import {parseOtlpTraces} from './otel/parse'
import {otelToCustomSpans} from './otel/translate'

const DEFAULT_MAX_SPANS = 1000

export class FromOtelCommand extends CustomSpanCommand {
  public static paths = [['trace', 'from-otel']]

  public static usage = Command.Usage({
    category: 'CI Visibility',
    description: 'Translate an OpenTelemetry (OTLP/JSON) trace file into Datadog custom spans.',
    details: `
      This command reads a trace file produced by an OpenTelemetry exporter (OTLP/JSON) and reports each
      OTel span to Datadog as a CI Visibility custom span, preserving the span tree via span/parent ids.\n
      See README for details.
    `,
    examples: [
      ['Translate an OTLP/JSON trace file and report its spans to Datadog', 'datadog-ci trace from-otel ./traces.json'],
      ['Inspect the translated spans without sending them', 'datadog-ci trace from-otel ./traces.json --dry-run'],
      [
        'Add extra tags/measures to every reported span',
        'datadog-ci trace from-otel ./traces.json --tags "team:build" --measures "attempt:2"',
      ],
    ],
  })

  private filePath = Option.String()
  private maxSpans: number | undefined = Option.String('--max-spans', {
    validator: validation.isInteger(),
  })

  public async execute() {
    this.tryEnableFips()

    // Beta gate: this command rides on the (non-beta) `trace` scope, so it is gated at runtime rather
    // than hidden at registration like scope-level beta commands.
    if (process.env.DD_BETA_COMMANDS_ENABLED !== '1' && process.env.DD_BETA_COMMANDS_ENABLED !== 'true') {
      this.context.stderr.write(
        'The "trace from-otel" command is in beta. Set DD_BETA_COMMANDS_ENABLED=1 to enable it.\n'
      )

      return 1
    }

    const maxSpans = this.maxSpans ?? DEFAULT_MAX_SPANS
    if (maxSpans < 1) {
      this.context.stderr.write('--max-spans must be a positive integer.\n')

      return 1
    }

    let raw: string
    try {
      raw = fs.readFileSync(this.filePath, 'utf8')
    } catch (error) {
      this.context.stderr.write(`Could not read OTLP file "${this.filePath}": ${(error as Error).message}\n`)

      return 1
    }

    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch (error) {
      this.context.stderr.write(`Could not parse "${this.filePath}" as JSON: ${(error as Error).message}\n`)

      return 1
    }

    let spans
    try {
      spans = otelToCustomSpans(parseOtlpTraces(json))
    } catch (error) {
      // Any failure to interpret the document (bad ids, non-numeric/out-of-range timestamps, malformed
      // structure, …) is reported as an invalid file with a clean exit 1 rather than a raw stack trace.
      this.context.stderr.write(`Invalid OTLP trace file "${this.filePath}": ${(error as Error).message}\n`)

      return 1
    }

    if (spans.length === 0) {
      this.context.stdout.write(`No spans found in "${this.filePath}". Nothing to report.\n`)

      return 0
    }

    if (spans.length > maxSpans) {
      this.context.stderr.write(
        chalk.yellow(
          `[WARNING] Found ${spans.length} spans, exceeding --max-spans (${maxSpans}). ` +
            `Only the first ${maxSpans} will be reported. Raise --max-spans to send more.\n`
        )
      )
      spans = spans.slice(0, maxSpans)
    }

    this.context.stdout.write(`Reporting ${spans.length} custom span(s) from "${this.filePath}"...\n`)

    return this.executeReportCustomSpans(spans)
  }
}
