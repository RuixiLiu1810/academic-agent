# Changelog

## [Unreleased]

### Added

- Added initial academic lead-agent runtime with direct and single-worker execution paths.
- Added lead-agent acceptance checks for worker status, expected outputs, warnings, and open questions.
- Added Markdown academic profile loading for role prompts, capabilities, expected outputs, and acceptance checklists.
- Added a source CLI used by the repository-level `lead-agent-test.sh` runner.
- Added an academic workflow smoke suite and root runner with realistic manuscript, methods, evidence, reviewer, and PaperOrchestra-style fixtures.
- Added a formal source CLI with task type, profile, artifact directory, session directory, and JSON/Markdown output options.
- Added the planned `pi-lead` package binary entry for the lead-agent CLI.
- Added a source TUI smoke runner for the lead-agent interactive shell.
- Added `/settings` and `/setting` commands for the lead-agent CLI, including a TUI settings panel backed by agent-host model and thinking defaults.
- Added lead-agent working memory context for planner, worker, direct, and academic compaction flows.
- Added `/compact academic` for manual lead-agent academic working memory compaction.
