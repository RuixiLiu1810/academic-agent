# pi-lead-agent

Lead orchestration agent for academic research and writing workflows.

This package owns the lead-author workflow layer. It decides when to answer directly and when to dispatch a concrete worker task, then synthesizes accepted worker output into the user-facing result.

The runtime owns an `agent-host` session for lead-level state. Worker sessions remain isolated behind worker adapters; the lead session records task intake, routing decisions, worker requests, and accepted or rejected synthesis results.
