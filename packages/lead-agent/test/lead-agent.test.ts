import type { WorkerResult } from "@mariozechner/pi-agent-contracts";
import { createExecutionTrace } from "@mariozechner/pi-agent-contracts";
import { SessionManager } from "@mariozechner/pi-agent-host";
import { describe, expect, it } from "vitest";
import { createLeadAgentRuntime, loadAcademicProfilesFromDir, parseAcademicProfileMarkdown } from "../src/index.js";

describe("lead-agent runtime", () => {
	it("loads academic profiles from markdown soul files", () => {
		const profiles = loadAcademicProfilesFromDir();
		const citationChecker = profiles.find((profile) => profile.id === "citation-checker");

		expect(profiles.map((profile) => profile.id)).toEqual([
			"citation-checker",
			"method-auditor",
			"researcher",
			"reviewer",
			"reviser",
			"writer",
		]);
		expect(citationChecker?.rolePrompt).toContain("claim-support checker");
		expect(citationChecker?.expectedOutputs).toContain("citation audit");
		expect(citationChecker?.acceptanceChecklist).toContain("Unsupported claims are identified");
	});

	it("parses standalone profile markdown into worker profile fields", () => {
		const profile = parseAcademicProfileMarkdown(
			"custom-auditor",
			`# Custom Auditor

Audit custom academic work.

## Role Prompt

Use the custom audit role.

## Capabilities

- custom-audit

## Output Requirements

- custom audit

## Acceptance Checklist

- Custom gap is explicit
`,
		);

		expect(profile).toMatchObject({
			id: "custom-auditor",
			name: "Custom Auditor",
			description: "Audit custom academic work.",
			rolePrompt: "Use the custom audit role.",
			capabilities: ["custom-audit"],
			expectedOutputs: ["custom audit"],
			acceptanceChecklist: ["Custom gap is explicit"],
		});
	});

	it("keeps unified writing tasks in the lead agent", async () => {
		const runtime = createLeadAgentRuntime({
			workerRunner: async () => {
				throw new Error("worker should not run");
			},
		});

		const result = await runtime.run({
			taskId: "task-1",
			objective: "Rewrite this paragraph into concise academic Chinese.",
		});

		expect(result.decision.mode).toBe("direct");
		expect(result.finalOutput).toContain("Rewrite this paragraph");
		expect(result.sessionId).toBe(runtime.sessionManager.getSessionId());
		expect(runtime.sessionManager.getEntries().some((entry) => entry.type === "custom")).toBe(true);
	});

	it("dispatches separable research tasks to a worker and accepts the result", async () => {
		const workerResult: WorkerResult = {
			taskId: "task-2",
			status: "success",
			summary: "Evidence gaps: missing cohort flow and citation support.",
			producedArtifacts: [],
			warnings: [],
			openQuestions: [],
			executionTrace: createExecutionTrace("run-1"),
		};
		const runtime = createLeadAgentRuntime({
			workerRunner: async (request) => ({ ...workerResult, taskId: request.taskId }),
		});

		const result = await runtime.run({
			taskId: "task-2",
			objective: "Review the manuscript evidence and identify citation gaps.",
			expectedOutputs: ["Evidence gaps"],
		});

		expect(result.decision).toMatchObject({
			mode: "worker",
			workerType: "citation-checker",
		});
		expect(result.acceptanceReport?.accepted).toBe(true);
		expect(result.finalOutput).toContain("Evidence gaps");
	});

	it("rejects worker results that miss explicit expected outputs", async () => {
		const workerResult: WorkerResult = {
			taskId: "task-expected-output",
			status: "success",
			summary: "General review completed.",
			producedArtifacts: [],
			warnings: [],
			openQuestions: [],
			executionTrace: createExecutionTrace("run-expected-output"),
		};
		const runtime = createLeadAgentRuntime({
			workerRunner: async (request) => ({ ...workerResult, taskId: request.taskId }),
		});

		const result = await runtime.run({
			taskId: "task-expected-output",
			objective: "Review the manuscript evidence.",
			expectedOutputs: ["citation audit"],
		});

		expect(result.decision.mode).toBe("worker");
		expect(result.acceptanceReport?.accepted).toBe(false);
		expect(result.acceptanceReport?.issues).toContainEqual({
			code: "expected_output_missing",
			message: "Worker result did not satisfy expected output: citation audit",
			severity: "error",
		});
		expect(result.finalOutput).toContain("not accepted");
	});

	it("records lead decisions in a caller-provided host session", async () => {
		const sessionManager = SessionManager.inMemory("/tmp/lead-agent-test");
		const runtime = createLeadAgentRuntime({
			sessionManager,
			workerRunner: async () => {
				throw new Error("worker should not run");
			},
		});

		await runtime.run({
			taskId: "task-3",
			objective: "Polish the conclusion paragraph.",
		});

		expect(runtime.sessionManager).toBe(sessionManager);
		expect(sessionManager.getCwd()).toBe("/tmp/lead-agent-test");
		expect(sessionManager.getEntries().map((entry) => entry.type)).toEqual([
			"message",
			"custom",
			"message",
			"custom",
		]);
	});

	it("turns worker failures into rejected acceptance reports", async () => {
		const runtime = createLeadAgentRuntime({
			workerRunner: async () => {
				throw new Error("worker unavailable");
			},
		});

		const result = await runtime.run({
			taskId: "task-4",
			objective: "Review the manuscript methods for reproducibility.",
		});

		expect(result.decision.mode).toBe("worker");
		expect(result.workerResult?.status).toBe("failed");
		expect(result.acceptanceReport?.accepted).toBe(false);
		expect(result.acceptanceReport?.issues[0]).toMatchObject({
			code: "worker_failed",
			severity: "error",
		});
		expect(result.finalOutput).toContain("not accepted");
	});

	it("routes explicit citation task type to the citation checker profile", async () => {
		const runtime = createLeadAgentRuntime({
			workerRunner: async (request) => ({
				taskId: request.taskId,
				status: "success",
				summary: "citation audit completed",
				structuredOutputs: { expectedOutputs: request.expectedOutputs },
				producedArtifacts: [],
				warnings: [],
				openQuestions: [],
				executionTrace: createExecutionTrace("run-explicit-citation"),
			}),
		});

		const result = await runtime.run({
			taskId: "task-explicit-citation",
			objective: "Check this paragraph.",
			taskType: "citation",
			expectedOutputs: ["citation audit"],
		});

		expect(result.decision).toMatchObject({
			mode: "worker",
			profileId: "citation-checker",
			workerType: "citation-checker",
		});
		expect(result.acceptanceReport?.accepted).toBe(true);
	});

	it("lets explicit profile override task type", async () => {
		const runtime = createLeadAgentRuntime({
			workerRunner: async (request) => ({
				taskId: request.taskId,
				status: "success",
				summary: "methods audit completed",
				structuredOutputs: { expectedOutputs: request.expectedOutputs },
				producedArtifacts: [],
				warnings: [],
				openQuestions: [],
				executionTrace: createExecutionTrace("run-profile-override"),
			}),
		});

		const result = await runtime.run({
			taskId: "task-profile-override",
			objective: "Review this paragraph.",
			taskType: "citation",
			profileId: "method-auditor",
			expectedOutputs: ["methods audit"],
		});

		expect(result.decision).toMatchObject({
			mode: "worker",
			profileId: "method-auditor",
			workerType: "method-auditor",
		});
		expect(result.acceptanceReport?.accepted).toBe(true);
	});

	it("honors direct dispatch override even when a worker profile matches", async () => {
		const runtime = createLeadAgentRuntime({
			workerRunner: async () => {
				throw new Error("worker should not run");
			},
		});

		const result = await runtime.run({
			taskId: "task-direct-override",
			objective: "Review this manuscript for citation gaps.",
			dispatchMode: "direct",
		});

		expect(result.decision.mode).toBe("direct");
		expect(result.finalOutput).toContain("Review this manuscript");
	});
});
