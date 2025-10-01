// Analysis engine for tool-spec repository validation

import { writable, type Writable } from 'svelte/store';
import type { AnalysisState, CheckResult, Check } from './types.js';
import { validateRepoExists, checkFileExists, getFileContent, type GitHubRepoInfo } from './github-api.js';
import { validateToolSpec, type ToolSpecValidationResult } from './tool-spec-validator.js';
import { parseCitationCff, compareLicenses, type CitationCffValidationResult } from './citation-cff-parser.js';
import { createUnifiedMetadata, type UnifiedSoftwareMetadata } from './unified-metadata.js';
import { getDefaultExportFormat } from './exporters/export-registry.js';

// Create the analysis state store
export const analysisStore: Writable<AnalysisState> = writable({
	state: 'idle',
	repoUrl: '',
	repoInfo: null,
	checks: new Map(),
	currentCheck: null,
	progress: 0,
	toolYaml: null,
	citationCff: null,
	metadata: null,
	warnings: [],
	errors: [],
	canCancel: false,
	canRetry: false
});

// Define the checks in execution order
const checks: Check[] = [
	{
		id: 'repo-exists',
		name: 'Repository exists and is public',
		description: 'Validating repository URL and accessibility',
		dependencies: [],
		isRequired: true,
		executor: async (state) => {
			const startTime = Date.now();
			console.log('🚀 Starting repository validation...');
			console.log('📍 Repository URL:', state.repoUrl);
			
			try {
				const repoInfo = await validateRepoExists(state.repoUrl);
				
				console.log('✅ Repository validation successful!');
				console.log('📊 Repository info:', {
					name: repoInfo.fullName,
					stars: repoInfo.stars,
					language: repoInfo.language,
					description: repoInfo.description
				});
				
				// Update state with repo info
				analysisStore.update(s => ({
					...s,
					repoInfo,
					progress: 20
				}));
				
				return {
					id: 'repo-exists',
					name: 'Repository exists and is public',
					description: 'Validating repository URL and accessibility',
					status: 'completed',
					data: repoInfo,
					duration: Date.now() - startTime,
					isRequired: true
				};
			} catch (error) {
				console.error('❌ Repository validation failed:', error);
				return {
					id: 'repo-exists',
					name: 'Repository exists and is public',
					description: 'Validating repository URL and accessibility',
					status: 'failed',
					error: error instanceof Error ? error.message : 'Unknown error',
					duration: Date.now() - startTime,
					isRequired: true
				};
			}
		}
	},
	{
		id: 'tool-yaml-exists',
		name: 'tool.yml file exists',
		description: 'Checking for tool.yml in src directory',
		dependencies: ['repo-exists'],
		isRequired: true,
		executor: async (state) => {
			const startTime = Date.now();
			console.log('🔍 Checking for tool.yml file...');
			
			try {
				if (!state.repoInfo) {
					throw new Error('Repository info not available');
				}
				
				console.log('📁 Checking file: src/tool.yml');
				const exists = await checkFileExists(state.repoInfo, 'src/tool.yml');
				
				if (exists) {
					console.log('✅ tool.yml file found!');
				} else {
					console.log('❌ tool.yml file not found in src directory');
				}
				
				analysisStore.update(s => ({
					...s,
					progress: 40
				}));
				
				return {
					id: 'tool-yaml-exists',
					name: 'tool.yml file exists',
					description: 'Checking for tool.yml in src directory',
					status: exists ? 'completed' : 'failed',
					error: exists ? undefined : 'tool.yml file not found in src directory',
					duration: Date.now() - startTime,
					isRequired: true
				};
			} catch (error) {
				console.error('❌ Error checking tool.yml file:', error);
				return {
					id: 'tool-yaml-exists',
					name: 'tool.yml file exists',
					description: 'Checking for tool.yml in src directory',
					status: 'failed',
					error: error instanceof Error ? error.message : 'Unknown error',
					duration: Date.now() - startTime,
					isRequired: true
				};
			}
		}
	},
	{
		id: 'tool-yaml-valid',
		name: 'tool.yml is valid and compliant',
		description: 'Validating tool.yml structure and content',
		dependencies: ['tool-yaml-exists'],
		isRequired: true,
		executor: async (state) => {
			const startTime = Date.now();
			console.log('📝 Validating tool.yml content...');
			
			try {
				if (!state.repoInfo) {
					throw new Error('Repository info not available');
				}
				
				// Get the tool.yml content
				console.log('📥 Downloading tool.yml content...');
				const yamlContent = await getFileContent(state.repoInfo, 'src/tool.yml');
				
				console.log('=== TOOL.YML CONTENT ===');
				console.log(yamlContent);
				console.log('========================');
				
				// Validate the YAML structure
				console.log('🔍 Validating tool-spec structure...');
				const validationResult = validateToolSpec(yamlContent);
				
				if (validationResult.isValid) {
					console.log('✅ Tool-spec validation successful!');
					console.log('📋 Extracted tool info:', {
						title: validationResult.toolSpec?.title,
						description: validationResult.toolSpec?.description,
						parametersCount: Object.keys(validationResult.toolSpec?.parameters || {}).length,
						dataCount: Array.isArray(validationResult.toolSpec?.data) 
							? validationResult.toolSpec.data.length 
							: Object.keys(validationResult.toolSpec?.data || {}).length
					});
					
					if (validationResult.warnings.length > 0) {
						console.warn('⚠️ Validation warnings:', validationResult.warnings);
					}
				} else {
					console.error('❌ Tool-spec validation failed!');
					console.error('🚫 Validation errors:', validationResult.errors);
					if (validationResult.warnings.length > 0) {
						console.warn('⚠️ Validation warnings:', validationResult.warnings);
					}
				}
				
				// Update state with tool.yml data
				analysisStore.update(s => ({
					...s,
					toolYaml: validationResult.toolSpec,
					progress: 60
				}));
				
				return {
					id: 'tool-yaml-valid',
					name: 'tool.yml is valid and compliant',
					description: 'Validating tool.yml structure and content',
					status: validationResult.isValid ? 'completed' : 'failed',
					data: validationResult.toolSpec,
					error: validationResult.isValid ? undefined : validationResult.errors.join('; '),
					warning: validationResult.warnings.length > 0 ? validationResult.warnings.join('; ') : undefined,
					duration: Date.now() - startTime,
					isRequired: true
				};
			} catch (error) {
				console.error('❌ Error validating tool.yml:', error);
				return {
					id: 'tool-yaml-valid',
					name: 'tool.yml is valid and compliant',
					description: 'Validating tool.yml structure and content',
					status: 'failed',
					error: error instanceof Error ? error.message : 'Unknown error',
					duration: Date.now() - startTime,
					isRequired: true
				};
			}
		}
	},
	{
		id: 'citation-cff-exists',
		name: 'CITATION.cff file exists and is valid',
		description: 'Checking for CITATION.cff in repository root and parsing content',
		dependencies: ['tool-yaml-valid'],
		isRequired: false,
		executor: async (state) => {
			const startTime = Date.now();
			console.log('📄 Checking for CITATION.cff file...');
			
			try {
				if (!state.repoInfo) {
					throw new Error('Repository info not available');
				}
				
				console.log('📁 Checking file: CITATION.cff');
				const exists = await checkFileExists(state.repoInfo, 'CITATION.cff');
				
				if (!exists) {
					console.log('⚠️ CITATION.cff file not found (optional but recommended)');
					analysisStore.update(s => ({
						...s,
						progress: 80
					}));
					
					return {
						id: 'citation-cff-exists',
						name: 'CITATION.cff file exists and is valid',
						description: 'Checking for CITATION.cff in repository root and parsing content',
						status: 'failed',
						warning: 'CITATION.cff file is missing (optional but recommended)',
						duration: Date.now() - startTime,
						isRequired: false
					};
				}
				
				console.log('✅ CITATION.cff file found!');
				console.log('📥 Downloading CITATION.cff content...');
				
				// Get the CITATION.cff content
				const cffContent = await getFileContent(state.repoInfo, 'CITATION.cff');
				
				console.log('=== CITATION.CFF CONTENT ===');
				console.log(cffContent);
				console.log('===========================');
				
				// Parse and validate the CITATION.cff content
				console.log('🔍 Validating CITATION.cff structure...');
				const validationResult = parseCitationCff(cffContent);
				
				if (validationResult.isValid) {
					console.log('✅ CITATION.cff validation successful!');
					
					// Update state with citation cff data
					analysisStore.update(s => ({
						...s,
						citationCff: validationResult.citationCff,
						progress: 80
					}));
					
					return {
						id: 'citation-cff-exists',
						name: 'CITATION.cff file exists and is valid',
						description: 'Checking for CITATION.cff in repository root and parsing content',
						status: 'completed',
						data: validationResult.citationCff,
						warning: validationResult.warnings.length > 0 ? validationResult.warnings.join('; ') : undefined,
						duration: Date.now() - startTime,
						isRequired: false
					};
				} else {
					console.error('❌ CITATION.cff validation failed!');
					console.error('🚫 Validation errors:', validationResult.errors);
					if (validationResult.warnings.length > 0) {
						console.warn('⚠️ Validation warnings:', validationResult.warnings);
					}
					
					return {
						id: 'citation-cff-exists',
						name: 'CITATION.cff file exists and is valid',
						description: 'Checking for CITATION.cff in repository root and parsing content',
						status: 'failed',
						error: validationResult.errors.join('; '),
						warning: validationResult.warnings.length > 0 ? validationResult.warnings.join('; ') : undefined,
						duration: Date.now() - startTime,
						isRequired: false
					};
				}
			} catch (error) {
				console.error('❌ Error checking CITATION.cff file:', error);
				return {
					id: 'citation-cff-exists',
					name: 'CITATION.cff file exists and is valid',
					description: 'Checking for CITATION.cff in repository root and parsing content',
					status: 'failed',
					error: error instanceof Error ? error.message : 'Unknown error',
					duration: Date.now() - startTime,
					isRequired: false
				};
			}
		}
	},
	{
		id: 'license-check',
		name: 'LICENSE file check',
		description: 'Checking for LICENSE file and comparing with CITATION.cff license',
		dependencies: ['citation-cff-exists'],
		isRequired: false,
		executor: async (state) => {
			const startTime = Date.now();
			console.log('📜 Checking for LICENSE file...');
			
			try {
				if (!state.repoInfo) {
					throw new Error('Repository info not available');
				}
				
				console.log('📁 Checking file: LICENSE');
				const licenseExists = await checkFileExists(state.repoInfo, 'LICENSE');
				
				let licenseFileContent = '';
				if (licenseExists) {
					console.log('✅ LICENSE file found!');
					console.log('📥 Downloading LICENSE content...');
					licenseFileContent = await getFileContent(state.repoInfo, 'LICENSE');
					console.log('📄 LICENSE file content length:', licenseFileContent.length, 'characters');
				} else {
					console.log('⚠️ LICENSE file not found');
				}
				
				// Compare licenses if both CITATION.cff and LICENSE exist
				let licenseComparison = { areCompatible: true, warnings: [] as string[] };
				if (state.citationCff && licenseFileContent) {
					console.log('🔍 Comparing licenses between CITATION.cff and LICENSE file...');
					licenseComparison = compareLicenses(state.citationCff.license, licenseFileContent);
					
					if (licenseComparison.warnings.length > 0) {
						console.warn('⚠️ License comparison warnings:', licenseComparison.warnings);
					}
				}
				
				analysisStore.update(s => ({
					...s,
					progress: 90
				}));
				
				const allWarnings = [];
				if (!licenseExists) {
					allWarnings.push('LICENSE file is missing (recommended for legal clarity)');
				}
				allWarnings.push(...licenseComparison.warnings);
				
				return {
					id: 'license-check',
					name: 'LICENSE file check',
					description: 'Checking for LICENSE file and comparing with CITATION.cff license',
					status: 'completed',
					data: { 
						licenseExists, 
						licenseFileLength: licenseFileContent.length,
						licenseComparison 
					},
					warning: allWarnings.length > 0 ? allWarnings.join('; ') : undefined,
					duration: Date.now() - startTime,
					isRequired: false
				};
			} catch (error) {
				console.error('❌ Error checking LICENSE file:', error);
				return {
					id: 'license-check',
					name: 'LICENSE file check',
					description: 'Checking for LICENSE file and comparing with CITATION.cff license',
					status: 'failed',
					error: error instanceof Error ? error.message : 'Unknown error',
					duration: Date.now() - startTime,
					isRequired: false
				};
			}
		}
	},
	{
		id: 'metadata-conversion',
		name: 'Convert to software metadata',
		description: 'Generating software metadata from available sources',
		dependencies: ['license-check'],
		isRequired: true,
		executor: async (state) => {
			const startTime = Date.now();
			console.log('🔄 Starting metadata conversion...');
			
			try {
				console.log('📊 Available data for conversion:');
				console.log('  - Repository info:', state.repoInfo ? '✅' : '❌');
				console.log('  - Tool spec:', state.toolYaml ? '✅' : '❌');
				console.log('  - Citation file:', state.citationCff ? '✅' : '❌');
				
				// Validate required data
				if (!state.repoInfo) {
					throw new Error('Repository information is required for metadata conversion');
				}
				
				if (!state.toolYaml) {
					throw new Error('Tool specification is required for metadata conversion');
				}
				
				// Get license information from the license check
				const licenseCheck = state.checks.get('license-check');
				const licenseInfo = licenseCheck?.data || {};
				
				// Create unified metadata
				console.log('🔄 Creating unified metadata...');
				const unifiedMetadata = createUnifiedMetadata(
					state.repoInfo,
					state.toolYaml,
					state.citationCff,
					licenseInfo
				);
				
				// Test export with default format (CodeMeta)
				console.log('🔄 Testing CodeMeta export...');
				const defaultExporter = getDefaultExportFormat();
				const exportedData = defaultExporter.exporter.export(unifiedMetadata);
				console.log('✅ CodeMeta export successful, length:', exportedData.length, 'characters');
				
				// Update state with unified metadata
				analysisStore.update(s => ({
					...s,
					metadata: unifiedMetadata,
					progress: 100,
					state: 'completed'
				}));
				
				console.log('✅ Metadata conversion completed successfully');
				
				return {
					id: 'metadata-conversion',
					name: 'Convert to software metadata',
					description: 'Generating software metadata from available sources',
					status: 'completed',
					data: {
						unifiedMetadata,
						exportFormats: ['codemeta'], // Available export formats
						exportedDataLength: exportedData.length
					},
					duration: Date.now() - startTime,
					isRequired: true
				};
			} catch (error) {
				console.error('❌ Error during metadata conversion:', error);
				return {
					id: 'metadata-conversion',
					name: 'Convert to software metadata',
					description: 'Generating software metadata from available sources',
					status: 'failed',
					error: error instanceof Error ? error.message : 'Unknown error',
					duration: Date.now() - startTime,
					isRequired: true
				};
			}
		}
	}
];

