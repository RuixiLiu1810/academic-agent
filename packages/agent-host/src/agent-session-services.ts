import { join } from "node:path";
import { Agent, type AgentMessage, type ThinkingLevel } from "@mariozechner/pi-agent-core";
import { clampThinkingLevel, type Message, type Model, streamSimple } from "@mariozechner/pi-ai";
import { AgentSession } from "./agent-session.js";
import { formatNoModelSelectedMessage } from "./auth-guidance.js";
import { AuthStorage } from "./auth-storage.js";
import { getAgentDir } from "./config.js";
import { DEFAULT_THINKING_LEVEL } from "./defaults.js";
import type { ExtensionRunner, LoadExtensionsResult, SessionStartEvent, ToolDefinition } from "./extensions.js";
import { convertToLlm } from "./messages.js";
import { ModelRegistry } from "./model-registry.js";
import { DefaultResourceLoader, type DefaultResourceLoaderOptions, type ResourceLoader } from "./resource-loader.js";
import { getDefaultSessionDir, SessionManager } from "./session-manager.js";
import { SettingsManager } from "./settings-manager.js";

export interface AgentSessionRuntimeDiagnostic {
	type: "info" | "warning" | "error";
	message: string;
}

export interface CreateAgentSessionServicesOptions {
	cwd: string;
	agentDir?: string;
	authStorage?: AuthStorage;
	settingsManager?: SettingsManager;
	modelRegistry?: ModelRegistry;
	extensionFlagValues?: Map<string, boolean | string>;
	resourceLoaderOptions?: Omit<DefaultResourceLoaderOptions, "cwd" | "agentDir" | "settingsManager">;
}

export interface CreateAgentSessionFromServicesOptions {
	services: AgentSessionServices;
	sessionManager: SessionManager;
	sessionStartEvent?: SessionStartEvent;
	model?: Model<any>;
	thinkingLevel?: ThinkingLevel;
	scopedModels?: Array<{ model: Model<any>; thinkingLevel?: ThinkingLevel }>;
	tools?: string[];
	noTools?: "all" | "builtin";
	customTools?: ToolDefinition[];
}

export interface CreateAgentSessionOptions {
	cwd?: string;
	agentDir?: string;
	authStorage?: AuthStorage;
	settingsManager?: SettingsManager;
	modelRegistry?: ModelRegistry;
	resourceLoader?: ResourceLoader;
	sessionManager?: SessionManager;
	sessionStartEvent?: SessionStartEvent;
	model?: Model<any>;
	thinkingLevel?: ThinkingLevel;
	scopedModels?: Array<{ model: Model<any>; thinkingLevel?: ThinkingLevel }>;
	tools?: string[];
	noTools?: "all" | "builtin";
	customTools?: ToolDefinition[];
}

export interface CreateAgentSessionResult {
	session: AgentSession;
	extensionsResult: LoadExtensionsResult;
	modelFallbackMessage?: string;
}

export interface AgentSessionServices {
	cwd: string;
	agentDir: string;
	authStorage: AuthStorage;
	settingsManager: SettingsManager;
	modelRegistry: ModelRegistry;
	resourceLoader: ResourceLoader;
	diagnostics: AgentSessionRuntimeDiagnostic[];
}

function applyExtensionFlagValues(
	resourceLoader: ResourceLoader,
	extensionFlagValues: Map<string, boolean | string> | undefined,
): AgentSessionRuntimeDiagnostic[] {
	if (!extensionFlagValues) {
		return [];
	}

	const diagnostics: AgentSessionRuntimeDiagnostic[] = [];
	const extensionsResult = resourceLoader.getExtensions();
	const registeredFlags = new Map<string, { type: "boolean" | "string" }>();
	for (const extension of extensionsResult.extensions) {
		for (const [name, flag] of extension.flags) {
			registeredFlags.set(name, { type: flag.type });
		}
	}

	const unknownFlags: string[] = [];
	for (const [name, value] of extensionFlagValues) {
		const flag = registeredFlags.get(name);
		if (!flag) {
			unknownFlags.push(name);
			continue;
		}
		if (flag.type === "boolean") {
			extensionsResult.runtime.flagValues.set(name, true);
			continue;
		}
		if (typeof value === "string") {
			extensionsResult.runtime.flagValues.set(name, value);
			continue;
		}
		diagnostics.push({
			type: "error",
			message: `Extension flag "--${name}" requires a value`,
		});
	}

	if (unknownFlags.length > 0) {
		diagnostics.push({
			type: "error",
			message: `Unknown option${unknownFlags.length === 1 ? "" : "s"}: ${unknownFlags.map((name) => `--${name}`).join(", ")}`,
		});
	}

	return diagnostics;
}

