import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	ACADEMIC_ARTIFACT_KINDS,
	FileSystemArtifactStore,
	MemoryArtifactStore,
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
