import { describe, expect, it } from "vitest";
import { AuthStorage } from "../src/auth-storage.js";
import { ModelRegistry } from "../src/model-registry.js";

describe("ModelRegistry", () => {
	it("loads built-in models and resolves stored provider auth", async () => {
		const modelRegistry = ModelRegistry.inMemory(AuthStorage.inMemory());
		const model = modelRegistry.getAll()[0];
		expect(model).toBeDefined();

		const authStorage = AuthStorage.inMemory({
			[model!.provider]: {
				type: "api_key",
				key: "test-key",
			},
		});
		const registryWithAuth = ModelRegistry.inMemory(authStorage);
		const resolvedModel = registryWithAuth.find(model!.provider, model!.id);

		expect(resolvedModel).toBeDefined();
		expect(registryWithAuth.hasConfiguredAuth(resolvedModel!)).toBe(true);
		await expect(registryWithAuth.getApiKeyAndHeaders(resolvedModel!)).resolves.toMatchObject({
			ok: true,
			apiKey: "test-key",
		});
	});

	it("returns built-in provider display names", () => {
		const modelRegistry = ModelRegistry.inMemory(AuthStorage.inMemory());

		expect(modelRegistry.getProviderDisplayName("openai")).toBe("OpenAI");
		expect(modelRegistry.getProviderDisplayName("unknown-provider")).toBe("unknown-provider");
	});
});
