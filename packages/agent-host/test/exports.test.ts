import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as agentSessionServices from "../src/agent-session-services.js";
import * as diagnostics from "../src/diagnostics.js";
import * as footerDataProvider from "../src/footer-data-provider.js";
import {
	AuthStorage,
	createAgentHostRuntime,
	createAgentHostSession,
	createEventBus,
	createExtensionRuntime,
	createSyntheticSourceInfo,
	DefaultPackageManager,
	DefaultResourceLoader,
	formatSkillsForPrompt,
	loadProjectContextFiles,
	loadPromptTemplates,
	loadSkills,
	loadSkillsFromDir,
	ModelRegistry,
	SessionManager,
	SettingsManager,
} from "../src/index.js";
import * as keybindings from "../src/keybindings.js";
import * as outputGuard from "../src/output-guard.js";
import * as providerDisplayNames from "../src/provider-display-names.js";
import * as sessionCwd from "../src/session-cwd.js";
import * as slashCommands from "../src/slash-commands.js";
import * as systemPrompt from "../src/system-prompt.js";

describe("agent-host facade", () => {
	it("exports stable host aliases", () => {
		expect(createAgentHostSession).toBeTypeOf("function");
		expect(createAgentHostRuntime).toBeTypeOf("function");
		expect(SessionManager.inMemory).toBeTypeOf("function");
		expect(SettingsManager.inMemory).toBeTypeOf("function");
		expect(AuthStorage.inMemory).toBeTypeOf("function");
		expect(ModelRegistry.inMemory).toBeTypeOf("function");
		expect(createEventBus).toBeTypeOf("function");
	});

	it("exports resource loading APIs from the root module", () => {
		expect(DefaultPackageManager).toBeTypeOf("function");
		expect(DefaultResourceLoader).toBeTypeOf("function");
		expect(loadProjectContextFiles).toBeTypeOf("function");
		expect(loadSkills).toBeTypeOf("function");
		expect(loadSkillsFromDir).toBeTypeOf("function");
		expect(formatSkillsForPrompt).toBeTypeOf("function");
		expect(loadPromptTemplates).toBeTypeOf("function");
		expect(createSyntheticSourceInfo).toBeTypeOf("function");
		expect(createExtensionRuntime).toBeTypeOf("function");
	});

	it("provides dedicated subpath modules for host resource primitives", async () => {
		const [
			packageManager,
			sourceInfo,
			skills,
			promptTemplates,
			resourceLoader,
			resolveConfigValue,
			extensions,
			compaction,
			exec,
		] = await Promise.all([
			import("../src/package-manager.js"),
			import("../src/source-info.js"),
			import("../src/skills.js"),
			import("../src/prompt-templates.js"),
			import("../src/resource-loader.js"),
			import("../src/resolve-config-value.js"),
			import("../src/extensions.js"),
			import("../src/compaction/index.js"),
			import("../src/exec.js"),
		]);

		expect(packageManager.DefaultPackageManager).toBeTypeOf("function");
		expect(sourceInfo.createSyntheticSourceInfo).toBeTypeOf("function");
		expect(skills.loadSkills).toBeTypeOf("function");
		expect(promptTemplates.loadPromptTemplates).toBeTypeOf("function");
		expect(resourceLoader.DefaultResourceLoader).toBeTypeOf("function");
		expect(resolveConfigValue.resolveConfigValue).toBeTypeOf("function");
		expect(extensions.createExtensionRuntime).toBeTypeOf("function");
		expect(compaction.compact).toBeTypeOf("function");
		expect(exec.execCommand).toBeTypeOf("function");
		expect(agentSessionServices.createAgentSessionServices).toBeTypeOf("function");
		expect(diagnostics).toBeDefined();
		expect(footerDataProvider).toBeDefined();
		expect(keybindings.KEYBINDINGS).toBeDefined();
		expect(outputGuard.takeOverStdout).toBeTypeOf("function");
		expect(providerDisplayNames.BUILT_IN_PROVIDER_DISPLAY_NAMES).toBeDefined();
		expect(sessionCwd.assertSessionCwdExists).toBeTypeOf("function");
		expect(slashCommands).toBeDefined();
		expect(systemPrompt.buildSystemPrompt).toBeTypeOf("function");
	});

	it("declares package exports for host resource and session modules", () => {
		const packageJsonPath = join(import.meta.dirname, "..", "package.json");
		const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
			exports?: Record<string, unknown>;
		};

		expect(packageJson.exports).toMatchObject({
			"./package-manager": expect.any(Object),
			"./source-info": expect.any(Object),
			"./skills": expect.any(Object),
			"./prompt-templates": expect.any(Object),
			"./resource-loader": expect.any(Object),
			"./resolve-config-value": expect.any(Object),
			"./extensions": expect.any(Object),
			"./compaction": expect.any(Object),
			"./extension-tool-types": expect.any(Object),
			"./agent-session": expect.any(Object),
			"./agent-session-runtime": expect.any(Object),
			"./agent-session-services": expect.any(Object),
			"./diagnostics": expect.any(Object),
			"./footer-data-provider": expect.any(Object),
			"./keybindings": expect.any(Object),
			"./output-guard": expect.any(Object),
			"./provider-display-names": expect.any(Object),
			"./session-cwd": expect.any(Object),
			"./slash-commands": expect.any(Object),
			"./system-prompt": expect.any(Object),
			"./theme-loader": expect.any(Object),
			"./bash-executor": expect.any(Object),
			"./exec": expect.any(Object),
		});
	});
});
