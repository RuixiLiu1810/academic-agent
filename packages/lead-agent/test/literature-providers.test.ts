import { describe, expect, it } from "vitest";
import { createCrossrefProvider } from "../src/literature/providers/crossref.js";
import { createSemanticScholarProvider } from "../src/literature/providers/semantic-scholar.js";

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

describe("literature providers", () => {
	it("normalizes Crossref works results", async () => {
		const provider = createCrossrefProvider({
			fetch: async () =>
				jsonResponse({
					message: {
						items: [
							{
								DOI: "10.1000/nir",
								title: ["Near infrared spectroscopy for diagnosis"],
								author: [{ given: "Alice", family: "Author" }],
								"container-title": ["Journal of NIR"],
								published: { "date-parts": [[2024]] },
								URL: "https://doi.org/10.1000/nir",
								type: "journal-article",
							},
						],
					},
				}),
		});

		const result = await provider.search({ query: "near infrared diagnosis", maxResults: 5 });

		expect(result.provider).toBe("crossref");
		expect(result.candidates[0]).toMatchObject({
			provider: "crossref",
			doi: "10.1000/nir",
			title: "Near infrared spectroscopy for diagnosis",
			authors: ["Alice Author"],
			year: 2024,
		});
	});

	it("normalizes Semantic Scholar paper search results", async () => {
		const provider = createSemanticScholarProvider({
			fetch: async () =>
				jsonResponse({
					data: [
						{
							paperId: "s2-1",
							title: "Near infrared imaging in medicine",
							authors: [{ name: "Bob Author" }],
							year: 2025,
							venue: "Medical Imaging",
							abstract: "Abstract text",
							citationCount: 12,
							url: "https://semanticscholar.org/paper/s2-1",
							externalIds: { DOI: "10.2000/nir" },
						},
					],
				}),
		});

		const result = await provider.search({ query: "near infrared imaging", maxResults: 5 });

		expect(result.provider).toBe("semantic-scholar");
		expect(result.candidates[0]).toMatchObject({
			provider: "semantic-scholar",
			providerRecordId: "s2-1",
			doi: "10.2000/nir",
			citationCount: 12,
		});
	});
});
