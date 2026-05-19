import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkerRequest } from "@mariozechner/pi-agent-contracts";
import { FileSystemArtifactStore } from "@mariozechner/pi-artifact-core";
import { afterEach, describe, expect, it } from "vitest";
import {
	buildProfileWorkerPrompt,
	createProfileWorkerRunner,
	extractLiteratureSearchToolOutputs,
	inferProfileWorkerStatus,
} from "../src/workers/profile-worker-runner.js";

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

	it("allows non-literature profiles to succeed with narrative output", () => {
		expect(
			inferProfileWorkerStatus({
				request: {
					workerType: "writer",
					profile: {
						id: "writer",
						name: "Writer",
						description: "Writes academic prose",
						capabilities: [],
						expectedOutputs: [],
						acceptanceChecklist: [],
					},
				},
				summary: "Drafted abstract summary.",
				toolOutputs: [],
				producedArtifacts: [],
			}),
		).toBe("success");
	});

	it("requires literature-searcher to produce literature output", () => {
		expect(
			inferProfileWorkerStatus({
				request: {
					workerType: "literature-searcher",
					profile: {
						id: "literature-searcher",
						name: "Literature Searcher",
						capabilities: ["literature-search"],
					},
				},
				summary: "I found papers but did not use the retrieval tool.",
				toolOutputs: [],
				producedArtifacts: [],
			}),
		).toBe("failed");

		expect(
			inferProfileWorkerStatus({
				request: {
					workerType: "literature-searcher",
					profile: {
						id: "literature-searcher",
						name: "Literature Searcher",
						capabilities: ["literature-search"],
					},
				},
				summary: "Retrieval complete.",
				toolOutputs: [
					{
						retrievalRunId: "run-1",
						providers: [],
						artifactRefs: [{ id: "artifact-1", kind: "literature-search-results", uri: "memory://artifact-1" }],
						candidatesPreview: [],
						warnings: [],
					},
				],
				producedArtifacts: [],
			}),
		).toBe("success");
	});

	it("renders output contract and attempt context in worker prompt", () => {
		const prompt = buildProfileWorkerPrompt({
			taskId: "prompt-contract",
			workerType: "researcher",
			objective: "Build evidence summary.",
			constraints: [],
			inputArtifacts: [],
			expectedOutputs: ["evidence summary"],
			acceptanceCriteria: ["Separate evidence from interpretation"],
			outputContract: {
				contractId: "contract:researcher:evidence",
				profileId: "researcher",
				successMode: "all-required",
				requirements: [
					{
						id: "evidence-summary",
						kind: "narrative",
						label: "Evidence summary",
						required: true,
						section: "evidence summary",
						mustMention: ["evidence"],
					},
				],
			},
			attemptContext: {
				attempt: 2,
				maxAttempts: 2,
				previousIssues: [
					{
						code: "narrative_output_missing_token",
						message: "evidence summary missing token: evidence",
						severity: "error",
					},
				],
				previousFailureReason: "evidence summary missing token: evidence",
			},
			metadata: {
				leadContextPackage: {
					currentObjective: "Continue the NIR review.",
					currentStepObjective: "Build evidence summary.",
					relevantPriorObjectives: ["Find NIR literature."],
					relevantLeadOutputs: [],
					relevantArtifacts: [{ id: "prior-lit", kind: "literature-search-results", uri: "memory://prior-lit" }],
					allowedArtifactIds: ["prior-lit"],
					artifactBriefs: [
						{
							artifactId: "prior-lit",
							kind: "literature-search-results",
							brief: "Prior NIR bibliography.",
						},
					],
					previousWorkflowResults: [],
					budget: { maxChars: 12000, usedChars: 500, truncatedSections: [] },
				},
			},
		});

		expect(prompt).toContain("## Output Contract");
		expect(prompt).toContain("narrative section evidence summary");
		expect(prompt).toContain("## Attempt Context");
		expect(prompt).toContain("narrative_output_missing_token");
		expect(prompt).toContain("## Lead Context Package");
		expect(prompt).toContain("Find NIR literature.");
		expect(prompt).toContain("prior-lit (literature-search-results)");
	});
});
