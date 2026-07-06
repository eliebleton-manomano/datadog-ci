import {CI_ENGINES} from '@datadog/datadog-ci-base/helpers/ci'

import type {RequestResponse} from '../../helpers/request'

export const SUPPORTED_PROVIDERS = [
  CI_ENGINES.GITHUB,
  CI_ENGINES.GITLAB,
  CI_ENGINES.JENKINS,
  CI_ENGINES.CIRCLECI,
  CI_ENGINES.AWSCODEPIPELINE,
  CI_ENGINES.AZURE,
  CI_ENGINES.BUILDKITE,
] as const
export type Provider = (typeof SUPPORTED_PROVIDERS)[number]

export interface Payload {
  ci_provider: string
  span_id: string
  // Optional parent linkage for assembling a span tree (e.g. `trace span --parent-id` or the
  // `trace from-otel` command). When omitted, the span attaches to its CI job/step. See PR #2397.
  parent_id?: string
  command: string
  name: string
  start_time: string
  end_time: string
  error_message: string
  exit_code: number
  tags: Partial<Record<string, string>>
  measures: Partial<Record<string, number>>
}

/**
 * Input to {@link CustomSpanCommand.executeReportCustomSpans}. Describes a single custom span before the
 * shared CI/git/CLI context tags are merged in. Times are ISO 8601 strings.
 */
export type CustomSpanInput = Omit<Payload, 'ci_provider' | 'tags' | 'measures'> & {
  tags?: Partial<Record<string, string>>
  measures?: Partial<Record<string, number>>
}

export interface APIHelper {
  reportCustomSpan(customSpan: Payload): Promise<RequestResponse>
}
