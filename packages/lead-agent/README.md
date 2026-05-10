# pi-lead-agent

Lead orchestration agent for academic research and writing workflows.

This package owns the lead-author workflow layer. It decides when to answer directly and when to dispatch a concrete worker task, then synthesizes accepted worker output into the user-facing result.

The runtime owns an `agent-host` session for lead-level state. Worker sessions remain isolated behind worker adapters; the lead session records task intake, routing decisions, worker requests, and accepted or rejected synthesis results.

Acceptance currently checks worker status, explicit expected outputs, warnings, and open questions. A successful worker result is rejected when requested outputs cannot be found in the summary, structured outputs, or produced artifact refs.

Academic profiles live in `profiles/*.md` and are loaded into `WorkerProfile` values. Each profile can define a role prompt, capabilities, output requirements, and an acceptance checklist without changing the runtime protocol.

## Source CLI

The source-level CLI is intentionally available before choosing a final binary name:

```bash
./lead-agent-test.sh --task-type writing --dispatch direct "Rewrite this paragraph into concise academic Chinese."
```

Common options:

```bash
./lead-agent-test.sh \
  --task-type citation \
  --profile citation-checker \
  --expected-output "citation audit" \
  --artifact-dir .tmp/lead-artifacts \
  --session-dir .tmp/lead-sessions \
  --output markdown \
  "Check whether the manuscript claims are supported by the evidence notes."
```

Machine-readable output:

```bash
./lead-agent-test.sh --json --task-type review --expected-output "review memo" "Review this excerpt."
```

The CLI supports `--task-type auto|writing|research|review|revision|methods|citation`, `--profile <id>`, `--dispatch auto|direct|worker`, `--artifact-dir <path>`, `--session-dir <path>`, and `--output markdown|json`.

`--session-dir` persists the lead session through `agent-host` `SessionManager`. Without `--session-dir`, the source CLI uses an in-memory session to preserve the current test-runner behavior.

`--artifact-dir` writes `final-output.md`, `lead-result.json`, `acceptance-report.json` when available, and `artifacts.json`.

## Academic Workflow Smoke

The repo-level `academic-smoke-test.sh` runner validates a lightweight academic workflow using realistic manuscript, reviewer, methods, evidence, and PaperOrchestra-style pre-writing fixtures.

It intentionally does not run the full PaperOrchestra pipeline. It borrows PaperOrchestra's useful boundaries: structured pre-writing inputs, staged academic roles, and deterministic gates. The local smoke suite checks:

- direct writing remains in the lead agent
- citation, methods, review, and research tasks route to the expected profile
- worker outputs satisfy expected-output acceptance gates
- artifact refs are produced for claim audit, revision plan, review comment map, and evidence table outputs
- optional artifact persistence writes an `artifacts.json` manifest

Run:

```bash
./academic-smoke-test.sh
```

Persist artifacts:

```bash
rm -rf .tmp/academic-smoke && ./academic-smoke-test.sh --artifact-dir .tmp/academic-smoke
```
