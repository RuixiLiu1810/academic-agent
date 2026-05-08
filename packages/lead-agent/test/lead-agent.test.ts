import type { WorkerResult } from "@mariozechner/pi-agent-contracts";
import { createExecutionTrace } from "@mariozechner/pi-agent-contracts";
import { SessionManager } from "@mariozechner/pi-agent-host";
import { describe, expect, it } from "vitest";
import { createLeadAgentRuntime } from "../src/index.js";

describe("lead-agent runtime", () => {
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
		});

		expect(result.decision).toMatchObject({
			mode: "worker",
			workerType: "citation-checker",
		});
		expect(result.acceptanceReport?.accepted).toBe(true);
		expect(result.finalOutput).toContain("Evidence gaps");
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
		expect(sessionManager.getEntries().map((entry) => entry.type)).toEqual(["message", "custom", "custom"]);
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
});