export async function createAgentSessionServices(
	options: CreateAgentSessionServicesOptions,
): Promise<AgentSessionServices> {
	const cwd = options.cwd;
	const agentDir = options.agentDir ?? getAgentDir();
	const authStorage = options.authStorage ?? AuthStorage.create(join(agentDir, "auth.json"));
	const settingsManager = options.settingsManager ?? SettingsManager.create(cwd, agentDir);
	const modelRegistry = options.modelRegistry ?? ModelRegistry.create(authStorage, join(agentDir, "models.json"));
	const resourceLoader = new DefaultResourceLoader({
		...(options.resourceLoaderOptions ?? {}),
		cwd,
		agentDir,
		settingsManager,
	});
	await resourceLoader.reload();

	const diagnostics: AgentSessionRuntimeDiagnostic[] = [];
	const extensionsResult = resourceLoader.getExtensions();
	for (const { name, config, extensionPath } of extensionsResult.runtime.pendingProviderRegistrations) {
		try {
			modelRegistry.registerProvider(name, config);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			diagnostics.push({
				type: "error",
				message: `Extension "${extensionPath}" error: ${message}`,
			});
		}
	}
	extensionsResult.runtime.pendingProviderRegistrations = [];
	diagnostics.push(...applyExtensionFlagValues(resourceLoader, options.extensionFlagValues));

	return {
		cwd,
		agentDir,
		authStorage,
		settingsManager,
		modelRegistry,
		resourceLoader,
		diagnostics,
	};
}

export async function createAgentSessionFromServices(
	options: CreateAgentSessionFromServicesOptions,
): Promise<CreateAgentSessionResult> {
	let model = options.model;
	let modelFallbackMessage: string | undefined;
	const existingSession = options.sessionManager.buildSessionContext();
	const hasExistingSession = existingSession.messages.length > 0;
	const hasThinkingEntry = options.sessionManager.getBranch().some((entry) => entry.type === "thinking_level_change");

	if (!model && hasExistingSession && existingSession.model) {
		const restoredModel = options.services.modelRegistry.find(
			existingSession.model.provider,
			existingSession.model.modelId,
		);
		if (restoredModel && options.services.modelRegistry.hasConfiguredAuth(restoredModel)) {
			model = restoredModel;
		} else {
			modelFallbackMessage = `Could not restore model ${existingSession.model.provider}/${existingSession.model.modelId}`;
		}
	}

	let thinkingLevel = options.thinkingLevel;
	if (thinkingLevel === undefined && hasExistingSession) {
		thinkingLevel = hasThinkingEntry
			? (existingSession.thinkingLevel as ThinkingLevel)
			: (options.services.settingsManager.getDefaultThinkingLevel() ?? DEFAULT_THINKING_LEVEL);
	}

	if (!model) {
		if (options.scopedModels && options.scopedModels.length > 0 && !hasExistingSession) {
			model = options.scopedModels[0].model;
			thinkingLevel = options.scopedModels[0].thinkingLevel ?? thinkingLevel ?? DEFAULT_THINKING_LEVEL;
		} else {
			const defaultProvider = options.services.settingsManager.getDefaultProvider();
			const defaultModelId = options.services.settingsManager.getDefaultModel();
			if (defaultProvider && defaultModelId) {
				model = options.services.modelRegistry.find(defaultProvider, defaultModelId);
			}
			if (!model) {
				const availableModels = await options.services.modelRegistry.getAvailable();
				model = availableModels[0];
			}
		}
	}

	if (thinkingLevel === undefined) {
		thinkingLevel = options.services.settingsManager.getDefaultThinkingLevel() ?? DEFAULT_THINKING_LEVEL;
	}

	if (!model) {
		thinkingLevel = "off";
		modelFallbackMessage = modelFallbackMessage
			? `${modelFallbackMessage}. ${formatNoModelSelectedMessage()}`
			: formatNoModelSelectedMessage();
	} else {
		thinkingLevel = clampThinkingLevel(model, thinkingLevel) as ThinkingLevel;
		if (modelFallbackMessage) {
			modelFallbackMessage += `. Using ${model.provider}/${model.id}`;
		}
	}

	const allowedToolNames = options.tools ?? (options.noTools === "all" ? [] : undefined);
	const initialActiveToolNames = options.tools ? [...options.tools] : [];
	const extensionRunnerRef: { current?: ExtensionRunner } = {};
	const convertToLlmWithBlockImages = (messages: AgentMessage[]): Message[] => {
		const converted = convertToLlm(messages);
		if (!options.services.settingsManager.getBlockImages()) {
			return converted;
		}

		return converted.map((message) => {
			if (message.role !== "user" && message.role !== "toolResult") {
				return message;
			}

			if (!Array.isArray(message.content)) {
				return message;
			}

			const hasImages = message.content.some((item) => item.type === "image");
			if (!hasImages) {
				return message;
			}

			const filteredContent = message.content
				.map((item) =>
					item.type === "image" ? { type: "text" as const, text: "Image reading is disabled." } : item,
				)
				.filter(
					(item, index, array) =>
						!(
							item.type === "text" &&
							item.text === "Image reading is disabled." &&
							index > 0 &&
							array[index - 1].type === "text" &&
							(array[index - 1] as { type: "text"; text: string }).text === "Image reading is disabled."
						),
				);

			return { ...message, content: filteredContent };
		});
	};

	const providerRetrySettings = options.services.settingsManager.getProviderRetrySettings();
	const agent = new Agent({
		initialState: {
			systemPrompt: "",
			model,
			thinkingLevel,
			tools: [],
		},
		convertToLlm: convertToLlmWithBlockImages,
		streamFn: async (resolvedModel, context, streamOptions) => {
			const auth = await options.services.modelRegistry.getApiKeyAndHeaders(resolvedModel);
			if (!auth.ok) {
				throw new Error(auth.error);
			}

			return streamSimple(resolvedModel, context, {
				...streamOptions,
				apiKey: auth.apiKey,
				timeoutMs: streamOptions?.timeoutMs ?? providerRetrySettings.timeoutMs,
				maxRetries: streamOptions?.maxRetries ?? providerRetrySettings.maxRetries,
				maxRetryDelayMs: streamOptions?.maxRetryDelayMs ?? providerRetrySettings.maxRetryDelayMs,
				headers:
					auth.headers || streamOptions?.headers ? { ...auth.headers, ...streamOptions?.headers } : undefined,
			});
		},
		onPayload: async (payload) => {
			if (!extensionRunnerRef.current?.hasHandlers("before_provider_request")) {
				return payload;
			}

			return extensionRunnerRef.current.emitBeforeProviderRequest(payload);
		},
		onResponse: async (response) => {
			if (!extensionRunnerRef.current?.hasHandlers("after_provider_response")) {
				return;
			}

			await extensionRunnerRef.current.emit({
				type: "after_provider_response",
				status: response.status,
				headers: response.headers,
			});
		},
		sessionId: options.sessionManager.getSessionId(),
		transformContext: async (messages) => {
			if (!extensionRunnerRef.current) {
				return messages;
			}

			return extensionRunnerRef.current.emitContext(messages);
		},
		steeringMode: options.services.settingsManager.getSteeringMode(),
		followUpMode: options.services.settingsManager.getFollowUpMode(),
		transport: options.services.settingsManager.getTransport(),
		thinkingBudgets: options.services.settingsManager.getThinkingBudgets(),
		maxRetryDelayMs: providerRetrySettings.maxRetryDelayMs,
	});

	if (hasExistingSession) {
		agent.state.messages = existingSession.messages;
		if (!hasThinkingEntry) {
			options.sessionManager.appendThinkingLevelChange(thinkingLevel);
		}
	} else {
		if (model) {
			options.sessionManager.appendModelChange(model.provider, model.id);
		}
		options.sessionManager.appendThinkingLevelChange(thinkingLevel);
	}

	const session = new AgentSession({
		agent,
		sessionManager: options.sessionManager,
		settingsManager: options.services.settingsManager,
		cwd: options.services.cwd,
		scopedModels: options.scopedModels,
		resourceLoader: options.services.resourceLoader,
		customTools: options.customTools,
		modelRegistry: options.services.modelRegistry,
		initialActiveToolNames,
		allowedToolNames,
		extensionRunnerRef,
		sessionStartEvent: options.sessionStartEvent,
	});

	return {
		session,
		extensionsResult: options.services.resourceLoader.getExtensions(),
		modelFallbackMessage,
	};
}

