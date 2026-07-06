# trace command

Trace a command with a custom span and report it to Datadog.

## Usage

```bash
datadog-ci trace [--name <name>] [--tags] [--measures] [--no-fail] [--no-capture] [--dry-run] -- <command>
```

For example:

```bash
datadog-ci trace --name "Say Hello" -- echo "Hello World"
```

- The positional arguments are the command which will be launched and traced.
- `--name` (default: same as <command>) is a human-friendly name for the reported span.
- `--tags` is an array of key-value pairs with the format `key:value`. These tags are added to the custom span.
    The resulting dictionary is merged with what is in the `DD_TAGS` environment variable. If a `key` appears both in `--tags` and `DD_TAGS`, the value in `DD_TAGS` takes precedence.
- `--measures` is an array of key-value pairs with the format `key:value`. These measures are added to the custom span.
    The `value` must be a number.
- `--no-fail` (default: `false`) will prevent the trace command from failing even when not run in a supported CI Provider. In this case, the command will be launched and nothing will be reported to Datadog.
- `--no-capture` (default: `false`) reports only the executable name instead of the full command line, so potentially sensitive arguments (tokens, secrets, etc.) are not sent to Datadog. The command is still launched with all of its arguments; only the reported span is trimmed. When `--name` is not provided, the span name also defaults to the executable name.
- `--dry-run` (default: `false`) runs the command without sending the custom span. All other checks are performed.

#### Environment variables

Additionally you might configure the `trace` command with environment variables:

- `DD_API_KEY` (**required**): API key used to authenticate the requests.
- `DD_TAGS`: set global tags applied to all spans. The format must be `key1:value1,key2:value2`.
- `DD_SITE`: choose your Datadog site, e.g. datadoghq.com or datadoghq.eu.

### Optional dependencies

- [`git`](https://git-scm.com/downloads) is used for extracting repository metadata.

### End-to-end testing process

To verify this command works as expected, you can trace a mock command and validate the command returns 0:

```bash
export DD_API_KEY='<API key>'
export CIRCLECI=true

yarn launch trace --name "Say Hello" echo "Hello World"
```

Successful output should look like this:

```bash
Hello World
```

## `trace from-otel` (beta)

Translate an OpenTelemetry (OTLP/JSON) trace file into Datadog CI Visibility custom spans. Several CI
tools (Terraform/OpenTofu, Gradle, buildx/buildkit, `otel-cli`, …) can export OpenTelemetry traces;
point an OpenTelemetry collector's `file` exporter at a path and hand that file to this command to get
the spans into CI Visibility without hand-instrumenting each step.

> **Beta.** Enable with `DD_BETA_COMMANDS_ENABLED=1`.
>
> **Hierarchy.** Each span is reported with a `span_id` derived from the OTLP file, and child spans set
> `parent_id` to their parent's `span_id` — the same nesting convention `trace span --span-id/--parent-id`
> uses ([PR #2397](https://github.com/DataDog/datadog-ci/pull/2397)). Root spans carry no `parent_id` and
> attach to the CI job/step. The originating OTel trace id is preserved as an `otel.trace_id` tag for
> correlation.

```bash
DD_BETA_COMMANDS_ENABLED=1 datadog-ci trace from-otel <file.json> [--max-spans <n>] [--tags] [--measures] [--dry-run]
```

- `<file.json>` (positional, **required**) is a path to an OTLP/JSON trace document (an object with a
  `resourceSpans` array). Both hex and base64 span/trace id encodings are accepted.
- `--max-spans` (default: `1000`) caps how many spans are reported; extra spans are dropped with a
  warning, protecting the intake from oversized traces.
- `--tags` / `--measures` are `key:value` pairs added to **every** reported span (same semantics as
  above; `--tags` merges over each span's own OTel attributes).
- `--dry-run` (default: `false`) prints each translated span payload without sending it.

Mapping: OTel span name → span `name`; start/end nanos → span times; `status.code == ERROR` →
`error_message` + non-zero exit code; numeric attributes → **measures**, other attributes and resource
attributes → **tags** (plus `span.kind`, `otel.status_code`, `otel.library.name`/`version`, and
`otel.trace_id`). Span `events` and `links` are not mapped in this version.

To verify end-to-end, dry-run a fixture and validate it returns 0:

```bash
export DD_API_KEY='<API key>'
export DD_BETA_COMMANDS_ENABLED=1
export CIRCLECI=true

yarn launch trace from-otel ./src/commands/trace/__tests__/fixtures/otlp-tree.json --dry-run
```

## Further reading

Additional helpful documentation, links, and articles:

- [Learn about Adding Custom Commands to Pipeline Traces][1]
- [OpenTelemetry Protocol (OTLP) specification](https://opentelemetry.io/docs/specs/otlp/)

[1]: https://docs.datadoghq.com/continuous_integration/pipelines/custom_commands/
