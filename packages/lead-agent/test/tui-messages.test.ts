import { describe, expect, it } from "vitest";
import type { LeadAgentRunView } from "../src/cli/output.js";
import { ErrorComponent, RunResultComponent, UserQueryComponent } from "../src/modes/tui/components/messages.js";
import { createLeadMarkdownTheme, createLeadTuiTheme } from "../src/modes/tui/theme.js";

function makeView(overrides: Partial<LeadAgentRunView> = {}): LeadAgentRunView {
	return {
		taskId: "t1",
		sessionId: "s1",
		decision: "worker/reviewer",
		accepted: true,
		finalOutput: "All citations validated.",
		issues: [],
		artifacts: [],
		warnings: [],
		openQuestions: [],
		...overrides,
	};
}

describe("UserQueryComponent", () => {
	it("render returns non-empty lines", () => {
		const theme = createLeadTuiTheme();
		const markdownTheme = createLeadMarkdownTheme();
		const comp = new UserQueryComponent("Check my citations", theme, markdownTheme);
		const lines = comp.render(80);
		expect(lines.length).toBeGreaterThan(0);
	});

	it("render output contains the objective text", () => {
		const theme = createLeadTuiTheme();
		const markdownTheme = createLeadMarkdownTheme();
		const comp = new UserQueryComponent("Check my citations", theme, markdownTheme);
		const text = comp.render(80).join("\n");
		expect(text).toContain("Check my citations");
	});
});

describe("RunResultComponent", () => {
	it("render includes finalOutput", () => {
		const theme = createLeadTuiTheme();
		const markdownTheme = createLeadMarkdownTheme();
		const comp = new RunResultComponent(makeView(), theme, markdownTheme);
		const text = comp.render(80).join("\n");
		expect(text).toContain("All citations validated.");
	});

	it("render includes agent label and decision mode", () => {
		const theme = createLeadTuiTheme();
		const markdownTheme = createLeadMarkdownTheme();
		const comp = new RunResultComponent(makeView(), theme, markdownTheme);
		const text = comp.render(80).join("\n");
		expect(text).toContain("Agent");
		expect(text).toContain("worker/reviewer");
	});

	it("render includes issue message when issues present", () => {
		const theme = createLeadTuiTheme();
		const markdownTheme = createLeadMarkdownTheme();
		const comp = new RunResultComponent(
			makeView({
				accepted: false,
				issues: [{ severity: "error", code: "missing_output", message: "No review memo" }],
			}),
			theme,
			markdownTheme,
		);
		const text = comp.render(80).join("\n");
		expect(text).toContain("No review memo");
	});

	it("render includes the plan summary when available", () => {
		const theme = createLeadTuiTheme();
		const markdownTheme = createLeadMarkdownTheme();
		const comp = new RunResultComponent(
			makeView({
				planSummary: "I will run a reviewer pass and return the accepted memo.",
			}),
			theme,
			markdownTheme,
		);
		const text = comp.render(80).join("\n");
		expect(text).toContain("reviewer pass and return the accepted memo");
	});

	it("render returns non-empty for direct dispatch (accepted undefined)", () => {
		const theme = createLeadTuiTheme();
		const markdownTheme = createLeadMarkdownTheme();
		const comp = new RunResultComponent(makeView({ accepted: undefined }), theme, markdownTheme);
		const lines = comp.render(80);
		expect(lines.length).toBeGreaterThan(0);
	});
});

describe("ErrorComponent", () => {
	it("render includes error message and Error label", () => {
		const theme = createLeadTuiTheme();
		const comp = new ErrorComponent("something went wrong", theme);
		const text = comp.render(80).join("\n");
		expect(text).toContain("Error");
		expect(text).toContain("something went wrong");
	});
});
