import { createExecutionTrace } from "@mariozechner/pi-agent-contracts";
import { describe, expect, it } from "vitest";
import { createLeadAgentRuntime } from "../src/index.js";
import { runLeadInteractiveLoop } from "../src/modes/interactive-loop.js";

const zeroUsage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		total: 0,
	},
};

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

	it("runs manual academic compaction through slash command", async () => {
		const stdout: string[] = [];
		const stderr: string[] = [];
		const runtime = createLeadAgentRuntime({
			directRunner: async () => {
				throw new Error("direct should not run");
			},
			workerRunner: async () => {
				throw new Error("worker should not run");
			},
		});
		runtime.sessionManager.appendMessage({
			role: "user",
			content: [{ type: "text", text: "Summarize NIR." }],
			timestamp: Date.now(),
		});
		runtime.sessionManager.appendMessage({
			role: "assistant",
			content: [{ type: "text", text: "Direct academic output." }],
			api: "lead-agent",
			provider: "lead-agent",
			model: "lead-agent-synthesis",
			timestamp: Date.now(),
			usage: zeroUsage,
			stopReason: "stop",
		});

		const exitCode = await runLeadInteractiveLoop({
			runtime,
			inputs: ["/compact academic", "/exit"],
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		});

		expect(exitCode).toBe(0);
		expect(stderr).toEqual([]);
		expect(stdout.join("")).toContain("Academic working memory compacted.");
	});
});
