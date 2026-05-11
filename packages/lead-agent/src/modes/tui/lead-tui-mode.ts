import {
	Container,
	Editor,
	KeybindingsManager,
	Loader,
	ProcessTerminal,
	setKeybindings,
	Text,
	TUI,
	TUI_KEYBINDINGS,
} from "@mariozechner/pi-tui";
import type { LeadAgentRunView } from "../../cli/output.js";
import { createLeadAgentRunView } from "../../cli/output.js";
import type { AcademicTaskType, LeadAgentRuntime } from "../../index.js";
import { ErrorComponent, RunResultComponent, UserQueryComponent } from "./components/messages.js";
import { DEFAULT_LEAD_TUI_KEYBINDINGS, type LeadTuiAction } from "./keybindings.js";
import { createLeadEditorTheme, createLeadMarkdownTheme, createLeadTuiTheme, type LeadTuiTheme } from "./theme.js";

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
	taskType?: AcademicTaskType;
	profileId?: string;
	expectedOutputs: string[];
	runCount: number;
}

export function createLeadTuiInitialState(options: LeadTuiInitialStateOptions): LeadTuiState {
	return {
		sessionId: options.sessionId,
		input: "",
		status: "ready",
		keybindings: options.keybindings ?? DEFAULT_LEAD_TUI_KEYBINDINGS,
		lastRun: undefined,
		taskType: undefined,
		profileId: undefined,
		expectedOutputs: [],
		runCount: 0,
	};
}

export interface RunLeadTuiModeOptions {
	runtime: LeadAgentRuntime;
	initialPrompt?: string;
}

function parseTuiAcademicTaskType(value: string): AcademicTaskType | undefined {
	if (
		value === "writing" ||
		value === "research" ||
		value === "review" ||
		value === "revision" ||
		value === "methods" ||
		value === "citation"
	) {
		return value;
	}
	return undefined;
}

function handleTuiSlashCommand(
	text: string,
	state: LeadTuiState,
	footer: Text,
	theme: LeadTuiTheme,
	chatContainer: Container,
): void {
	const [cmd, ...parts] = text.slice(1).trim().split(/\s+/);
	const value = parts.join(" ").trim();

	switch (cmd) {
		case "task-type": {
			const parsed = parseTuiAcademicTaskType(value);
			if (parsed) {
				state.taskType = parsed;
				footer.setText(theme.dim(`task-type: ${parsed}`));
			} else {
				footer.setText(theme.error("task-type must be: writing|research|review|revision|methods|citation"));
			}
			break;
		}
		case "profile":
			state.profileId = value || undefined;
			footer.setText(theme.dim(`profile: ${state.profileId ?? "auto"}`));
			break;
		case "expected-output":
			if (value.length > 0) {
				state.expectedOutputs = [value];
			}
			footer.setText(theme.dim(`expected-output: ${state.expectedOutputs.join(", ") || "none"}`));
			break;
		case "session": {
			const lines = [
				`session:          ${state.sessionId}`,
				`runs:             ${state.runCount}`,
				`task-type:        ${state.taskType ?? "(not set)"}`,
				`profile:          ${state.profileId ?? "(auto)"}`,
				`expected-outputs: ${state.expectedOutputs.length > 0 ? state.expectedOutputs.join(", ") : "(none)"}`,
			].join("\n");
			chatContainer.addChild(new Text(theme.dim(lines), 1, 0));
			break;
		}
		case "hotkeys": {
			const kb = state.keybindings;
			const lines = [
				`submit:  ${kb.submit}`,
				`cancel:  ${kb.cancel}`,
				`exit:    ${kb.exit}`,
				`help:    ${kb.help}`,
			].join("\n");
			chatContainer.addChild(new Text(theme.dim(lines), 1, 0));
			break;
		}
		case "new":
			chatContainer.clear();
			state.taskType = undefined;
			state.profileId = undefined;
			state.expectedOutputs = [];
			state.lastRun = undefined;
			state.runCount = 0;
			footer.setText(
				theme.dim(`session ${state.sessionId} · enter to submit · /help for commands · ctrl+c to exit`),
			);
			break;
		case "help":
			footer.setText(theme.dim("/task-type · /profile · /expected-output · /session · /hotkeys · /new · /help"));
			break;
		default:
			footer.setText(theme.error(`unknown command: /${cmd ?? ""} — type /help for commands`));
	}
}

