import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	ACADEMIC_ARTIFACT_KINDS,
	artifactToRef,
	createAcademicArtifact,
	FileSystemArtifactStore,
	MemoryArtifactStore,
	resolveArtifactLineage,
	webUiArtifactMessageToRef,
	webUiArtifactToRef,
} from "../src/index.js";

describe("artifact stores", () => {
	it("stores, updates, and lists memory artifacts", () => {
		const store = new MemoryArtifactStore();
		const created = store.create({
			kind: "evidence-table",
			title: "Evidence",
			content: "row 1",
			lineage: ["source-1"],
		});
		const updated = store.update(created.id, { content: "row 1\nrow 2" });

		expect(updated.version).toBe("v2");
		expect(updated.lineage).toEqual(["source-1"]);
		expect(store.manifest().artifacts).toHaveLength(1);
	});

	it("creates academic artifacts and resolves lineage refs", () => {
		const store = new MemoryArtifactStore();
		const evidence = createAcademicArtifact(store, {
			kind: ACADEMIC_ARTIFACT_KINDS.evidenceTable,
			title: "Evidence table",
			content: "claim,source",
		});
		const audit = createAcademicArtifact(store, {
			kind: ACADEMIC_ARTIFACT_KINDS.claimAudit,
			title: "Claim audit",
			content: "claim needs support",
			lineage: [evidence.id],
		});
		const updated = store.update(audit.id, {
			content: "claim support confirmed",
			metadata: {
				reviewer: "lead-agent",
			},
		});

		expect(artifactToRef(updated)).toMatchObject({
			id: audit.id,
			kind: "claim-audit",
			title: "Claim audit",
			version: "v2",
		});
		expect(resolveArtifactLineage(store, audit.id).map((artifact) => artifact.id)).toEqual([evidence.id]);
		expect(store.manifest().artifacts.map((artifact) => artifact.kind)).toEqual(["evidence-table", "claim-audit"]);
	});

	it("persists file-system artifact metadata", () => {
		const tempDir = mkdtempSync(join(tmpdir(), "pi-artifacts-"));
		try {
			const store = new FileSystemArtifactStore(tempDir);
			const created = store.create({
				kind: "revision-plan",
				content: "revise methods",
			});

			const reopened = new FileSystemArtifactStore(tempDir);
			expect(reopened.get(created.id)?.content).toBe("revise methods");
			expect(reopened.manifest().artifacts[0]?.id).toBe(created.id);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("round-trips file-system versions and lineage", () => {
		const tempDir = mkdtempSync(join(tmpdir(), "pi-artifacts-"));
		try {
			const store = new FileSystemArtifactStore(tempDir);
			const outline = createAcademicArtifact(store, {
				kind: ACADEMIC_ARTIFACT_KINDS.outline,
				content: "1. Intro",
			});
			const revisionPlan = createAcademicArtifact(store, {
				kind: ACADEMIC_ARTIFACT_KINDS.revisionPlan,
				content: "Revise methods",
				lineage: [outline.id],
			});
			store.update(revisionPlan.id, { content: "Revise methods and limitations" });

			const reopened = new FileSystemArtifactStore(tempDir);
			expect(reopened.get(revisionPlan.id)).toMatchObject({
				version: "v2",
				lineage: [outline.id],
				content: "Revise methods and limitations",
			});
			expect(resolveArtifactLineage(reopened, revisionPlan.id).map((artifact) => artifact.id)).toEqual([outline.id]);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("maps web-ui artifact state to stable artifact refs", () => {
		const ref = webUiArtifactToRef({
			filename: "evidence.json",
			content: "{}",
			updatedAt: "2026-05-08T00:00:00.000Z",
		});

		expect(ref).toMatchObject({
			id: "evidence.json",
			kind: "json-artifact",
			uri: "web-ui-artifact://evidence.json",
			mediaType: "application/json",
			version: "2026-05-08T00:00:00.000Z",
		});
	});

	it("maps web-ui artifact messages without depending on web-ui", () => {
		const ref = webUiArtifactMessageToRef({
			role: "artifact",
			action: "update",
			filename: "draft.md",
			title: "Draft",
			content: "# Draft",
			timestamp: "2026-05-08T00:00:00.000Z",
		});

		expect(ref).toMatchObject({
			id: "draft.md",
			kind: "markdown-artifact",
			title: "Draft",
			mediaType: "text/markdown",
			version: "2026-05-08T00:00:00.000Z",
			metadata: {
				action: "update",
				filename: "draft.md",
				source: "web-ui",
			},
		});
	});

	it("names the initial academic artifact kinds", () => {
		expect(Object.values(ACADEMIC_ARTIFACT_KINDS)).toEqual([
			"evidence-table",
			"outline",
			"claim-audit",
			"review-comment-map",
			"revision-plan",
			"response-letter-draft",
		]);
	});
});
