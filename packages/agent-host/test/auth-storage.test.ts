import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AuthStorage } from "../src/auth-storage.js";

describe("AuthStorage", () => {
	it("resolves in-memory api key credentials", async () => {
		const authStorage = AuthStorage.inMemory({
			"test-provider": {
				type: "api_key",
				key: "test-key",
			},
		});

		await expect(authStorage.getApiKey("test-provider", { includeFallback: false })).resolves.toBe("test-key");
		expect(authStorage.has("test-provider")).toBe(true);
		expect(authStorage.getAuthStatus("test-provider")).toEqual({ configured: true, source: "stored" });
	});

	it("persists file-backed credentials", async () => {
		const rootDir = mkdtempSync(join(tmpdir(), "pi-agent-host-auth-"));
		try {
			const authPath = join(rootDir, "auth.json");
			const authStorage = AuthStorage.create(authPath);

			authStorage.set("test-provider", {
				type: "api_key",
				key: "file-key",
			});

			const reloaded = AuthStorage.create(authPath);
			await expect(reloaded.getApiKey("test-provider", { includeFallback: false })).resolves.toBe("file-key");
			expect(JSON.parse(readFileSync(authPath, "utf8"))).toMatchObject({
				"test-provider": {
					type: "api_key",
					key: "file-key",
				},
			});
		} finally {
			rmSync(rootDir, { recursive: true, force: true });
		}
	});

	it("supports runtime api key overrides without persisting them", async () => {
		const authStorage = AuthStorage.inMemory();
		authStorage.setRuntimeApiKey("test-provider", "runtime-key");

		await expect(authStorage.getApiKey("test-provider", { includeFallback: false })).resolves.toBe("runtime-key");
		expect(authStorage.has("test-provider")).toBe(false);
		expect(authStorage.hasAuth("test-provider")).toBe(true);
	});
});
