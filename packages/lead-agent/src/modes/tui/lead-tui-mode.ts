import type { ModelRegistry } from "@mariozechner/pi-agent-host";
import type { SelectListTheme } from "@mariozechner/pi-tui";
import {
	CancellableLoader,
	Container,
	Editor,
	KeybindingsManager,
	ProcessTerminal,
	SelectList,
	setKeybindings,
	Text,
	TUI,
	TUI_KEYBINDINGS,
} from "@mariozechner/pi-tui";
import type { LeadAgentRunView } from "../../cli/output.js";
import { createLeadAgentRunView } from "../../cli/output.js";
import type {
	AcademicTaskType,
	LeadAgentModel,
	LeadAgentRunEvent,
	LeadAgentRuntime,
	ThinkingLevel,
} from "../../index.js";
import { FooterComponent } from "./components/footer.js";
import { createHeaderComponent } from "./components/header.js";
import {
	ErrorComponent,
	RunResultComponent,
	StreamingAssistantMessageComponent,
	UserQueryComponent,
} from "./components/messages.js";
import { DEFAULT_LEAD_TUI_KEYBINDINGS, type LeadTuiAction } from "./keybindings.js";
import { createLeadEditorTheme, createLeadMarkdownTheme, createLeadTuiTheme, type LeadTuiTheme } from "./theme.js";

export interface LeadTuiInitialStateOptions {
	sessionId: string;
	keybindings?: Record<LeadTuiAction, string>;
	initialModel?: LeadAgentModel;
	initialThinkingLevel?: ThinkingLevel;
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
	model?: LeadAgentModel;
	thinkingLevel?: ThinkingLevel;
	totalInputTokens: number;
	totalOutputTokens: number;
	totalCost: number;
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
		model: options.initialModel,
		thinkingLevel: options.initialThinkingLevel,
		totalInputTokens: 0,
		totalOutputTokens: 0,
		totalCost: 0,
	};
}

