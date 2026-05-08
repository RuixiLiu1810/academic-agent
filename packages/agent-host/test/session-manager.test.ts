import { describe, expect, it } from "vitest";
import { buildSessionContext, SessionManager } from "../src/session-manager.js";

describe("SessionManager", () => {
	it("creates in-memory host sessions and resolves message context", () => {
		const session = SessionManager.inMemory("/tmp/academic-host");
		const firstId = session.appendMessage({
			role: "user",
			content: [{ type: "text", text: "Draft the methods section." }],
			timestamp: Date.now(),
		});
		const secondId = session.appendMessage({
			role: "assistant",
			content: [{ type: "text", text: "Methods draft." }],
			api: "anthropic-messages",
			provider: "faux",
			model: "test-model",
			usage: {
				input: 1,
				output: 1,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 2,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: Date.now(),
		});

		expect(firstId).not.toBe(secondId);
		expect(session.getCwd()).toBe("/tmp/academic-host");
		expect(session.buildSessionContext().messages).toHaveLength(2);
	});

	it("keeps branch summaries in the LLM context path", () => {
		const session = SessionManager.inMemory();
		const rootId = session.appendMessage({
			role: "user",
			content: [{ type: "text", text: "Original question" }],
			timestamp: Date.now(),
		});

		session.branchWithSummary(rootId, "Earlier branch summary");
		const context = buildSessionContext(session.getEntries(), session.getLeafId());

		expect(context.messages).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					role: "branchSummary",
					summary: "Earlier branch summary",
				}),
			]),
		);
	});
});
