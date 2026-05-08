import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIG_DIR_NAME } from "../src/config.js";
import { SettingsManager } from "../src/settings-manager.js";

describe("SettingsManager", () => {
	it("creates in-memory host settings with migrated transport values", () => {
		type LegacySettings = Parameters<typeof SettingsManager.inMemory>[0] & { websockets: boolean };
		const legacySettings: LegacySettings = { websockets: true };
		const settings = SettingsManager.inMemory(legacySettings);

		expect(settings.getTransport()).toBe("websocket");
		expect(settings.getSteeringMode()).toBe("one-at-a-time");
	});

	it("merges global and project settings from host config locations", () => {
		const rootDir = mkdtempSync(join(tmpdir(), "pi-agent-host-settings-"));
		try {
			const cwd = join(rootDir, "project");
			const agentDir = join(rootDir, "agent");
			const projectSettingsDir = join(cwd, CONFIG_DIR_NAME);
			mkdirSync(agentDir, { recursive: true });
			mkdirSync(projectSettingsDir, { recursive: true });
			writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ defaultProvider: "anthropic" }));
			writeFileSync(
				join(projectSettingsDir, "settings.json"),
				JSON.stringify({ defaultModel: "claude-test", terminal: { showImages: false } }),
			);

			const settings = SettingsManager.create(cwd, agentDir);

			expect(settings.getDefaultProvider()).toBe("anthropic");
			expect(settings.getDefaultModel()).toBe("claude-test");
			expect(settings.getShowImages()).toBe(false);
		} finally {
			rmSync(rootDir, { recursive: true, force: true });
		}
	});

	it("persists global settings updates", async () => {
		const rootDir = mkdtempSync(join(tmpdir(), "pi-agent-host-settings-"));
		try {
			const cwd = join(rootDir, "project");
			const agentDir = join(rootDir, "agent");
			mkdirSync(cwd, { recursive: true });
			const settings = SettingsManager.create(cwd, agentDir);

			settings.setDefaultProvider("openai");
			await settings.flush();

			const saved = JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf8")) as {
				defaultProvider?: string;
			};
			expect(saved.defaultProvider).toBe("openai");
		} finally {
			rmSync(rootDir, { recursive: true, force: true });
		}
	});
});
