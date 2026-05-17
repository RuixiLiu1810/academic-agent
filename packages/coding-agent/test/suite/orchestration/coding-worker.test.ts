import { fauxAssistantMessage } from "@mariozechner/pi-ai";
import { afterEach, describe, expect, it } from "vitest";
import { buildCodingWorkerPrompt, runCodingWorker } from "../../../src/core/orchestration/coding-worker.js";
import { runCodingWorker as runCodingWorkerFromSubpath } from "../../../src/worker.js";
import { createHarness, type Harness } from "../harness.js";

describe("coding worker adapter", () => {
	const harnesses: Harness[] = [];

	afterEach(() => {
		while (harnesses.length > 0) {
			harnesses.pop()?.cleanup();
		}
	});

	it("turns a WorkerRequest into a structured WorkerResult", async () => {
		const harness = await createHarness();
		harnesses.push(harness);
		harness.setResponses([
			fauxAssistantMessage(`Worker completed the evidence pass.

WORKER_RESULT_JSON:
{
  "summary": "Worker completed the evidence pass.",
  "structuredOutputs": {
    "evidenceCount": 3
  },
  "producedArtifacts": [
    {
      "id": "artifact-1",
      "kind": "evidence-table",
      "uri": "memory://artifact-1",
      "title": "Evidence table"
    }
  ],
  "artifactBriefs": [
    {
      "artifactId": "artifact-1",
      "kind": "evidence-table",
      "title": "Evidence table",
      "brief": "Three evidence rows were extracted."
    }
  ],
  "warnings": ["One source needs manual citation review."],
  "openQuestions": ["Should the lead agent revise the background section?"]
}`),
		]);

		const result = await runCodingWorker(
			{
				taskId: "task-1",
				workerType: "researcher",
				objective: "Review the attached notes for evidence gaps.",
				constraints: ["Do not edit files"],
				inputArtifacts: [],
				expectedOutputs: ["gap summary"],
				acceptanceCriteria: ["mentions missing evidence"],
			},
			{ session: harness.session },
		);

		expect(result).toMatchObject({
			taskId: "task-1",
			status: "success",
			summary: "Worker completed the evidence pass.",
		});
		expect(result.producedArtifacts).toEqual([
			{
				id: "artifact-1",
				kind: "evidence-table",
				uri: "memory://artifact-1",
				title: "Evidence table",
			},
		]);
		expect(result.warnings).toEqual(["One source needs manual citation review."]);
		expect(result.openQuestions).toEqual([{ question: "Should the lead agent revise the background section?" }]);
		expect(result.artifactBriefs).toEqual([
			{
				artifactId: "artifact-1",
				kind: "evidence-table",
				title: "Evidence table",
				brief: "Three evidence rows were extracted.",
			},
		]);
		expect(result.structuredOutputs?.evidenceCount).toBe(3);
		expect(result.structuredOutputs?.sessionId).toBe(harness.session.sessionId);
	});

	it("includes constraints, outputs, and acceptance criteria in the worker prompt", () => {
		const prompt = buildCodingWorkerPrompt({
			taskId: "task-2",
			workerType: "reviewer",
			objective: "Audit claims.",
			constraints: ["Use manuscript only"],
			inputArtifacts: [],
			expectedOutputs: ["claim audit"],
			acceptanceCriteria: ["no unsupported claims"],
		});

		expect(prompt).toContain("Use manuscript only");
		expect(prompt).toContain("claim audit");
		expect(prompt).toContain("no unsupported claims");
		expect(prompt).toContain("Use exact expected output labels as structuredOutputs keys");
		expect(prompt).toContain("artifactBriefs");
		expect(prompt).toContain("WORKER_RESULT_JSON");
	});

	it("includes offline retrieval semantics in the literature searcher prompt", () => {
		const literaturePrompt = buildCodingWorkerPrompt({
			taskId: "task-literature",
			workerType: "literature-searcher",
			objective: "Find literature about NIR.",
			constraints: [],
			inputArtifacts: [],
			expectedOutputs: ["search strategy", "bibliography candidates", "retrieval gaps"],
			acceptanceCriteria: ["Candidate bibliography is separated from verified evidence"],
			profile: {
				id: "literature-searcher",
				name: "Literature Searcher",
				rolePrompt: "Act as an academic literature search planner.",
				capabilities: ["literature-search"],
			},
		});

		expect(literaturePrompt).toContain("retrievalMode");
		expect(literaturePrompt).toContain("offline-structured");
		expect(literaturePrompt).toContain("providerAvailable");
		expect(literaturePrompt).toContain("Do not present offline candidates as verified database retrieval results");
	});

	it("exposes the worker adapter through the worker entrypoint", () => {
		expect(runCodingWorkerFromSubpath).toBe(runCodingWorker);
	});
});
