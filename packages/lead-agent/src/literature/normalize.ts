import type { LiteratureCandidate, LiteratureCandidateBrief, LiteratureProviderProvenance } from "./types.js";

export function normalizeDoi(value: string | undefined): string | undefined {
	if (!value) return undefined;
	const normalized = value
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\/(dx\.)?doi\.org\//, "")
		.replace(/^doi:\s*/, "");
	return normalized.length > 0 ? normalized : undefined;
}

function normalizeTitle(value: string): string {
	return value
		.toLowerCase()
		.replace(/\s+/g, " ")
		.replace(/[^\p{L}\p{N}\s]/gu, "")
		.trim();
}

function candidateKey(candidate: LiteratureCandidate): string {
	const doi = normalizeDoi(candidate.doi);
	if (doi) return `doi:${doi}`;
	if (candidate.pmid) return `pmid:${candidate.pmid.trim()}`;
	if (candidate.arxivId) return `arxiv:${candidate.arxivId.trim().toLowerCase()}`;
	if (candidate.provider === "semantic-scholar") return `s2:${candidate.providerRecordId}`;
	return `title-year:${normalizeTitle(candidate.title)}:${candidate.year ?? "unknown"}`;
}

function provenanceFor(candidate: LiteratureCandidate): LiteratureProviderProvenance {
	return {
		provider: candidate.provider,
		providerRecordId: candidate.providerRecordId,
		sourceQuery: candidate.sourceQuery,
		rawScore: candidate.rawScore,
		retrievedAt: candidate.retrievedAt,
	};
}

function mergeCandidate(left: LiteratureCandidate, right: LiteratureCandidate): LiteratureCandidate {
	const provenance = [...(left.provenance ?? [provenanceFor(left)]), ...(right.provenance ?? [provenanceFor(right)])];
	const providers = new Set(provenance.map((p) => p.provider));
	return {
		...left,
		title: left.title || right.title,
		authors: left.authors.length > 0 ? left.authors : right.authors,
		year: left.year ?? right.year,
		venue: left.venue ?? right.venue,
		doi: normalizeDoi(left.doi) ?? normalizeDoi(right.doi),
		pmid: left.pmid ?? right.pmid,
		arxivId: left.arxivId ?? right.arxivId,
		url: left.url ?? right.url,
		abstract: left.abstract ?? right.abstract,
		publicationType: left.publicationType ?? right.publicationType,
		isOpenAccess: left.isOpenAccess ?? right.isOpenAccess,
		citationCount: Math.max(left.citationCount ?? 0, right.citationCount ?? 0) || undefined,
		provenance,
		rankingNotes: providers.size > 1 ? [`returned by ${providers.size} providers`] : left.rankingNotes,
	};
}

function score(candidate: LiteratureCandidate, query: string): { score: number; notes: string[] } {
	const notes = new Set(candidate.rankingNotes ?? []);
	const queryTerms = normalizeTitle(query)
		.split(" ")
		.filter((term) => term.length > 2);
	const title = normalizeTitle(candidate.title);
	let value = 0;
	if (queryTerms.length > 0 && queryTerms.every((term) => title.includes(term))) {
		value += 40;
		notes.add("matched query terms");
	}
	const providerCount = new Set((candidate.provenance ?? [provenanceFor(candidate)]).map((p) => p.provider)).size;
	if (providerCount > 1) {
		value += providerCount * 10;
		notes.add(`returned by ${providerCount} providers`);
	}
	if (candidate.year) value += Math.min(Math.max(candidate.year - 2000, 0), 30);
	if (candidate.citationCount) value += Math.min(candidate.citationCount, 50) / 5;
	if (candidate.abstract) value += 5;
	if (candidate.doi || candidate.pmid || candidate.arxivId) value += 5;
	return { score: value, notes: [...notes] };
}

export function dedupeAndRankCandidates(
	candidates: readonly LiteratureCandidate[],
	options: { query: string },
): LiteratureCandidate[] {
	const merged = new Map<string, LiteratureCandidate>();
	for (const candidate of candidates) {
		const normalized = { ...candidate, doi: normalizeDoi(candidate.doi), provenance: candidate.provenance };
		const key = candidateKey(normalized);
		const existing = merged.get(key);
		merged.set(key, existing ? mergeCandidate(existing, normalized) : normalized);
	}
	return [...merged.values()]
		.map((candidate) => {
			const ranked = score(candidate, options.query);
			return { ...candidate, rankingNotes: ranked.notes, rawScore: ranked.score };
		})
		.sort((a, b) => (b.rawScore ?? 0) - (a.rawScore ?? 0) || a.title.localeCompare(b.title));
}

export function toCandidateBrief(candidate: LiteratureCandidate): LiteratureCandidateBrief {
	return {
		id: candidate.id,
		title: candidate.title,
		authors: candidate.authors,
		year: candidate.year,
		venue: candidate.venue,
		doi: candidate.doi,
		pmid: candidate.pmid,
		arxivId: candidate.arxivId,
		url: candidate.url,
		providers: [...new Set((candidate.provenance ?? [provenanceFor(candidate)]).map((p) => p.provider))],
		rankingNotes: candidate.rankingNotes ?? [],
	};
}
