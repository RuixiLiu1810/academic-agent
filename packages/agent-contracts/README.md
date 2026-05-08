# pi-agent-contracts

Shared TypeScript contracts for orchestration hosts, worker adapters, artifact references, execution traces, and acceptance reports.

This package intentionally contains no host runtime implementation. Host packages may depend on these contracts, but this package must not depend on host packages.

The package also exports plain JSON schema objects and lightweight serialization helpers for contract boundary checks:

- `AgentContractSchemas`
- `serializeContract()`
- `deserializeWorkerRequest()`
- `deserializeWorkerResult()`
- `deserializeArtifactManifest()`
- `deserializeAcceptanceReport()`
