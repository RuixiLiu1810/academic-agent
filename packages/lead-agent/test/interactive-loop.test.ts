import { createExecutionTrace } from "@mariozechner/pi-agent-contracts";
import { describe, expect, it } from "vitest";
import { createLeadAgentRuntime } from "../src/index.js";
import { runLeadInteractiveLoop } from "../src/modes/interactive-loop.js";

describe("runLeadInteractiveLoop", () => {
	it("runs repeated prompts and exits on /exit", async () => {
		const stdout: string[] = [];
		const runtime = createLeadAgentRuntime({
			workerRunner: async (request) => ({
				taskId: request.taskId,
				status: "success",
				summary: `${request.expectedOutputs.join(", ")} completed`,
				structuredOutputs: { expectedOutputs: request.expectedOutputs },
				producedArtifacts: [],
				warnings: [],
				openQuestions: [],
				executionTrace: createExecutionTrace("run-interactive-loop"),
			}),
		});

		const exitCode = await runLeadInteractiveLoop({
			runtime,
			inputs: ["Review this manuscript.", "/exit"],
			stdout: (text) => stdout.push(text),
			stderr: () => {},
			defaultExpectedOutputs: ["review memo"],
			defaultTaskType: "review",
		});

		expect(exitCode).toBe(0);
		expect(stdout.join("")).toContain("review memo completed");
		expect(stdout.join("")).toContain("bye");
	});

	it("updates defaults through slash commands", async () => {
		const stdout: string[] = [];
		const runtime = createLeadAgentRuntime({
			workerRunner: async (request) => ({
				taskId: request.taskId,
				status: "success",
				summary: `${request.workerType}: ${request.expectedOutputs.join(", ")}`,
				structuredOutputs: { expectedOutputs: request.expectedOutputs },
				producedArtifacts: [],
				warnings: [],
				openQuestions: [],
				executionTrace: createExecutionTrace("run-interactive-command"),
			}),
		});

		const exitCode = await runLeadInteractiveLoop({
			runtime,
			inputs: ["/task-type citation", "/expected-output citation audit", "Check support.", "/exit"],
			stdout: (text) => stdout.push(text),
			stderr: () => {},
		});

		expect(exitCode).toBe(0);
		expect(stdout.join("")).toContain("task-type: citation");
		expect(stdout.join("")).toContain("citation-checker: citation audit");
	});

	it("prints current settings through slash command", async () => {
		const stdout: string[] = [];
		const runtime = createLeadAgentRuntime({
			workerRunner: async (request) => ({
				taskId: request.taskId,
				status: "success",
				summary: "unused",
				structuredOutputs: {},
				producedArtifacts: [],
				warnings: [],
				openQuestions: [],
				executionTrace: createExecutionTrace("run-interactive-settings"),
			}),
		});

		const exitCode = await runLeadInteractiveLoop({
			runtime,
			inputs: ["/settings", "/exit"],
			stdout: (text) => stdout.push(text),
			stderr: () => {},
			defaultExpectedOutputs: ["evidence-table"],
			defaultTaskType: "research",
			defaultProfileId: "researcher",
		});

		const output = stdout.join("");
		expect(exitCode).toBe(0);
		expect(output).toContain("settings:");
		expect(output).toContain("task-type:        research");
		expect(output).toContain("profile:          researcher");
		expect(output).toContain("expected-outputs: evidence-table");
	});
});
