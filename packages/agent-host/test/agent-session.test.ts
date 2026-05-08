import { Agent } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import { AgentSession } from "../src/agent-session.js";
import { createAgentSessionFromServices } from "../src/agent-session-services.js";
import { AuthStorage } from "../src/auth-storage.js";
import { createExtensionRuntime } from "../src/extensions.js";
import { ModelRegistry } from "../src/model-registry.js";
import type { ResourceLoader } from "../src/resource-loader.js";
import { SessionManager } from "../src/session-manager.js";
import { SettingsManager } from "../src/settings-manager.js";

function createTestResourceLoader(): ResourceLoader {
	const extensionsResult = {
		extensions: [],
		errors: [],
		runtime: createExtensionRuntime(),
	};

	return {
		getExtensions: () => extensionsResult,
		getSkills: () => ({ skills: [], diagnostics: [] }),
		getPrompts: () => ({ prompts: [], diagnostics: [] }),
		getThemes: () => ({ themes: [], diagnostics: [] }),
		getAgentsFiles: () => ({ agentsFiles: [] }),
		getSystemPrompt: () => undefined,
		getAppendSystemPrompt: () => [],
		extendResources: () => {},
		reload: async () => {},
	};
}

function createSession(): AgentSession {
	const authStorage = AuthStorage.inMemory();
	const modelRegistry = ModelRegistry.inMemory(authStorage);

	return new AgentSession({
		agent: new Agent({
			initialState: {
				systemPrompt: "You are a host test agent.",
				tools: [],
				thinkingLevel: "off",
			},
		}),
		sessionManager: SessionManager.inMemory(),
		settingsManager: SettingsManager.inMemory(),
		cwd: process.cwd(),
		resourceLoader: createTestResourceLoader(),
		modelRegistry,
	});
}

describe("agent-host AgentSession", () => {
	it("defaults to no built-in tools in the generic host", () => {
		const session = createSession();

		try {
			expect(session.getActiveToolNames()).toEqual([]);
			expect(session.getAllTools()).toEqual([]);
		} finally {
			session.dispose();
		}
	});

	it("throws a clear error when bash execution is not configured", async () => {
		const session = createSession();

		try {
			await expect(session.executeBash("echo hello")).rejects.toThrow(
				"Bash execution is not configured for this host. Provide options.operations or createDefaultBashOperations.",
			);
		} finally {
			session.dispose();
		}
	});

	it("throws a clear error when HTML export is not configured", async () => {
		const session = createSession();

		try {
			await expect(session.exportToHtml()).rejects.toThrow(
				"HTML export is not configured for this host. Provide htmlExporter.",
			);
		} finally {
			session.dispose();
		}
	});

	it("creates a generic host session without coding-agent defaults", async () => {
		const authStorage = AuthStorage.inMemory();
		const modelRegistry = ModelRegistry.inMemory(authStorage);
		const sessionManager = SessionManager.inMemory();
		const settingsManager = SettingsManager.inMemory();

		const result = await createAgentSessionFromServices({
			services: {
				cwd: process.cwd(),
				agentDir: process.cwd(),
				authStorage,
				settingsManager,
				modelRegistry,
				resourceLoader: createTestResourceLoader(),
				diagnostics: [],
			},
			sessionManager,
		});

		try {
			expect(result.session.getActiveToolNames()).toEqual([]);
			expect(result.session.getAllTools()).toEqual([]);
			expect(result.modelFallbackMessage).toContain("No model selected.");
		} finally {
			result.session.dispose();
		}
	});
});