export interface RunLeadTuiModeOptions {
	runtime: LeadAgentRuntime;
	initialPrompt?: string;
	/** Model registry for /model command and model cycling. */
	modelRegistry?: ModelRegistry;
	/** Initially selected model (from --model CLI flag). */
	initialModel?: LeadAgentModel;
	/** Initially selected thinking level (from --thinking CLI flag). */
	initialThinkingLevel?: ThinkingLevel;
	/** Show expanded header on startup (passed from --verbose flag). */
	verbose?: boolean;
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
	footer: FooterComponent,
	theme: LeadTuiTheme,
	chatContainer: Container,
	options: RunLeadTuiModeOptions,
	tui: TUI,
): void {
	const [cmd, ...parts] = text.slice(1).trim().split(/\s+/);
	const value = parts.join(" ").trim();

	switch (cmd) {
		case "task-type": {
			const parsed = parseTuiAcademicTaskType(value);
			if (parsed) {
				state.taskType = parsed;
				footer.sync(state);
			} else {
				footer.setText(theme.error("task-type must be: writing|research|review|revision|methods|citation"));
			}
			break;
		}
		case "profile":
			state.profileId = value || undefined;
			footer.sync(state);
			break;
		case "expected-output":
			if (value.length > 0) {
				state.expectedOutputs = [value];
			}
			footer.sync(state);
			break;
		case "session": {
			const lines = [
				`session:          ${state.sessionId}`,
				`runs:             ${state.runCount}`,
				`task-type:        ${state.taskType ?? "(not set)"}`,
				`profile:          ${state.profileId ?? "(auto)"}`,
				`expected-outputs: ${state.expectedOutputs.length > 0 ? state.expectedOutputs.join(", ") : "(none)"}`,
				`model:            ${state.model ? `${state.model.provider}/${state.model.id}` : "(default)"}`,
				`thinking:         ${state.thinkingLevel ?? "(default)"}`,
			].join("\n");
			chatContainer.addChild(new Text(theme.dim(lines), 1, 0));
			break;
		}
		case "hotkeys": {
			const kb = state.keybindings;
			const lines = [
				`submit:             ${kb.submit}`,
				`cancel:             ${kb.cancel}`,
				`exit:               ${kb.exit}`,
				`help:               ${kb.help}`,
				`expand:             ${kb.expand}`,
				`modelCycleForward:  ${kb.modelCycleForward}`,
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
			footer.sync(state);
			break;
		case "model": {
			const registry = options.modelRegistry;
			if (!registry) {
				footer.setText(theme.error("No model registry available."));
				break;
			}
			const available = registry.getAvailable();
			if (!value) {
				// Show model selector overlay
				if (available.length === 0) {
					footer.setText(theme.error("No models available. Configure a provider first."));
				} else {
					const selectTheme: SelectListTheme = {
						selectedPrefix: (t: string) => theme.accent(t),
						selectedText: (t: string) => theme.accent(t),
						description: (t: string) => theme.dim(t),
						scrollInfo: (t: string) => theme.dim(t),
						noMatch: (t: string) => theme.dim(t),
					};
					const items = available.map((m) => ({
						value: `${m.provider}/${m.id}`,
						label: `${m.provider}/${m.id}`,
						description: m.provider,
					}));
					const list = new SelectList(items, 10, selectTheme);
					const overlayHandle = tui.showOverlay(list);
					list.onSelect = (item) => {
						const found = available.find((m) => `${m.provider}/${m.id}` === item.value);
						if (found) {
							state.model = found;
							options.runtime.setModel(found, state.thinkingLevel);
							footer.sync(state);
						}
						overlayHandle.hide();
						tui.requestRender();
					};
					list.onCancel = () => {
						overlayHandle.hide();
						tui.requestRender();
					};
				}
			} else {
				// Select model by pattern
				const lower = value.toLowerCase();
				const found = available.find(
					(m) =>
						`${m.provider}/${m.id}`.toLowerCase() === lower ||
						m.id.toLowerCase() === lower ||
						`${m.provider}/${m.id}`.toLowerCase().includes(lower) ||
						m.id.toLowerCase().includes(lower),
				);
				if (found) {
					state.model = found;
					options.runtime.setModel(found, state.thinkingLevel);
					footer.sync(state);
				} else {
					footer.setText(theme.error(`No model found matching "${value}". Use /model to list available models.`));
				}
			}
			break;
		}
		case "thinking": {
			const level = value.toLowerCase();
			if (
				level === "off" ||
				level === "minimal" ||
				level === "low" ||
				level === "medium" ||
				level === "high" ||
				level === "xhigh"
			) {
				state.thinkingLevel = level as ThinkingLevel;
				options.runtime.setModel(state.model, state.thinkingLevel);
				footer.sync(state);
			} else if (!level) {
				footer.setText(
					theme.dim(
						`thinking: ${state.thinkingLevel ?? "(default/off)"}. Use /thinking <off|minimal|low|medium|high|xhigh>`,
					),
				);
			} else {
				footer.setText(theme.error("thinking must be: off | minimal | low | medium | high | xhigh"));
			}
			break;
		}
		case "help":
			footer.setText(
				theme.dim(
					"/task-type · /profile · /expected-output · /model · /thinking · /session · /hotkeys · /new · /help",
				),
			);
			break;
		default:
			footer.setText(theme.error(`unknown command: /${cmd ?? ""} — type /help for commands`));
	}
}

function bindingToSequence(binding: string): string | undefined {
	const ctrlMatch = /^ctrl\+([a-z])$/i.exec(binding);
	if (ctrlMatch) {
		return String.fromCharCode(ctrlMatch[1]!.toLowerCase().charCodeAt(0) - 96);
	}
	return undefined;
}

export async function runLeadTuiMode(options: RunLeadTuiModeOptions): Promise<number> {
	const theme = createLeadTuiTheme();
	const markdownTheme = createLeadMarkdownTheme();
	const editorTheme = createLeadEditorTheme(theme);

	const state = createLeadTuiInitialState({
		sessionId: options.runtime.sessionManager.getSessionId(),
		initialModel: options.initialModel,
		initialThinkingLevel: options.initialThinkingLevel,
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
	const footer = new FooterComponent(theme, state);

	// Layout
	const header = createHeaderComponent(theme, state.keybindings.expand, options.verbose ?? false);
	tui.addChild(header);
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
			handleTuiSlashCommand(text, state, footer, theme, chatContainer, options, tui);
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

		// Streaming assistant message (live-updated during the run)
		const streamingComponent = new StreamingAssistantMessageComponent(theme, markdownTheme);
		chatContainer.addChild(streamingComponent);
		const workflowProgressLines: string[] = [];
		let assistantText = "";
		const updateStreamingText = () => {
			const parts = [workflowProgressLines.join("\n"), assistantText].filter((part) => part.trim().length > 0);
			streamingComponent.update(parts.join("\n\n"), theme);
			tui.requestRender();
		};

		// Show spinner
		const loader = new CancellableLoader(tui, theme.accent, theme.dim, "Running… (escape to interrupt)");
		loader.onAbort = () => {
			options.runtime.abort();
		};
		loaderContainer.addChild(loader);
		tui.requestRender();

		try {
			const result = await options.runtime.run({
				objective: text,
				taskType: state.taskType,
				profileId: state.profileId,
				expectedOutputs: state.expectedOutputs.length > 0 ? state.expectedOutputs : undefined,
				onEvent: (event: LeadAgentRunEvent) => {
					if (event.type === "direct_session") {
						if (event.event.type === "message_update" && event.event.message.role === "assistant") {
							const parts: string[] = [];
							for (const content of event.event.message.content) {
								if (content.type === "text" && content.text.length > 0) {
									parts.push(content.text);
								}
							}
							if (parts.length > 0) {
								assistantText = parts.join("");
								updateStreamingText();
							}
						} else if (event.event.type === "message_end" && event.event.message.role === "assistant") {
							const usage = (
								event.event.message as { usage?: { input: number; output: number; cost?: { total: number } } }
							).usage;
							if (usage) {
								state.totalInputTokens += usage.input;
								state.totalOutputTokens += usage.output;
								state.totalCost += usage.cost?.total ?? 0;
							}
						}
						return;
					}
					if (event.type === "plan_summary") {
						workflowProgressLines.push(event.summary);
						updateStreamingText();
						return;
					}
					if (event.type === "clarification_required") {
						workflowProgressLines.push(event.clarification.question);
						updateStreamingText();
						return;
					}
					if (
						event.type === "workflow_step_start" ||
						event.type === "workflow_step_retry" ||
						event.type === "workflow_step_complete"
					) {
						workflowProgressLines.push(event.message);
						updateStreamingText();
					}
				},
			});
			const view = createLeadAgentRunView(result);
			state.lastRun = view;
			state.runCount++;
			footer.sync(state);
			loader.stop();
			loaderContainer.clear();
			// Replace the streaming component with the final result
			chatContainer.removeChild(streamingComponent);
			chatContainer.addChild(new RunResultComponent(view, theme, markdownTheme));
		} catch (err) {
			loader.stop();
			loaderContainer.clear();
			chatContainer.removeChild(streamingComponent);
			if (err instanceof Error && err.name === "AbortError") {
				// User cancelled — no error card
			} else {
				const message = err instanceof Error ? err.message : String(err);
				chatContainer.addChild(new ErrorComponent(message, theme));
			}
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

		const expandSeq = bindingToSequence(state.keybindings.expand);
		const modelCycleSeq = bindingToSequence(state.keybindings.modelCycleForward);

		// Track current model index for Ctrl+P cycling
		const availableModels = options.modelRegistry?.getAvailable() ?? [];
		let currentModelIndex = state.model
			? availableModels.findIndex((m) => m.id === state.model!.id && m.provider === state.model!.provider)
			: -1;

		const removeInputListener = tui.addInputListener((data) => {
			if (expandSeq !== undefined && data === expandSeq) {
				header.toggle();
				tui.requestRender();
				return { consume: true };
			}
			if (modelCycleSeq !== undefined && data === modelCycleSeq && state.status !== "running") {
				if (availableModels.length > 0) {
					currentModelIndex = (currentModelIndex + 1) % availableModels.length;
					const selected = availableModels[currentModelIndex];
					if (selected) {
						state.model = selected;
						options.runtime.setModel(selected, state.thinkingLevel);
						footer.sync(state);
						tui.requestRender();
					}
				}
				return { consume: true };
			}
		});
		cleanupHandlers.push(removeInputListener);

		const finish = (exitCode: number) => {
			if (settled) return;
			settled = true;
			for (const cleanup of cleanupHandlers) cleanup();
			tui.stop();
			resolve(exitCode);
		};

		const signals: NodeJS.Signals[] = ["SIGTERM"];
		if (process.platform !== "win32") signals.push("SIGHUP");

		// SIGTERM and SIGHUP: immediate clean shutdown
		for (const signal of signals) {
			const handler = () => finish(0);
			process.once(signal, handler);
			cleanupHandlers.push(() => process.off(signal, handler));
		}

		// SIGINT (ctrl+c): first press clears editor, second press within 500ms exits
		let lastSigintTime = 0;
		const sigintHandler = () => {
			const now = Date.now();
			if (now - lastSigintTime < 500) {
				finish(130);
				return;
			}
			lastSigintTime = now;
			if (state.status !== "running") {
				editor.setText("");
				tui.requestRender();
			}
		};
		process.on("SIGINT", sigintHandler);
		cleanupHandlers.push(() => process.off("SIGINT", sigintHandler));
	});
}
