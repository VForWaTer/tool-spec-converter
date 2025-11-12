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

/**
 * Get the latest repository tag
 */
export async function getLatestTag(repoInfo: { owner: string; name: string }): Promise<string | null> {
	const url = `${GITHUB_API_BASE}/repos/${repoInfo.owner}/${repoInfo.name}/tags`;
	
	try {
		const response = await fetch(url);
		
		if (!response.ok) {
			console.warn(`Failed to fetch tags: ${response.statusText}`);
			return null;
		}
		
		const tags = await response.json();
		
		if (Array.isArray(tags) && tags.length > 0) {
			// Return the first tag name (tags are sorted by creation date, newest first)
			return tags[0].name;
		}
		
		return null;
	} catch (error) {
		console.warn(`Error fetching tags: ${error instanceof Error ? error.message : 'Unknown error'}`);
		return null;
	}
}

/**
 * Get Dockerfile content from repository
 */
export async function getDockerfileContent(repoInfo: { owner: string; name: string }): Promise<string | null> {
	try {
		return await getFileContent(repoInfo, 'Dockerfile');
	} catch (error) {
		return null;
	}
}

/**
 * Extract CMD instruction from Dockerfile content
 */
export function extractDockerfileCmd(dockerfileContent: string): { command: string; interpreter?: string } | null {
	if (!dockerfileContent) {
		return null;
	}
	
	const lines = dockerfileContent.split('\n');
	let cmdLine: string | null = null;
	
	// Find CMD or ENTRYPOINT instruction
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.startsWith('CMD ') || trimmed.startsWith('ENTRYPOINT ')) {
			cmdLine = trimmed;
			break;
		}
	}
	
	if (!cmdLine) {
		return null;
	}
	
	// Parse CMD instruction
	// CMD can be in exec form: CMD ["executable","param1","param2"]
	// or shell form: CMD executable param1 param2
	if (cmdLine.startsWith('CMD ["') || cmdLine.startsWith('ENTRYPOINT ["')) {
		// Exec form - extract JSON array
		const match = cmdLine.match(/\["([^"]+)",?\s*(.*)\]/);
		if (match) {
			const executable = match[1];
			const rest = match[2] ? match[2].replace(/"/g, '').trim() : '';
			
			// Detect interpreter
			let interpreter: string | undefined;
			if (executable.includes('python')) {
				interpreter = 'python';
			} else if (executable.includes('perl')) {
				interpreter = 'perl';
			} else if (executable.includes('Rscript')) {
				interpreter = 'R';
			} else if (executable.includes('matlab')) {
				interpreter = 'matlab';
			} else if (executable.includes('bash') || executable.includes('sh')) {
				interpreter = 'bash';
			}
			
			// Reconstruct command for Galaxy (simplified - user may need to adjust)
			const command = rest ? `${executable} ${rest}` : executable;
			return { command, interpreter };
		}
	} else {
		// Shell form - extract command
		const match = cmdLine.match(/CMD\s+(.+)/) || cmdLine.match(/ENTRYPOINT\s+(.+)/);
		if (match) {
			const command = match[1].trim();
			
			// Detect interpreter
			let interpreter: string | undefined;
			if (command.includes('python')) {
				interpreter = 'python';
			} else if (command.includes('perl')) {
				interpreter = 'perl';
			} else if (command.includes('Rscript')) {
				interpreter = 'R';
			} else if (command.includes('matlab')) {
				interpreter = 'matlab';
			} else if (command.includes('bash') || command.includes('sh')) {
				interpreter = 'bash';
			}
			
			return { command, interpreter };
		}
	}
	
	return null;
}

/**
 * Check if container image exists at ghcr.io
 */
export async function checkGhcrImage(repoInfo: { owner: string; name: string }): Promise<{ exists: boolean; image?: string; latestTag?: string }> {
	// ghcr.io doesn't have a public API, so we'll construct the expected image path
	// and note that it should exist if the repository builds containers
	const image = `ghcr.io/${repoInfo.owner}/${repoInfo.name}:latest`;
	
	// We can't actually check if the image exists without pulling it
	// So we'll return the expected path and let the user verify
	return {
		exists: false, // Assume false, user can override
		image,
		latestTag: 'latest'
	};
}