export async function createAgentSession(options: CreateAgentSessionOptions = {}): Promise<CreateAgentSessionResult> {
	const cwd = options.cwd ?? options.sessionManager?.getCwd() ?? process.cwd();
	const agentDir = options.agentDir ?? getAgentDir();
	const authStorage = options.authStorage ?? AuthStorage.create(join(agentDir, "auth.json"));
	const settingsManager = options.settingsManager ?? SettingsManager.create(cwd, agentDir);
	const modelRegistry = options.modelRegistry ?? ModelRegistry.create(authStorage, join(agentDir, "models.json"));
	const resourceLoader =
		options.resourceLoader ??
		new DefaultResourceLoader({
			cwd,
			agentDir,
			settingsManager,
		});
	if (!options.resourceLoader) {
		await resourceLoader.reload();
	}

	const sessionManager = options.sessionManager ?? SessionManager.create(cwd, getDefaultSessionDir(cwd, agentDir));
	return createAgentSessionFromServices({
		services: {
			cwd,
			agentDir,
			authStorage,
			settingsManager,
			modelRegistry,
			resourceLoader,
			diagnostics: [],
		},
		sessionManager,
		sessionStartEvent: options.sessionStartEvent,
		model: options.model,
		thinkingLevel: options.thinkingLevel,
		scopedModels: options.scopedModels,
		tools: options.tools,
		noTools: options.noTools,
		customTools: options.customTools,
	});
}
