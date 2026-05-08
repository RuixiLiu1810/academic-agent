import { describe, expect, it } from "vitest";
import {
	createAcceptanceReport,
	createExecutionTrace,
	isWorkerResultSuccess,
	type WorkerRequest,
	type WorkerResult,
} from "../src/index.js";

describe("agent contracts", () => {
	it("creates execution traces and acceptance reports for worker results", () => {
		const request: WorkerRequest = {
			taskId: "task-1",
			workerType: "researcher",
			objective: "Collect evidence",
			constraints: ["Use provided files only"],
			inputArtifacts: [],
			expectedOutputs: ["evidence table"],
			acceptanceCriteria: ["has citations"],
		};
		const result: WorkerResult = {
			taskId: request.taskId,
			status: "success",
			summary: "Evidence collected",
			producedArtifacts: [],
			warnings: [],
			openQuestions: [],
			executionTrace: createExecutionTrace("run-1", "session-1"),
		};

		expect(isWorkerResultSuccess(result)).toBe(true);
		expect(createAcceptanceReport(result)).toMatchObject({
			taskId: "task-1",
			accepted: true,
			summary: "Evidence collected",
		});
	});
});
