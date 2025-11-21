// Types for the tool-spec converter

import type { GitHubRepoInfo } from './github-api.js';

// Re-export GitHubRepoInfo from github-api
export type { GitHubRepoInfo };

export interface CheckResult {
	id: string;
	name: string;
	description: string;
	status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
	data?: any;
	error?: string;
	warning?: string;
	duration?: number;
	isRequired: boolean;
}

export interface AnalysisState {
	// Current state
	state: 'idle' | 'validating' | 'analyzing' | 'completed' | 'error' | 'cancelled';
	
	// Repository info
	repoUrl: string;
	repoInfo: GitHubRepoInfo | null;
	
	// Check results
	checks: Map<string, CheckResult>;
	currentCheck: string | null;
	progress: number; // 0-100
	
	// Tool-spec data (collected during analysis)
	toolYaml: any | null; // Will be typed properly once we see the structure
	citationCff: any | null;
	dockerfileCmd?: string;
	repositoryVersion?: string;
	
	// Final results
	metadata: any | null;
	warnings: string[];
	errors: string[];
	
	// UI state
	canCancel: boolean;
	canRetry: boolean;
}

export interface Check {
	id: string;
	name: string;
	description: string;
	dependencies: string[];
	isRequired: boolean;
	executor: (state: AnalysisState) => Promise<CheckResult>;
}
