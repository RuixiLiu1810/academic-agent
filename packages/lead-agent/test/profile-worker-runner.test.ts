import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkerRequest } from "@mariozechner/pi-agent-contracts";
import { FileSystemArtifactStore } from "@mariozechner/pi-artifact-core";
import { afterEach, describe, expect, it } from "vitest";
import { createProfileWorkerRunner, extractLiteratureSearchToolOutputs } from "../src/workers/profile-worker-runner.js";

let tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "lead-profile-worker-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
	tempDirs = [];
});

describe("profile worker runner", () => {
	it("rejects unknown profile tools before execution", async () => {
		const runner = createProfileWorkerRunner({
			cwd: makeTempDir(),
			store: new FileSystemArtifactStore(makeTempDir()),
			toolDefinitions: [],
		});
		const request: WorkerRequest = {
			taskId: "task-runner",
			workerType: "literature-searcher",
			objective: "Find NIR papers.",
			constraints: [],
			inputArtifacts: [],
			expectedOutputs: ["literature-search-results"],
			acceptanceCriteria: [],
			profile: {
				id: "literature-searcher",
				name: "Literature Searcher",
				capabilities: ["literature-search"],
				allowedTools: ["literature.search"],
			},
		};

		const result = await runner(request);

		expect(result.status).toBe("failed");
		expect(result.failureReason).toContain("Unknown allowed tool");
	});

	it("extracts literature tool outputs from tool result messages", () => {
		const output = {
			retrievalRunId: "run-1",
			providers: [],
			artifactRefs: [{ id: "artifact-1", kind: "literature-search-results", uri: "memory://artifact-1" }],
			candidatesPreview: [],
			warnings: ["partial"],
		};

		expect(
			extractLiteratureSearchToolOutputs([
				{
					role: "toolResult",
					toolCallId: "call-1",
					toolName: "literature.search",
					content: [],
					details: output,
					isError: false,
					timestamp: Date.now(),
				},
			]),
		).toEqual([output]);
	});
});
