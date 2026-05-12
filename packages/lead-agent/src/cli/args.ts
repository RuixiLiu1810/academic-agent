export const LEAD_TASK_TYPES = ["auto", "writing", "research", "review", "revision", "methods", "citation"] as const;
export const LEAD_DISPATCH_MODES = ["auto", "direct", "worker"] as const;
export const LEAD_OUTPUT_MODES = ["markdown", "json"] as const;
export const LEAD_APP_MODES = ["markdown", "json", "interactive"] as const;
export const LEAD_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;

export type LeadCliTaskType = (typeof LEAD_TASK_TYPES)[number];
export type LeadCliDispatchMode = (typeof LEAD_DISPATCH_MODES)[number];
export type LeadCliOutputMode = (typeof LEAD_OUTPUT_MODES)[number];
export type LeadCliAppMode = (typeof LEAD_APP_MODES)[number];
export type LeadThinkingLevel = (typeof LEAD_THINKING_LEVELS)[number];

export function isValidThinkingLevel(value: string): value is LeadThinkingLevel {
	return LEAD_THINKING_LEVELS.includes(value as LeadThinkingLevel);
}

export interface LeadCliDiagnostic {
	type: "warning" | "error";
	message: string;
}

export interface LeadCliArgs {
	objectiveParts: string[];
	fileArgs: string[];
	constraints: string[];
	expectedOutputs: string[];
	acceptanceCriteria: string[];
	taskType?: LeadCliTaskType;
	profileId?: string;
	profileDir?: string;
	dispatchMode?: LeadCliDispatchMode;
	artifactDir?: string;
	sessionDir?: string;
	session?: string;
	fork?: string;
	continue?: boolean;
	resume?: boolean;
	noSession?: boolean;
	cwd?: string;
	outputMode: LeadCliOutputMode;
	appMode?: LeadCliAppMode;
	// Model & auth
	model?: string;
	provider?: string;
	apiKey?: string;
	thinking?: LeadThinkingLevel;
	models?: string[];
	// Tools
	tools?: string[];
	noTools?: boolean;
	noBuiltinTools?: boolean;
	// Listing
	listModels?: string | true;
	help: boolean;
	version: boolean;
	verbose: boolean;
	offline: boolean;
	diagnostics: LeadCliDiagnostic[];
}

function hasValue<T extends string>(values: readonly T[], value: string): value is T {
	return values.includes(value as T);
}

function missingValue(args: string[], index: number): boolean {
	const value = args[index + 1];
	return value === undefined || value.startsWith("--");
}

function readValue(
	args: string[],
	index: number,
	optionName: string,
	diagnostics: LeadCliDiagnostic[],
): string | undefined {
	if (missingValue(args, index)) {
		diagnostics.push({ type: "error", message: `${optionName} requires a value` });
		return undefined;
	}
	return args[index + 1];
}

