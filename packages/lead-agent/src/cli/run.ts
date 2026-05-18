import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createAgentHostServices, type ModelRegistry } from "@mariozechner/pi-agent-host";
import {
	type AcademicTaskType,
	createLeadAgentRuntime,
	type LeadAgentDirectRunner,
	type LeadAgentDispatchMode,
	type LeadAgentModel,
	type LeadAgentTaskRequest,
	type LeadAgentWorkerRunner,
	loadAcademicProfilesFromDir,
} from "../index.js";
import { runLeadInteractiveLoop } from "../modes/interactive-loop.js";
import { runLeadTuiMode } from "../modes/tui/lead-tui-mode.js";
import { type LeadCliArgs, leadCliHelp, parseLeadCliArgs } from "./args.js";
import { persistLeadCliArtifacts } from "./artifacts.js";
import { fileInputsToMetadata, type LeadCliFileInput, readLeadCliFileInputs } from "./file-input.js";
import { listLeadModels } from "./list-models.js";
import { createLeadAgentRunView, renderLeadAgentJson, renderLeadAgentMarkdown } from "./output.js";
import { createLeadCliSessionManager } from "./session.js";

export interface LeadAgentCliIo {
	stdin?: string;
	stdout?: (text: string) => void;
	stderr?: (text: string) => void;
	workerRunner?: LeadAgentWorkerRunner;
	directRunner?: LeadAgentDirectRunner;
}

/**
 * Resolve a model pattern + optional provider to a model entry from the registry.
 * Returns undefined if no pattern given or no match found.
 */
function resolveModel(
	modelRegistry: ModelRegistry,
	modelPattern?: string,
	provider?: string,
): LeadAgentModel | undefined {
	if (!modelPattern && !provider) return undefined;
	const available = modelRegistry.getAvailable();
	if (available.length === 0) return undefined;

	// Build a combined pattern like "provider/modelPattern" if both given
	const pattern = modelPattern && provider ? `${provider}/${modelPattern}` : (modelPattern ?? provider ?? "");
	const lower = pattern.toLowerCase();

	// Prefer canonical exact match (provider/id)
	const canonical = available.find((m) => `${m.provider}/${m.id}`.toLowerCase() === lower);
	if (canonical) return canonical;

	// Filter by provider if specified, then match by id substring
	const pool = provider ? available.filter((m) => m.provider.toLowerCase() === provider.toLowerCase()) : available;
	const matches = pool.filter(
		(m) =>
			m.id.toLowerCase().includes(lower) ||
			`${m.provider}/${m.id}`.toLowerCase().includes(lower) ||
			(m.name ?? "").toLowerCase().includes(lower),
	);
	if (matches.length === 0) return undefined;
	// Prefer alias (no date suffix)
	const aliases = matches.filter((m) => !/-\d{8}$/.test(m.id));
	return aliases.length > 0 ? aliases[0] : matches[0];
}

function readProcessStdin(): string {
	if (process.stdin.isTTY) {
		return "";
	}
	return readFileSync(0, "utf8");
}

function readObjective(objectiveParts: string[], stdin: string | undefined): string {
	const objective = objectiveParts.join(" ").trim();
	if (objective.length > 0) {
		return objective;
	}
	return (stdin ?? readProcessStdin()).trim();
}

