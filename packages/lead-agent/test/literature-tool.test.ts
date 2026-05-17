import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileSystemArtifactStore } from "@mariozechner/pi-artifact-core";
import { afterEach, describe, expect, it } from "vitest";
import { createLiteratureSearchTool } from "../src/literature/tools.js";
import type { LiteratureSearchProvider } from "../src/literature/types.js";

let tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "lead-literature-tool-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
	tempDirs = [];
});

describe("literature.search tool", () => {
	it("runs fake providers, writes an artifact, and returns compact details", async () => {
		const store = new FileSystemArtifactStore(makeTempDir());
		const provider: LiteratureSearchProvider = {
			id: "crossref",
			async search(request) {
				return {
					provider: "crossref",
					warnings: [],
					candidates: [
						{
							id: "crossref-1",
							provider: "crossref",
							providerRecordId: "10.1000/nir",
							title: "Near infrared spectroscopy for diagnosis",
							authors: ["A. Author"],
							year: 2024,
							doi: "10.1000/nir",
							sourceQuery: request.query,
							retrievedAt: "2026-05-17T00:00:00.000Z",
						},
					],
				};
			},
		};
		const tool = createLiteratureSearchTool({
			store,
			providers: [provider],
			policy: {
				allowedProviders: ["crossref"],
				defaultProviders: ["crossref"],
				maxResultsPerProvider: 5,
				requireArtifactOutput: true,
			},
		});

		const result = await tool.execute(
			"tool-call-1",
			{ query: "near infrared diagnosis" },
			undefined,
			undefined,
			undefined as never,
		);

		expect(result.details.artifactRefs).toHaveLength(1);
		expect(result.details.candidatesPreview[0]?.title).toContain("Near infrared");
		expect(store.list()[0]?.kind).toBe("literature-search-results");
		expect(result.content[0]).toMatchObject({ type: "text" });
	});

	it("rejects disallowed providers and refresh attempts", async () => {
		const store = new FileSystemArtifactStore(makeTempDir());
		const provider: LiteratureSearchProvider = {
			id: "crossref",
			async search() {
				return { provider: "crossref", warnings: [], candidates: [] };
			},
		};
		const tool = createLiteratureSearchTool({
			store,
			providers: [provider],
			policy: {
				allowedProviders: ["crossref"],
				defaultProviders: ["crossref"],
				maxResultsPerProvider: 5,
				allowRefresh: false,
			},
		});

		await expect(
			tool.execute(
				"tool-call-2",
				{ query: "near infrared diagnosis", providers: ["pubmed"] },
				undefined,
				undefined,
				undefined as never,
			),
		).rejects.toThrow("Provider is not allowed by this worker profile: pubmed");

		await expect(
			tool.execute(
				"tool-call-3",
				{ query: "near infrared diagnosis", refresh: true },
				undefined,
				undefined,
				undefined as never,
			),
		).rejects.toThrow("Refresh is not allowed by this worker profile.");
	});

	it("reuses matching session artifacts unless refresh is allowed and requested", async () => {
		const store = new FileSystemArtifactStore(makeTempDir());
		let calls = 0;
		const provider: LiteratureSearchProvider = {
			id: "crossref",
			async search(request) {
				calls += 1;
				return {
					provider: "crossref",
					warnings: [],
					candidates: [
						{
							id: `crossref-${calls}`,
							provider: "crossref",
							providerRecordId: `record-${calls}`,
							title: "Near infrared spectroscopy for diagnosis",
							authors: ["A. Author"],
							year: 2024,
							sourceQuery: request.query,
							retrievedAt: "2026-05-17T00:00:00.000Z",
						},
					],
				};
			},
		};
		const tool = createLiteratureSearchTool({
			store,
			providers: [provider],
			policy: {
				allowedProviders: ["crossref"],
				defaultProviders: ["crossref"],
				maxResultsPerProvider: 5,
			},
		});

		const first = await tool.execute(
			"tool-call-4",
			{ query: "near infrared diagnosis" },
			undefined,
			undefined,
			undefined as never,
		);
		const second = await tool.execute(
			"tool-call-5",
			{ query: "near infrared diagnosis" },
			undefined,
			undefined,
			undefined as never,
		);

		expect(calls).toBe(1);
		expect(second.details.artifactRefs[0]?.id).toBe(first.details.artifactRefs[0]?.id);
	});
});
