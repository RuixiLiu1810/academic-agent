import type { LeadTuiTheme } from "../theme.js";
import { ExpandableText } from "./expandable-text.js";

export function createHeaderComponent(
	theme: LeadTuiTheme,
	expandBinding: string,
	startExpanded = false,
): ExpandableText {
	const collapsed = () => theme.accent("Lead Agent") + theme.dim(`  (${expandBinding} to expand)`);

	const expanded = () =>
		[
			theme.accent("Lead Agent"),
			"",
			theme.dim("Commands:"),
			theme.dim("  /task-type <writing|research|review|revision|methods|citation>"),
			theme.dim("  /profile <id>          — set worker profile"),
			theme.dim("  /expected-output <text> — set expected output hint"),
			theme.dim("  /model [pattern]       — list or select model"),
			theme.dim("  /thinking <off|minimal|low|medium|high|xhigh>"),
			theme.dim("  /session               — show session info"),
			theme.dim("  /hotkeys               — show keybindings"),
			theme.dim("  /new                   — clear chat and reset state"),
			"",
			theme.dim("Keybindings:"),
			theme.dim("  enter       submit"),
			theme.dim("  escape      interrupt running task"),
			theme.dim("  ctrl+c      clear editor / exit (double-press)"),
			theme.dim("  ctrl+p      cycle to next model"),
			theme.dim(`  ${expandBinding}      toggle this header`),
		].join("\n");

	const header = new ExpandableText(collapsed, expanded);
	if (startExpanded) {
		header.setExpanded(true);
	}
	return header;
}
