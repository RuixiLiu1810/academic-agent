import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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
		const [packageManager, sourceInfo, skills, promptTemplates, resourceLoader, extensions] = await Promise.all([
			import("../src/package-manager.js"),
			import("../src/source-info.js"),
			import("../src/skills.js"),
			import("../src/prompt-templates.js"),
			import("../src/resource-loader.js"),
			import("../src/extensions.js"),
		]);

		expect(packageManager.DefaultPackageManager).toBeTypeOf("function");
		expect(sourceInfo.createSyntheticSourceInfo).toBeTypeOf("function");
		expect(skills.loadSkills).toBeTypeOf("function");
		expect(promptTemplates.loadPromptTemplates).toBeTypeOf("function");
		expect(resourceLoader.DefaultResourceLoader).toBeTypeOf("function");
		expect(extensions.createExtensionRuntime).toBeTypeOf("function");
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
			"./extensions": expect.any(Object),
			"./agent-session": expect.any(Object),
			"./agent-session-runtime": expect.any(Object),
		});
	});
});