/**
 * Start analysis for a repository
 */
export async function startAnalysis(repoUrl: string) {
	console.log('🎯 Starting repository analysis...');
	console.log('🔗 Repository URL:', repoUrl);
	
	// Reset state
	analysisStore.set({
		state: 'analyzing',
		repoUrl,
		repoInfo: null,
		checks: new Map(),
		currentCheck: null,
		progress: 0,
		toolYaml: null,
		citationCff: null,
		metadata: null,
		warnings: [],
		errors: [],
		canCancel: true,
		canRetry: false
	});
	
	// Initialize check results
	const initialChecks = new Map<string, CheckResult>();
	checks.forEach(check => {
		initialChecks.set(check.id, {
			id: check.id,
			name: check.name,
			description: check.description,
			status: 'pending',
			isRequired: check.isRequired
		});
	});
	
	analysisStore.update(s => ({
		...s,
		checks: initialChecks
	}));
	
	// Execute checks sequentially
	for (const check of checks) {
		console.log(`\n🔄 Executing check: ${check.name}`);
		console.log(`📋 Description: ${check.description}`);
		
		// Update current check
		analysisStore.update(s => ({
			...s,
			currentCheck: check.id
		}));
		
		// Mark as running
		analysisStore.update(s => {
			const newChecks = new Map(s.checks);
			const checkResult = newChecks.get(check.id);
			if (checkResult) {
				newChecks.set(check.id, { ...checkResult, status: 'running' });
			}
			return { ...s, checks: newChecks };
		});
		
		// Get current state for the executor
		let currentState: AnalysisState | undefined;
		const unsubscribe = analysisStore.subscribe(state => currentState = state);
		unsubscribe();
		
		if (!currentState) {
			throw new Error('Failed to get current analysis state');
		}
		
		// Execute the check
		const result = await check.executor(currentState);
		
		console.log(`✅ Check completed: ${result.status}`);
		if (result.duration) {
			console.log(`⏱️ Duration: ${result.duration}ms`);
		}
		if (result.error) {
			console.log(`❌ Error: ${result.error}`);
		}
		if (result.warning) {
			console.log(`⚠️ Warning: ${result.warning}`);
		}
		
		// Update with result
		analysisStore.update(s => {
			const newChecks = new Map(s.checks);
			newChecks.set(check.id, result);
			
			// Collect warnings and errors
			const warnings = [...s.warnings];
			const errors = [...s.errors];
			
			if (result.warning) warnings.push(result.warning);
			if (result.error) errors.push(result.error);
			
			return {
				...s,
				checks: newChecks,
				warnings,
				errors
			};
		});
		
		// If a required check failed, stop execution
		if (result.status === 'failed' && result.isRequired) {
			console.log('🛑 Required check failed, stopping analysis');
			analysisStore.update(s => ({
				...s,
				state: 'error',
				canCancel: false,
				canRetry: true
			}));
			break;
		}
	}
}

/**
 * Cancel current analysis
 */
export function cancelAnalysis() {
	analysisStore.update(s => ({
		...s,
		state: 'cancelled',
		canCancel: false,
		canRetry: true
	}));
}

/**
 * Reset analysis state
 */
export function resetAnalysis() {
	analysisStore.set({
		state: 'idle',
		repoUrl: '',
		repoInfo: null,
		checks: new Map(),
		currentCheck: null,
		progress: 0,
		toolYaml: null,
		citationCff: null,
		metadata: null,
		warnings: [],
		errors: [],
		canCancel: false,
		canRetry: false
	});
}
