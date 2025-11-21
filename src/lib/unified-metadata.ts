// Unified data model for software metadata

import type { GitHubRepoInfo } from './github-api.js';
import type { ToolSpec } from './tool-spec-validator.js';
import type { CitationCff } from './citation-cff-parser.js';

export interface Author {
	name?: string;
	givenNames?: string;
	familyNames?: string;
	email?: string;
	affiliation?: string;
	orcid?: string;
}

export interface RepositoryInfo {
	url?: string;
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

export interface LicenseInfo {
	license: string | string[] | null;
	licenseFileExists: boolean;
	licenseFileContent?: string;
	licenseCompatibility: {
		areCompatible: boolean;
		warnings: string[];
	};
}

export interface ToolSpecParameter {
	type: 'string' | 'integer' | 'float' | 'boolean' | 'enum' | 'asset';
	values?: string[]; // for enum type
	description?: string;
	array?: boolean;
	min?: number;
	max?: number;
	optional?: boolean;
	default?: any;
}

export interface ToolSpecDataItem {
	description?: string;
	example?: string;
	extension?: string | string[];
}

export interface ToolSpecData {
	title: string;
	description: string;
	parameters?: Record<string, ToolSpecParameter>;
	data?: Record<string, ToolSpecDataItem> | string[];
}

export interface CitationData {
	title: string;
	authors: Author[];
	version?: string;
	dateReleased?: string;
	url?: string;
	repository?: string;
	license?: string | string[];
	keywords?: string[];
	abstract?: string;
}

export interface GalaxyOutput {
	name: string;
	label: string;
	format: string; // Galaxy datatype
	description?: string;
}

export interface GalaxyExportConfig {
	command?: string;
	interpreter?: string;
	container?: string;
	containerVersion?: string;
	outputs: GalaxyOutput[];
	profile?: string; // default "24.0"
}

export interface CwlOutput {
	name: string;
	type: 'File' | 'Directory' | 'string' | 'int' | 'float' | 'boolean' | string;
	glob: string;
	label?: string;
	doc?: string;
}

export interface CwlExportConfig {
	cwlVersion: 'v1.1' | 'v1.2';
	outputs: CwlOutput[];
	baseCommand?: string;
	container?: string;
}

export interface UnifiedSoftwareMetadata {
	// Basic Information
	name: string;
	description: string;
	version: string;
	
	// Authors & Contributors
	authors: Author[];
	maintainers: Author[];
	
	// Repository Information
	repository: RepositoryInfo;
	
	// Licensing
	license: LicenseInfo;
	
	// Technical Details
	programmingLanguage: string;
	keywords: string[];
	
	// Tool-Spec Specific
	toolSpec: ToolSpecData;
	
	// Citation Information
	citation: CitationData;
	
	// Metadata
	generatedAt: string;
	generator: string;
	generatorVersion: string;
	
