import { describe, expect, it } from "vitest";
import { createLeadEditorTheme, createLeadMarkdownTheme, createLeadTuiTheme } from "../src/modes/tui/theme.js";

describe("createLeadTuiTheme", () => {
	it("returns callable color functions that produce strings", () => {
		const theme = createLeadTuiTheme();
		expect(typeof theme.border).toBe("function");
		expect(typeof theme.dim).toBe("function");
		expect(typeof theme.accent).toBe("function");
		expect(typeof theme.error).toBe("function");
		expect(typeof theme.muted).toBe("function");
		expect(typeof theme.userLabel).toBe("function");
		expect(typeof theme.border("x")).toBe("string");
		expect(typeof theme.accent("x")).toBe("string");
	});
});

describe("createLeadEditorTheme", () => {
	it("returns valid EditorTheme with callable properties", () => {
		const theme = createLeadTuiTheme();
		const editorTheme = createLeadEditorTheme(theme);
		expect(typeof editorTheme.borderColor).toBe("function");
		expect(typeof editorTheme.borderColor("─")).toBe("string");
		expect(typeof editorTheme.selectList.selectedText).toBe("function");
		expect(typeof editorTheme.selectList.description).toBe("function");
	});
});

describe("createLeadMarkdownTheme", () => {
	it("returns valid MarkdownTheme with required callable properties", () => {
		const theme = createLeadMarkdownTheme();
		const required = [
			"heading",
			"link",
			"linkUrl",
			"code",
			"codeBlock",
			"codeBlockBorder",
			"quote",
			"quoteBorder",
			"hr",
			"listBullet",
			"bold",
			"italic",
			"strikethrough",
			"underline",
		] as const;
		for (const key of required) {
			expect(typeof theme[key]).toBe("function");
			expect(typeof theme[key]("x")).toBe("string");
		}
	});
});