export function parseLeadCliArgs(args: string[]): LeadCliArgs {
	const result: LeadCliArgs = {
		objectiveParts: [],
		fileArgs: [],
		constraints: [],
		expectedOutputs: [],
		acceptanceCriteria: [],
		outputMode: "markdown",
		help: false,
		version: false,
		verbose: false,
		offline: false,
		diagnostics: [],
	};

	for (let index = 0; index < args.length; index++) {
		const arg = args[index]!;
		if (arg === "--help" || arg === "-h") {
			result.help = true;
		} else if (arg === "--version" || arg === "-v") {
			result.version = true;
		} else if (arg === "--verbose") {
			result.verbose = true;
		} else if (arg === "--offline") {
			result.offline = true;
		} else if (arg === "--mode") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				if (hasValue(LEAD_APP_MODES, value)) {
					result.appMode = value;
					if (value === "json") {
						result.outputMode = "json";
					}
					if (value === "markdown") {
						result.outputMode = "markdown";
					}
				} else {
					result.diagnostics.push({
						type: "error",
						message: `Invalid mode "${value}". Valid values: ${LEAD_APP_MODES.join(", ")}`,
					});
				}
				index++;
			}
		} else if (arg === "--task-type") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				if (hasValue(LEAD_TASK_TYPES, value)) {
					result.taskType = value;
				} else {
					result.diagnostics.push({
						type: "error",
						message: `Invalid task type "${value}". Valid values: ${LEAD_TASK_TYPES.join(", ")}`,
					});
				}
				index++;
			}
		} else if (arg === "--profile") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				result.profileId = value;
				index++;
			}
		} else if (arg === "--profile-dir") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				result.profileDir = value;
				index++;
			}
		} else if (arg === "--dispatch") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				if (hasValue(LEAD_DISPATCH_MODES, value)) {
					result.dispatchMode = value;
				} else {
					result.diagnostics.push({
						type: "error",
						message: `Invalid dispatch mode "${value}". Valid values: ${LEAD_DISPATCH_MODES.join(", ")}`,
					});
				}
				index++;
			}
		} else if (arg === "--direct") {
			result.dispatchMode = "direct";
		} else if (arg === "--worker") {
			result.dispatchMode = "worker";
		} else if (arg === "--constraint") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				result.constraints.push(value);
				index++;
			}
		} else if (arg === "--expected-output") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				result.expectedOutputs.push(value);
				index++;
			}
		} else if (arg === "--acceptance") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				result.acceptanceCriteria.push(value);
				index++;
			}
		} else if (arg === "--artifact-dir") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				result.artifactDir = value;
				index++;
			}
		} else if (arg === "--session-dir") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				result.sessionDir = value;
				index++;
			}
		} else if (arg === "--continue" || arg === "-c") {
			result.continue = true;
		} else if (arg === "--resume" || arg === "-r") {
			result.resume = true;
		} else if (arg === "--session") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				result.session = value;
				index++;
			}
		} else if (arg === "--fork") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				result.fork = value;
				index++;
			}
		} else if (arg === "--no-session") {
			result.noSession = true;
		} else if (arg === "--model") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				result.model = value;
				index++;
			}
		} else if (arg === "--provider") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				result.provider = value;
				index++;
			}
		} else if (arg === "--api-key") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				result.apiKey = value;
				index++;
			}
		} else if (arg === "--thinking") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				if (isValidThinkingLevel(value)) {
					result.thinking = value;
				} else {
					result.diagnostics.push({
						type: "error",
						message: `Invalid thinking level "${value}". Valid values: ${LEAD_THINKING_LEVELS.join(", ")}`,
					});
				}
				index++;
			}
		} else if (arg === "--models") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				if (!result.models) result.models = [];
				result.models.push(value);
				index++;
			}
		} else if (arg === "--tools") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				if (!result.tools) result.tools = [];
				result.tools.push(
					...value
						.split(",")
						.map((t) => t.trim())
						.filter((t) => t.length > 0),
				);
				index++;
			}
		} else if (arg === "--no-tools") {
			result.noTools = true;
		} else if (arg === "--no-builtin-tools") {
			result.noBuiltinTools = true;
		} else if (arg === "--list-models") {
			// Optional pattern: if the next arg doesn't start with - use it as filter
			const next = args[index + 1];
			if (next !== undefined && !next.startsWith("-")) {
				result.listModels = next;
				index++;
			} else {
				result.listModels = true;
			}
		} else if (arg === "--cwd") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				result.cwd = value;
				index++;
			}
		} else if (arg === "--output") {
			const value = readValue(args, index, arg, result.diagnostics);
			if (value) {
				if (hasValue(LEAD_OUTPUT_MODES, value)) {
					result.outputMode = value;
				} else {
					result.diagnostics.push({
						type: "error",
						message: `Invalid output mode "${value}". Valid values: ${LEAD_OUTPUT_MODES.join(", ")}`,
					});
				}
				index++;
			}
		} else if (arg === "--json") {
			result.outputMode = "json";
			result.appMode = "json";
		} else if (arg === "--markdown") {
			result.outputMode = "markdown";
			result.appMode = "markdown";
		} else if (arg.startsWith("@")) {
			result.fileArgs.push(arg.slice(1));
		} else if (arg.startsWith("-")) {
			result.diagnostics.push({ type: "error", message: `Unknown option: ${arg}` });
		} else {
			result.objectiveParts.push(arg);
		}
	}

	return result;
}

export function leadCliHelp(): string {
	return `pi lead-agent - academic research and writing orchestrator

Usage:
  ./lead-agent-test.sh [options] <academic task>

Options:
  --mode <mode>              Run mode: markdown, json, or interactive
  --task-type <type>          Task type: auto, writing, research, review, revision, methods, citation
  --profile <id>              Force an academic profile id such as reviewer or citation-checker
  --profile-dir <path>        Load academic profiles from a Markdown directory
  --dispatch <mode>           Routing mode: auto, direct, worker
  --constraint <text>         Add a task constraint
  --expected-output <text>    Add an expected worker output
  --acceptance <text>         Add an acceptance criterion
  --artifact-dir <path>       Persist CLI artifacts to this directory
  --session-dir <path>        Persist lead-agent session JSONL files to this directory
  --continue, -c              Continue the most recent lead-agent session
  --resume, -r                Select a session to resume
  --session <path|id>         Use a specific session file or partial session id
  --fork <path|id>            Fork a specific session into a new lead session
  --no-session                Use an ephemeral in-memory session
  --cwd <path>                Working directory for the lead session
  --output <mode>             Output mode: markdown or json
  --json                      Alias for --output json
  --markdown                  Alias for --output markdown
  --direct                    Alias for --dispatch direct
  --worker                    Alias for --dispatch worker
  @file                       Include a file as academic context

Model & auth:
  --model <pattern>           Select model by id or provider/id pattern
  --provider <name>           Filter model selection to a specific provider
  --api-key <key>             API key to use for the selected provider
  --thinking <level>          Thinking level: off, minimal, low, medium, high, xhigh
  --models <pattern>          Add model to cycling list (can repeat)
  --list-models [pattern]     List available models, optionally filtered

Tools:
  --tools <list>              Enable specific tools (comma-separated)
  --no-tools                  Disable all tools (default for direct mode)
  --no-builtin-tools          Disable built-in tools only

  --version, -v               Print version and exit
  --verbose                   Show verbose startup output
  --offline                   Offline mode (sets PI_OFFLINE=1)
  --help, -h                  Show this help

If no task argument is provided, the task is read from stdin.

Environment variables:
  ANTHROPIC_API_KEY            - Anthropic API key
  OPENAI_API_KEY               - OpenAI API key
  ANTHROPIC_OAUTH_TOKEN        - Anthropic OAuth token (alternative to API key)`;
}