	// Galaxy-specific configuration (optional)
	galaxyConfig?: GalaxyExportConfig;
}

/**
 * Create unified metadata from collected analysis data
 */
export function createUnifiedMetadata(
	repoInfo: GitHubRepoInfo,
	toolSpec: ToolSpec,
	citationCff: CitationCff | null,
	licenseInfo: any,
	dockerfileCmd?: string,
	repositoryVersion?: string
): UnifiedSoftwareMetadata {
	console.log('🔄 Creating unified metadata...');
	console.log('📊 Input data:', {
		repoInfo: !!repoInfo,
		toolSpec: !!toolSpec,
		citationCff: !!citationCff,
		licenseInfo: !!licenseInfo
	});
	
	// Extract authors from citation data or use repository info
	const authors: Author[] = citationCff?.authors || [];
	const maintainers: Author[] = []; // Could be derived from repository contributors
	
	// Combine keywords from multiple sources
	const keywords = [
		...(toolSpec.parameters ? ['tool-spec'] : []),
		...(citationCff?.keywords || []),
		...(repoInfo.language ? [repoInfo.language.toLowerCase()] : [])
	].filter((keyword, index, array) => array.indexOf(keyword) === index); // Remove duplicates
	
	// Determine version (prefer repository tag, then citation, fallback to 'latest')
	const version = repositoryVersion || citationCff?.version || 'latest';
	
	// Determine license
	const license: LicenseInfo = {
		license: citationCff?.license || null,
		licenseFileExists: licenseInfo?.licenseExists || false,
		licenseFileContent: licenseInfo?.licenseFileLength > 0 ? 'Present' : undefined,
		licenseCompatibility: licenseInfo?.licenseComparison || { areCompatible: true, warnings: [] }
	};
	
	const unified: UnifiedSoftwareMetadata = {
		// Basic Information
		name: toolSpec.title || repoInfo.name,
		description: toolSpec.description || repoInfo.description || '',
		version,
		
		// Authors & Contributors
		authors,
		maintainers,
		
		// Repository Information
		repository: repoInfo,
		
		// Licensing
		license,
		
		// Technical Details
		programmingLanguage: repoInfo.language || 'Unknown',
		keywords,
		
		// Tool-Spec Specific
		toolSpec: {
			title: toolSpec.title,
			description: toolSpec.description,
			parameters: toolSpec.parameters,
			data: toolSpec.data
		},
		
		// Citation Information
		citation: {
			title: citationCff?.title || toolSpec.title,
			authors: citationCff?.authors || [],
			version: citationCff?.version,
			dateReleased: citationCff?.dateReleased,
			url: citationCff?.url,
			repository: citationCff?.repository,
			license: citationCff?.license,
			keywords: citationCff?.keywords,
			abstract: citationCff?.abstract
		},
		
		// Metadata
		generatedAt: new Date().toISOString(),
		generator: 'Tool-Spec Converter',
		generatorVersion: '1.0.0',
		
		// Galaxy-specific configuration (initialized with detected values, outputs empty for user to fill)
		galaxyConfig: {
			command: dockerfileCmd,
			container: repoInfo ? `ghcr.io/${repoInfo.owner}/${repoInfo.name}:latest` : undefined,
			containerVersion: repositoryVersion,
			outputs: [],
			profile: '24.0'
		}
	};
	
	console.log('✅ Unified metadata created:', {
		name: unified.name,
		version: unified.version,
		authorsCount: unified.authors.length,
		keywordsCount: unified.keywords.length,
		hasLicense: !!unified.license.license,
		parametersCount: unified.toolSpec.parameters ? Object.keys(unified.toolSpec.parameters).length : 0,
		dataCount: unified.toolSpec.data ? (Array.isArray(unified.toolSpec.data) ? unified.toolSpec.data.length : Object.keys(unified.toolSpec.data).length) : 0
	});
	
	// Log detailed parameter information for metadata export
	if (unified.toolSpec.parameters) {
		console.log('🔧 Parameters for metadata export:');
		Object.entries(unified.toolSpec.parameters).forEach(([paramName, paramDef]) => {
			console.log(`  📝 ${paramName}:`, {
				type: paramDef.type,
				description: paramDef.description,
				optional: paramDef.optional,
				default: paramDef.default,
				array: paramDef.array,
				...(paramDef.type === 'enum' && { values: paramDef.values }),
				...(paramDef.type === 'integer' || paramDef.type === 'float') && {
					min: paramDef.min,
					max: paramDef.max
				}
			});
		});
	}
	
	// Log detailed data information for metadata export
	if (unified.toolSpec.data) {
		console.log('📊 Data inputs for metadata export:');
		if (Array.isArray(unified.toolSpec.data)) {
			unified.toolSpec.data.forEach((dataItem, index) => {
				console.log(`  📄 ${index + 1}: ${dataItem}`);
			});
		} else {
			Object.entries(unified.toolSpec.data).forEach(([dataName, dataDef]) => {
				console.log(`  📄 ${dataName}:`, {
					description: dataDef.description,
					extension: dataDef.extension,
					example: dataDef.example
				});
			});
		}
	}
	
	return unified;
}
