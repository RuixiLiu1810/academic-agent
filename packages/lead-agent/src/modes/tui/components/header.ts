import type { LeadTuiTheme } from "../theme.js";
import { ExpandableText } from "./expandable-text.js";

export function createHeaderComponent(theme: LeadTuiTheme): ExpandableText {
	const collapsed = () => theme.accent("Lead Agent") + theme.dim("  (ctrl+e to expand)");

	const expanded = () =>
		[
			theme.accent("Lead Agent"),
			"",
			theme.dim("Commands:"),
			theme.dim("  /task-type <writing|research|review|revision|methods|citation>"),
			theme.dim("  /profile <id>          — set worker profile"),
			theme.dim("  /expected-output <text> — set expected output hint"),
			theme.dim("  /session               — show session info"),
			theme.dim("  /hotkeys               — show keybindings"),
			theme.dim("  /new                   — clear chat and reset state"),
			"",
			theme.dim("Keybindings:"),
			theme.dim("  enter       submit"),
			theme.dim("  escape      interrupt running task"),
			theme.dim("  ctrl+c      clear editor / exit (double-press)"),
			theme.dim("  ctrl+e      toggle this header"),
		].join("\n");

	return new ExpandableText(collapsed, expanded);
}
