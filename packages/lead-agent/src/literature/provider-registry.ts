import type {
	LiteratureProviderId,
	LiteratureProviderRequest,
	LiteratureProviderResult,
	LiteratureSearchProvider,
} from "./types.js";

export interface LiteratureProviderRunFailure {
	provider: LiteratureProviderId;
	error: string;
}

export interface LiteratureProviderRunSuccess {
	provider: LiteratureProviderId;
	result: LiteratureProviderResult;
}

export type LiteratureProviderRun = LiteratureProviderRunSuccess | LiteratureProviderRunFailure;

export class LiteratureProviderRegistry {
	private readonly providers = new Map<LiteratureProviderId, LiteratureSearchProvider>();

	constructor(providers: readonly LiteratureSearchProvider[] = []) {
		for (const provider of providers) {
			this.providers.set(provider.id, provider);
		}
	}

	get(id: LiteratureProviderId): LiteratureSearchProvider | undefined {
		return this.providers.get(id);
	}

	ids(): LiteratureProviderId[] {
		return [...this.providers.keys()];
	}

	async search(providerId: LiteratureProviderId, request: LiteratureProviderRequest): Promise<LiteratureProviderRun> {
		const provider = this.providers.get(providerId);
		if (!provider) {
			return { provider: providerId, error: `Provider not registered: ${providerId}` };
		}
		try {
			return { provider: providerId, result: await provider.search(request) };
		} catch (error) {
			return { provider: providerId, error: error instanceof Error ? error.message : String(error) };
		}
	}
}
