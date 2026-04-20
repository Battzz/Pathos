/**
 * GitHub data fetchers for the marketing hero.
 *
 * Rendering strategy: called from the root Server Component; Next.js caches
 * each `fetch` with `revalidate: 3600`, so the page stays statically-served
 * while still picking up new releases / commits within the hour.
 *
 * Rate limits: anonymous GitHub API is 60 req/hr per IP. With 1 rebuild/hr
 * ceiling × 3 calls, we're nowhere near the cap. Set `GITHUB_TOKEN` in Vercel
 * env vars if you ever want the headroom (5000 req/hr authenticated).
 *
 * Failure mode: every call returns `null` on non-200, and the caller falls
 * back to hard-coded defaults below. The page never renders blank.
 */

const REPO = "dohooo/helmor";
const API = "https://api.github.com";
const REVALIDATE_SECONDS = 3600;

// Fallbacks mirror what the design shipped with. Used when the GitHub API is
// unreachable, rate-limited, or the repo has no releases yet.
const FALLBACK = {
	version: "v0.4.0",
	versionShort: "v0.4",
	branch: "main",
	shortSha: "62d8e51",
	license: "MIT",
	repoUrl: `https://github.com/${REPO}`,
	releasesUrl: `https://github.com/${REPO}/releases`,
	latestReleaseUrl: `https://github.com/${REPO}/releases/latest`,
} as const;

export type RepoData = {
	version: string;
	versionShort: string;
	branch: string;
	shortSha: string;
	license: string;
	repoUrl: string;
	releasesUrl: string;
	latestReleaseUrl: string;
};

type Release = {
	tag_name: string;
	name?: string | null;
	html_url: string;
};
type Commit = { sha: string };
type Repo = {
	default_branch: string;
	license: { spdx_id: string | null } | null;
};

async function ghFetch<T>(path: string): Promise<T | null> {
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
		"User-Agent": "helmor-marketing",
	};
	const token = process.env.GITHUB_TOKEN;
	if (token) headers.Authorization = `Bearer ${token}`;

	try {
		const res = await fetch(`${API}${path}`, {
			headers,
			next: { revalidate: REVALIDATE_SECONDS },
		});
		if (!res.ok) return null;
		return (await res.json()) as T;
	} catch {
		return null;
	}
}

/** Strip patch (and pre-release) from a tag: "v0.4.1-beta" → "v0.4". */
function toShortVersion(tag: string): string {
	const m = tag.match(/^v?(\d+)\.(\d+)/);
	if (!m) return tag;
	return `v${m[1]}.${m[2]}`;
}

export async function getRepoData(): Promise<RepoData> {
	const [repo, release] = await Promise.all([
		ghFetch<Repo>(`/repos/${REPO}`),
		ghFetch<Release>(`/repos/${REPO}/releases/latest`),
	]);

	const branch = repo?.default_branch ?? FALLBACK.branch;
	const license = repo?.license?.spdx_id ?? FALLBACK.license;

	// commits/{branch} must run after we know the branch name — cheap
	// sequential call, still inside the same revalidation window.
	const commit = await ghFetch<Commit>(`/repos/${REPO}/commits/${branch}`);
	const shortSha = commit?.sha ? commit.sha.slice(0, 7) : FALLBACK.shortSha;

	const tag = release?.tag_name;
	const version = tag
		? tag.startsWith("v")
			? tag
			: `v${tag}`
		: FALLBACK.version;
	const versionShort = toShortVersion(version);

	return {
		version,
		versionShort,
		branch,
		shortSha,
		license,
		repoUrl: FALLBACK.repoUrl,
		releasesUrl: FALLBACK.releasesUrl,
		latestReleaseUrl: release?.html_url ?? FALLBACK.latestReleaseUrl,
	};
}
