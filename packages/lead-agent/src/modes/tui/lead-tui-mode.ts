import { Container, ProcessTerminal, Text, TUI } from "@mariozechner/pi-tui";
import type { LeadAgentRunView } from "../../cli/output.js";
import type { LeadAgentRuntime } from "../../index.js";
import { DEFAULT_LEAD_TUI_KEYBINDINGS, type LeadTuiAction } from "./keybindings.js";

export interface LeadTuiInitialStateOptions {
	sessionId: string;
	keybindings?: Record<LeadTuiAction, string>;
}

export interface LeadTuiState {
	sessionId: string;
	input: string;
	status: "ready" | "running" | "error";
	keybindings: Record<LeadTuiAction, string>;
	lastRun?: LeadAgentRunView;
}

export function createLeadTuiInitialState(options: LeadTuiInitialStateOptions): LeadTuiState {
	return {
		sessionId: options.sessionId,
		input: "",
		status: "ready",
		keybindings: options.keybindings ?? DEFAULT_LEAD_TUI_KEYBINDINGS,
		lastRun: undefined,
	};
}

export interface RunLeadTuiModeOptions {
	runtime: LeadAgentRuntime;
	initialPrompt?: string;
}

export async function runLeadTuiMode(options: RunLeadTuiModeOptions): Promise<number> {
	const tui = new TUI(new ProcessTerminal());
	const state = createLeadTuiInitialState({
		sessionId: options.runtime.sessionManager.getSessionId(),
	});
	const root = new Container();
	root.addChild(new Text(`Lead Agent | session ${state.sessionId}`));
	root.addChild(new Text(options.initialPrompt ?? "Ready"));
	tui.addChild(root);
	tui.start();
	tui.stop();
	return 0;
}
