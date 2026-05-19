import { SessionManager } from "@mariozechner/pi-agent-host";
import { describe, expect, it } from "vitest";
import { buildLeadConversationContext } from "../src/orchestration/lead-context.js";

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

describe("buildLeadConversationContext", () => {
	it("extracts recent user objectives and lead outputs", () => {
		const sessionManager = SessionManager.inMemory("/tmp/lead-context-test");
		sessionManager.appendMessage({
			role: "user",
			content: [{ type: "text", text: "Find NIR literature." }],
			timestamp: Date.now(),
		});
		sessionManager.appendMessage({
			role: "assistant",
			content: [{ type: "text", text: "I found a short summary." }],
			api: "lead-agent",
			provider: "lead-agent",
			model: "lead-agent-synthesis",
			timestamp: Date.now(),
			usage: zeroUsage,
			stopReason: "stop",
		});

		const context = buildLeadConversationContext({
			sessionManager,
			currentObjective: "Continue the search.",
		});

		expect(context.currentObjective).toBe("Continue the search.");
		expect(context.recentUserObjectives).toContain("Find NIR literature.");
		expect(context.recentLeadOutputs).toContain("I found a short summary.");
	});

	it("extracts lead decision custom entries", () => {
		const sessionManager = SessionManager.inMemory("/tmp/lead-context-decision");
		sessionManager.appendCustomEntry("lead-agent.decision", {
			taskId: "task-1",
			mode: "worker",
			profileId: "researcher",
			reason: "Needs specialist review.",
		});

		const context = buildLeadConversationContext({
			sessionManager,
			currentObjective: "Continue.",
		});

		expect(context.recentDecisions).toEqual([
			{
				taskId: "task-1",
				mode: "worker",
				profileId: "researcher",
				reason: "Needs specialist review.",
			},
		]);
	});

	it("preserves artifact refs while trimming verbose outputs", () => {
		const sessionManager = SessionManager.inMemory("/tmp/lead-context-budget");
		sessionManager.appendMessage({
			role: "assistant",
			content: [{ type: "text", text: "x".repeat(1000) }],
			api: "lead-agent",
			provider: "lead-agent",
			model: "lead-agent-synthesis",
			timestamp: Date.now(),
			usage: zeroUsage,
			stopReason: "stop",
		});
		sessionManager.appendCustomEntry("lead-agent.result", {
			taskId: "task-1",
			finalOutput: "done",
			accepted: true,
			producedArtifacts: [{ id: "artifact-1", kind: "literature-search-results", uri: "artifact://artifact-1" }],
		});

		const context = buildLeadConversationContext({
			sessionManager,
			currentObjective: "Use artifact.",
			maxChars: 240,
		});

		expect(context.priorArtifacts.map((artifact) => artifact.id)).toContain("artifact-1");
		expect(context.budget.truncatedSections).toContain("recentLeadOutputs");
	});

	it("extracts compaction summary without treating it as lead output", () => {
		const sessionManager = SessionManager.inMemory("/tmp/lead-context-compaction");
		const userId = sessionManager.appendMessage({
			role: "user",
			content: [{ type: "text", text: "Original task." }],
			timestamp: Date.now(),
		});
		sessionManager.appendCompaction(
			"Compacted academic history.",
			userId,
			1200,
			{ kind: "custom-compaction", retained: true },
			true,
		);

		const context = buildLeadConversationContext({
			sessionManager,
			currentObjective: "Continue.",
		});

		expect(context.compactionSummary).toBe("Compacted academic history.");
		expect(context.compactionDetails).toEqual({ kind: "custom-compaction", retained: true });
		expect(context.recentLeadOutputs).not.toContain("Compacted academic history.");
	});
});