function stdinLines(stdin: string | undefined): string[] | undefined {
	return stdin
		?.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

function interactiveInputLines(stdin: string | undefined): string[] | undefined {
	if (stdin !== undefined) {
		return stdinLines(stdin);
	}
	if (!process.stdin.isTTY) {
		return stdinLines(readProcessStdin());
	}
	return undefined;
}

function toTaskType(value: string | undefined): AcademicTaskType | undefined {
	if (!value || value === "auto") {
		return undefined;
	}
	return value as AcademicTaskType;
}

function toDispatchMode(value: string | undefined): LeadAgentDispatchMode | undefined {
	if (!value || value === "auto") {
		return undefined;
	}
	return value as LeadAgentDispatchMode;
}

function createTaskRequest(
	objective: string,
	args: LeadCliArgs,
	fileInputs: readonly LeadCliFileInput[],
): LeadAgentTaskRequest {
	const request: LeadAgentTaskRequest = { objective };
	const fileConstraints = fileInputs.map((input) => input.constraint);
	const constraints = [...args.constraints, ...fileConstraints];
	if (constraints.length > 0) {
		request.constraints = constraints;
	}
	if (args.expectedOutputs.length > 0) {
		request.expectedOutputs = args.expectedOutputs;
	}
	if (args.acceptanceCriteria.length > 0) {
		request.acceptanceCriteria = args.acceptanceCriteria;
	}
	const taskType = toTaskType(args.taskType);
	if (taskType) {
		request.taskType = taskType;
	}
	if (args.profileId) {
		request.profileId = args.profileId;
	}
	const dispatchMode = toDispatchMode(args.dispatchMode);
	if (dispatchMode) {
		request.dispatchMode = dispatchMode;
	}
	if (fileInputs.length > 0) {
		request.metadata = fileInputsToMetadata(fileInputs);
	}
	return request;
}

export async function runLeadAgentCli(argv: string[], io: LeadAgentCliIo = {}): Promise<number> {
	const stdout = io.stdout ?? ((text: string) => process.stdout.write(text));
	const stderr = io.stderr ?? ((text: string) => process.stderr.write(text));
	const args = parseLeadCliArgs(argv);
	if (args.help) {
		stdout(`${leadCliHelp()}\n`);
		return 0;
	}
	if (args.version) {
		const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8")) as {
			version: string;
		};
		stdout(`${pkg.version}\n`);
		return 0;
	}
	if (args.offline) {
		process.env.PI_OFFLINE = "1";
	}
	if (args.diagnostics.some((diagnostic) => diagnostic.type === "error")) {
		for (const diagnostic of args.diagnostics) {
			stderr(`${diagnostic.type}: ${diagnostic.message}\n`);
		}
		return 1;
	}
	const cwd = args.cwd ?? process.cwd();

	// Create agent-host services to access the model registry and auth storage
	const services = await createAgentHostServices({ cwd });
	const modelRegistry = services.modelRegistry;

	// Handle --list-models
	if (args.listModels) {
		const pattern = args.listModels === true ? undefined : args.listModels;
		await listLeadModels(modelRegistry, pattern);
		return 0;
	}

	// Resolve model from --model / --provider flags, falling back to agent-host defaults.
	let resolvedModel: LeadAgentModel | undefined;
	if (args.model !== undefined || args.provider !== undefined) {
		resolvedModel = resolveModel(modelRegistry, args.model, args.provider);
		if (!resolvedModel && (args.model ?? args.provider)) {
			const pattern = [args.provider, args.model].filter(Boolean).join("/");
			stderr(`No model found matching "${pattern}". Use --list-models to see available models.\n`);
			return 1;
		}
	} else {
		resolvedModel = resolveModel(
			modelRegistry,
			services.settingsManager.getDefaultModel(),
			services.settingsManager.getDefaultProvider(),
		);
	}
	const resolvedThinkingLevel = args.thinking ?? services.settingsManager.getDefaultThinkingLevel();

	// Resolve tool configuration
	let toolsArg: string[] | undefined;
	let noToolsArg: "all" | "builtin" | undefined;
	if (args.tools && args.tools.length > 0) {
		toolsArg = args.tools;
	} else if (args.noBuiltinTools) {
		noToolsArg = "builtin";
	} else if (args.noTools) {
		noToolsArg = "all";
	}
	// Default: no tools ("all" disabled) — callers that want tools must pass --tools explicitly

	const profiles = args.profileDir ? loadAcademicProfilesFromDir(args.profileDir) : undefined;
	const sessionManager = await createLeadCliSessionManager({
		cwd,
		sessionDir: args.sessionDir,
		noSession: args.noSession,
		continue: args.continue,
		resume: args.resume,
		session: args.session,
		fork: args.fork,
	});
	const runtime = createLeadAgentRuntime({
		cwd,
		profiles,
		sessionManager,
		workerRunner: io.workerRunner,
		directRunner: io.directRunner,
		artifactDir: args.artifactDir,
		confirmPlan: args.confirmPlan,
		model: resolvedModel,
		thinkingLevel: resolvedThinkingLevel,
		tools: toolsArg,
		noTools: noToolsArg,
	});
	if (args.appMode === "interactive") {
		if (io.stdin === undefined && process.stdin.isTTY) {
			return runLeadTuiMode({
				runtime,
				initialPrompt: args.objectiveParts.join(" ").trim() || undefined,
				modelRegistry,
				initialModel: resolvedModel,
				initialThinkingLevel: resolvedThinkingLevel,
				settingsManager: services.settingsManager,
				verbose: args.verbose,
			});
		}
		return runLeadInteractiveLoop({
			runtime,
			inputs: interactiveInputLines(io.stdin),
			stdout,
			stderr,
			defaultTaskType: toTaskType(args.taskType),
			defaultProfileId: args.profileId,
			defaultExpectedOutputs: args.expectedOutputs,
			model: resolvedModel,
			thinkingLevel: resolvedThinkingLevel,
		});
	}
	const objective = readObjective(args.objectiveParts, io.stdin);
	if (objective.length === 0) {
		if (process.stdin.isTTY) {
			return runLeadTuiMode({
				runtime,
				modelRegistry,
				initialModel: resolvedModel,
				initialThinkingLevel: resolvedThinkingLevel,
				settingsManager: services.settingsManager,
				verbose: args.verbose,
			});
		}
		stderr(`${leadCliHelp()}\n`);
		return 1;
	}
	const fileInputs = readLeadCliFileInputs(cwd, args.fileArgs);
	const result = await runtime.run(createTaskRequest(objective, args, fileInputs));
	const persisted = args.artifactDir ? persistLeadCliArtifacts(result, args.artifactDir) : undefined;
	const view = createLeadAgentRunView(result, {
		artifactManifestPath: persisted?.manifestPath,
	});
	stdout(args.outputMode === "json" ? renderLeadAgentJson(view) : renderLeadAgentMarkdown(view));
	return result.acceptanceReport && !result.acceptanceReport.accepted ? 2 : 0;
}