export async function runLeadTuiMode(options: RunLeadTuiModeOptions): Promise<number> {
	const theme = createLeadTuiTheme();
	const markdownTheme = createLeadMarkdownTheme();
	const editorTheme = createLeadEditorTheme(theme);

	const state = createLeadTuiInitialState({
		sessionId: options.runtime.sessionManager.getSessionId(),
	});

	const tui = new TUI(new ProcessTerminal());
	setKeybindings(new KeybindingsManager(TUI_KEYBINDINGS));

	// Chat history
	const chatContainer = new Container();

	// Loader area (shown while running)
	const loaderContainer = new Container();

	// Editor area
	const editor = new Editor(tui, editorTheme);
	if (options.initialPrompt) {
		editor.setText(options.initialPrompt);
	}
	const editorContainer = new Container();
	editorContainer.addChild(editor);

	// Footer status bar
	const footerHint = `session ${state.sessionId} · enter to submit · /help for commands · ctrl+c to exit`;
	const footer = new Text(theme.dim(footerHint), 0, 0);

	// Layout
	tui.addChild(new Text(theme.accent("Lead Agent"), 1, 1));
	tui.addChild(chatContainer);
	tui.addChild(loaderContainer);
	tui.addChild(editorContainer);
	tui.addChild(footer);
	tui.setFocus(editor);

	// Submit handler
	editor.onSubmit = async (text: string) => {
		text = text.trim();
		if (!text || state.status === "running") return;

		// Slash commands
		if (text.startsWith("/")) {
			handleTuiSlashCommand(text, state, footer, theme, chatContainer);
			editor.setText("");
			tui.requestRender();
			return;
		}

		// Record in history for up/down navigation
		editor.addToHistory(text);
		editor.setText("");
		editor.disableSubmit = true;
		state.status = "running";

		// Append user query to chat
		chatContainer.addChild(new UserQueryComponent(text, theme, markdownTheme));

		// Show spinner
		const loader = new Loader(tui, theme.accent, theme.dim, "Running…");
		loaderContainer.addChild(loader);
		tui.requestRender();

		try {
			const result = await options.runtime.run({
				objective: text,
				taskType: state.taskType,
				profileId: state.profileId,
				expectedOutputs: state.expectedOutputs.length > 0 ? state.expectedOutputs : undefined,
			});
			const view = createLeadAgentRunView(result);
			state.lastRun = view;
			state.runCount++;
			loader.stop();
			loaderContainer.clear();
			chatContainer.addChild(new RunResultComponent(view, theme, markdownTheme));
		} catch (err) {
			loader.stop();
			loaderContainer.clear();
			const message = err instanceof Error ? err.message : String(err);
			chatContainer.addChild(new ErrorComponent(message, theme));
		} finally {
			state.status = "ready";
			editor.disableSubmit = false;
			tui.requestRender();
		}
	};

	tui.start();

	return new Promise<number>((resolve) => {
		let settled = false;
		const cleanupHandlers: Array<() => void> = [];

		const finish = (exitCode: number) => {
			if (settled) return;
			settled = true;
			for (const cleanup of cleanupHandlers) cleanup();
			tui.stop();
			resolve(exitCode);
		};

		const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
		if (process.platform !== "win32") signals.push("SIGHUP");

		for (const signal of signals) {
			const handler = () => finish(signal === "SIGINT" ? 130 : 0);
			process.once(signal, handler);
			cleanupHandlers.push(() => process.off(signal, handler));
		}
	});
}
