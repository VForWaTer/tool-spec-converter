// GitHub API integration for public repositories

const GITHUB_API_BASE = 'https://api.github.com';

export interface GitHubRepoInfo {
	owner: string;
	name: string;
	fullName: string;
	description: string | null;
	language: string | null;
	stars: number;
	createdAt: string;
	updatedAt: string;
	cloneUrl: string;
	htmlUrl: string;
}

export interface GitHubApiError {
	message: string;
	status: number;
	url: string;
}

export class GitHubApiError extends Error {
	status: number;
	url: string;

	constructor(message: string, status: number, url: string) {
		super(message);
		this.name = 'GitHubApiError';
		this.status = status;
		this.url = url;
	}
}

/**
 * Parse GitHub URL to extract owner and repo name
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string } {
	// Handle various GitHub URL formats
	const patterns = [
		/^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)(?:\.git)?(?:\/.*)?$/,
		/^git@github\.com:([^\/]+)\/([^\/]+)(?:\.git)?$/,
		/^([^\/]+)\/([^\/]+)$/ // owner/repo format
	];

	for (const pattern of patterns) {
		const match = url.match(pattern);
		if (match) {
			return {
				owner: match[1],
				repo: match[2].replace(/\.git$/, '')
			};
		}
	}

	throw new Error(`Invalid GitHub URL format: ${url}`);
}

/**
 * Validate that a repository exists and is public
 */
export async function validateRepoExists(repoUrl: string) {
	const { owner, repo } = parseGitHubUrl(repoUrl);
	const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}`;
	
	try {
		const response = await fetch(url);
		
		if (!response.ok) {
			if (response.status === 404) {
				throw new GitHubApiError(`Repository ${owner}/${repo} not found or not public`, 404, url);
			}
			throw new GitHubApiError(`GitHub API error: ${response.statusText}`, response.status, url);
		}
		
		const data = await response.json();
		
		return {
			owner: data.owner.login,
			name: data.name,
			fullName: data.full_name,
			description: data.description,
			language: data.language,
			stars: data.stargazers_count,
			createdAt: data.created_at,
			updatedAt: data.updated_at,
			cloneUrl: data.clone_url,
			htmlUrl: data.html_url
		};
	} catch (error) {
		if (error instanceof GitHubApiError) {
			throw error;
		}
		throw new GitHubApiError(`Network error: ${error.message}`, 0, url);
	}
}

/**
 * Check if a file exists in the repository root
 */
export async function checkFileExists(repoInfo: { owner: string; name: string }, filename: string): Promise<boolean> {
	const url = `${GITHUB_API_BASE}/repos/${repoInfo.owner}/${repoInfo.name}/contents/${filename}`;
	
	try {
		const response = await fetch(url);
		return response.ok;
	} catch (error) {
		return false;
	}
}

/**
 * Get file content from repository root
 */
export async function getFileContent(repoInfo: { owner: string; name: string }, filename: string): Promise<string> {
	const url = `${GITHUB_API_BASE}/repos/${repoInfo.owner}/${repoInfo.name}/contents/${filename}`;
	
	try {
		const response = await fetch(url);
		
		if (!response.ok) {
			throw new GitHubApiError(`File ${filename} not found`, response.status, url);
		}
		
		const data = await response.json();
		
		if (data.content) {
			// GitHub API returns base64 encoded content
			return atob(data.content.replace(/\n/g, ''));
		}
		
		throw new GitHubApiError(`No content found in ${filename}`, 404, url);
	} catch (error) {
		if (error instanceof GitHubApiError) {
			throw error;
		}
		throw new GitHubApiError(`Network error: ${error.message}`, 0, url);
	}
}
