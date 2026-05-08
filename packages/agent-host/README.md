# pi-agent-host

Reusable host package for agent sessions, runtimes, resource loading, settings, auth/model registry wiring, and session persistence.

This migration step owns the generic session, message, settings, auth storage, model registry, and event bus implementations. Runtime/session factory exports still delegate to the current `pi-coding-agent` host implementation until the remaining coding-specific `AgentSession` boundary is split.
