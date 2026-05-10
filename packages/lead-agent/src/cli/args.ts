export const LEAD_TASK_TYPES = ["auto", "writing", "research", "review", "revision", "methods", "citation"] as const;
export const LEAD_DISPATCH_MODES = ["auto", "direct", "worker"] as const;
export const LEAD_OUTPUT_MODES = ["markdown", "json"] as const;

export type LeadCliTaskType = (typeof LEAD_TASK_TYPES)[number];
export type LeadCliDispatchMode = (typeof LEAD_DISPATCH_MODES)[number];
export type LeadCliOutputMode = (typeof LEAD_OUTPUT_MODES)[number];

export interface LeadCliDiagnostic {
	type: "warning" | "error";
	message: string;
}

export interface LeadCliArgs {
	objectiveParts: string[];
	constraints: string[];
	expectedOutputs: string[];
	acceptanceCriteria: string[];
	taskType?: LeadCliTaskType;
	profileId?: string;
	profileDir?: string;
	dispatchMode?: LeadCliDispatchMode;
	artifactDir?: string;
	sessionDir?: string;
	cwd?: string;
	outputMode: LeadCliOutputMode;
	help: boolean;
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
		constraints: [],
		expectedOutputs: [],
		acceptanceCriteria: [],
		outputMode: "markdown",
		help: false,
		diagnostics: [],
	};

	for (let index = 0; index < args.length; index++) {
		const arg = args[index]!;
		if (arg === "--help" || arg === "-h") {
			result.help = true;
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
		} else if (arg === "--markdown") {
			result.outputMode = "markdown";
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
  --task-type <type>          Task type: auto, writing, research, review, revision, methods, citation
  --profile <id>              Force an academic profile id such as reviewer or citation-checker
  --profile-dir <path>        Load academic profiles from a Markdown directory
  --dispatch <mode>           Routing mode: auto, direct, worker
  --constraint <text>         Add a task constraint
  --expected-output <text>    Add an expected worker output
  --acceptance <text>         Add an acceptance criterion
  --artifact-dir <path>       Persist CLI artifacts to this directory
  --session-dir <path>        Persist lead-agent session JSONL files to this directory
  --cwd <path>                Working directory for the lead session
  --output <mode>             Output mode: markdown or json
  --json                      Alias for --output json
  --markdown                  Alias for --output markdown
  --direct                    Alias for --dispatch direct
  --worker                    Alias for --dispatch worker
  --help, -h                  Show this help

If no task argument is provided, the task is read from stdin.`;
}
