# pi-artifact-core

Minimal artifact storage, versioning, and lineage primitives for agent workflows.

The first implementation provides memory and local file-system stores. Higher-level academic artifact types can build on these primitives without changing worker contracts.

It also exposes stable academic artifact kind names and adapter helpers for mapping existing `web-ui` artifact state/messages into `ArtifactRef` without changing the web UI persistence format.

Core helpers:

- `createAcademicArtifact(store, input)`
- `artifactToRef(artifact)`
- `resolveArtifactLineage(store, artifactId)`
- `webUiArtifactToRef(artifact)`
- `webUiArtifactMessageToRef(message)`
