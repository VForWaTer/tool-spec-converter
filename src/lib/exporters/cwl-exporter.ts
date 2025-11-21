// CWL (Common Workflow Language) CommandLineTool exporter

import { BaseExporter } from './base-exporter.js';
import type { UnifiedSoftwareMetadata, CwlExportConfig } from '../unified-metadata.js';
import type { ToolSpecParameter } from '../unified-metadata.js';
import { dump } from 'js-yaml';

export class CwlExporter extends BaseExporter {
	format = 'cwl';
	displayName = 'CWL';
	description = 'Common Workflow Language CommandLineTool specification for workflow portability';
	mimeType = 'application/x-yaml';
	fileExtension = 'cwl';
	
	export(data: UnifiedSoftwareMetadata, cwlConfig?: CwlExportConfig): string {
		console.log('🔄 Exporting to CWL format...');
		
		const config = cwlConfig || {
			cwlVersion: 'v1.2',
			outputs: [],
			baseCommand: undefined,
			container: data.galaxyConfig?.container
		};
		
		const cwlVersion = config.cwlVersion || 'v1.2';
		const toolId = this.generateToolId(data.name);
		const container = config.container || data.galaxyConfig?.container;
		
		// Build CWL document
		const cwl: any = {
			cwlVersion: cwlVersion,
			class: 'CommandLineTool',
			id: toolId,
			label: data.name,
			doc: data.description || data.citation.abstract || undefined
		};
		
		// Build inputs from toolSpec.parameters and data
		const inputs = this.buildInputs(data);
		if (Object.keys(inputs).length > 0) {
			cwl.inputs = inputs;
		}
		
		// Build outputs from config
		const outputs = this.buildOutputs(config.outputs || []);
		if (Object.keys(outputs).length > 0) {
			cwl.outputs = outputs;
		}
		
		// For tool-spec tools, we need to:
		// 1. Generate inputs.json from CWL inputs automatically
		// 2. Run docker with proper mountpoints and RUN_TOOL
		// Since CWL runs on the host, we use baseCommand as a shell script
		
		// Build the full command sequence: generate inputs.json, then run docker
		const commandSequence = this.generateCommandSequence(data, config, container);
		if (commandSequence) {
			cwl.baseCommand = ['sh', '-c'];
			cwl.arguments = [commandSequence];
		}
		
		// Add InitialWorkDirRequirement to create inputs directory and generate inputs.json
		if (data.toolSpec.parameters && Object.keys(data.toolSpec.parameters).length > 0) {
			if (!cwl.requirements) {
				cwl.requirements = {};
			}
			cwl.requirements.InitialWorkDirRequirement = {
				listing: this.generateInputsJsonListing(data)
			};
		}
		
		// Add metadata in s: namespace (v1.2 feature)
		// In v1.1, we can't use namespaces, so we add metadata differently
		if (cwlVersion === 'v1.2') {
			const metadata: any = {};
			if (data.authors.length > 0) {
				metadata['s:author'] = data.authors.map(author => {
					if (author.name) {
						return author.name;
					}
					return [author.givenNames, author.familyNames].filter(Boolean).join(' ');
				});
			}
			if (data.version) {
				metadata['s:version'] = data.version;
			}
			if (data.license.license) {
				const license = Array.isArray(data.license.license) ? data.license.license[0] : data.license.license;
				metadata['s:license'] = license;
			}
			
			if (Object.keys(metadata).length > 0) {
				cwl['$namespaces'] = {
					s: 'https://schema.org/'
				};
				Object.assign(cwl, metadata);
			}
		} else {
			// v1.1: Add metadata as comments or in doc field
			// v1.1 doesn't support $namespaces, so we add info to the doc
			if (data.authors.length > 0 || data.version || data.license.license) {
				const metadataParts: string[] = [];
				if (data.authors.length > 0) {
					const authorNames = data.authors.map(author => {
						if (author.name) return author.name;
						return [author.givenNames, author.familyNames].filter(Boolean).join(' ');
					}).join(', ');
					metadataParts.push(`Authors: ${authorNames}`);
				}
				if (data.version) {
					metadataParts.push(`Version: ${data.version}`);
				}
				if (data.license.license) {
					const license = Array.isArray(data.license.license) ? data.license.license[0] : data.license.license;
					metadataParts.push(`License: ${license}`);
				}
				
				const originalDoc = cwl.doc || '';
				cwl.doc = originalDoc ? `${originalDoc}\n\n${metadataParts.join('\n')}` : metadataParts.join('\n');
			}
		}
		
		console.log('✅ CWL export completed');
		return dump(cwl, { 
			indent: 2,
			lineWidth: -1,
			noRefs: true
		});
	}
	
	/**
	 * Generate tool ID from name
	 */
	private generateToolId(name: string): string {
		return name
			.toLowerCase()
			.replace(/[^a-z0-9]/g, '-')
			.replace(/-+/g, '-')
			.replace(/^-|-$/g, '');
	}
	
	/**
	 * Build inputs from toolSpec.parameters
	 */
	private buildInputs(data: UnifiedSoftwareMetadata): Record<string, any> {
		const inputs: Record<string, any> = {};
		
		if (!data.toolSpec.parameters) {
			return inputs;
		}
		
		// Tool-spec tools read inputs from inputs.json, not command-line arguments
		// So we don't add inputBinding - inputs will be staged as files
		// and a preprocessing step (user-provided or custom) will generate inputs.json
		for (const [paramName, paramDef] of Object.entries(data.toolSpec.parameters)) {
			const input: any = {
				type: this.mapToolSpecTypeToCwl(paramDef),
				label: paramName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
			};
			
			if (paramDef.description) {
				input.doc = paramDef.description;
			}
			
			// Note: No inputBinding - tool-spec doesn't use command-line args
			// Inputs will be staged and used to generate inputs.json
			
			// Add default value if available
			if (paramDef.default !== undefined && paramDef.default !== null) {
				input.default = paramDef.default;
			}
			
			inputs[paramName] = input;
		}
		
		return inputs;
	}
	
	/**
	 * Map tool-spec parameter type to CWL type
	 */
	private mapToolSpecTypeToCwl(paramDef: ToolSpecParameter): any {
		let baseType: string | string[];
		
		switch (paramDef.type) {
			case 'string':
				baseType = 'string';
				break;
			case 'integer':
				baseType = 'int';
				break;
			case 'float':
				baseType = 'float';
				break;
			case 'boolean':
				baseType = 'boolean';
				break;
			case 'enum':
				return {
					type: 'enum',
					symbols: paramDef.values || []
				};
			case 'asset':
				baseType = 'File'; // Default to File, could be Directory
				break;
			default:
				baseType = 'string';
		}
		
		// Handle optional (nullable)
		if (paramDef.optional) {
			baseType = ['null', baseType as string];
		}
		
		// Handle array
		if (paramDef.array) {
			return {
				type: 'array',
				items: baseType
			};
		}
		
		return baseType;
	}
	
	/**
	 * Generate input binding for parameter
	 */
	private generateInputBinding(paramName: string, paramDef: ToolSpecParameter, position: number): any {
		const binding: any = {
			position: position
		};
		
		// Try to infer prefix from parameter name
		if (paramName.length > 1 && paramName.startsWith('_')) {
			// Skip prefix for names starting with underscore
		} else if (paramName.length > 2) {
			// Use --param-name format for longer names
			binding.prefix = `--${paramName.replace(/_/g, '-')}`;
		} else {
			// Use -p format for short names
			binding.prefix = `-${paramName}`;
		}
		
		// For boolean types, use flag format (no value)
		if (paramDef.type === 'boolean') {
			binding.prefix = binding.prefix || `--${paramName.replace(/_/g, '-')}`;
			// Boolean flags don't need separateValue
		}
		
		return binding;
	}
	
	/**
	 * Build outputs from CWL output definitions
	 */
	private buildOutputs(outputs: Array<{ name: string; type: string; glob: string; label?: string; doc?: string }>): Record<string, any> {
		const cwlOutputs: Record<string, any> = {};
		
		for (const output of outputs) {
			const cwlOutput: any = {
				type: output.type,
				outputBinding: {
					glob: output.glob
				}
			};
			
			if (output.label) {
				cwlOutput.label = output.label;
			}
			
			if (output.doc) {
				cwlOutput.doc = output.doc;
			}
			
			cwlOutputs[output.name] = cwlOutput;
		}
		
		return cwlOutputs;
	}
	
	/**
	 * Generate full command sequence: create inputs.json, then run docker
	 */
	private generateCommandSequence(data: UnifiedSoftwareMetadata, config: CwlExportConfig, container?: string): string | undefined {
		if (!container) {
			return undefined;
		}
		
		const commands: string[] = [];
		
		// Step 1: Generate inputs.json from CWL inputs
		// CWL stages the inputs directory before execution, so no mkdir needed
		if (data.toolSpec.parameters && Object.keys(data.toolSpec.parameters).length > 0) {
			commands.push(this.generateInputsJsonCommand(data));
		} else {
			commands.push('echo "{}" > inputs/inputs.json');
		}
		
		// Step 2: Run docker with proper mountpoints and RUN_TOOL
		commands.push(this.generateDockerCommand(data, config, container));
		
		return commands.join(' && ');
	}
	
	/**
	 * Generate command to create inputs.json from CWL inputs
	 * Uses shell echo/printf to construct JSON directly (no Python required)
	 * CWL will evaluate $(inputs.xxx) expressions before the command runs
	 * Note: CWL stages the inputs directory before execution, so no mkdir needed
	 */
	private generateInputsJsonCommand(data: UnifiedSoftwareMetadata): string {
		if (!data.toolSpec.parameters || Object.keys(data.toolSpec.parameters).length === 0) {
			return 'echo "{}" > inputs/inputs.json';
		}
		
		// Build JSON entries using shell
		// CWL will substitute $(inputs.xxx) with actual values before execution
		const jsonEntries: string[] = [];
		
		for (const [paramName, paramDef] of Object.entries(data.toolSpec.parameters)) {
			// Escape the parameter name for JSON (handle special chars)
			const escapedName = paramName.replace(/"/g, '\\"');
			
			if (paramDef.type === 'asset') {
				// File input - use path, CWL substitutes as string
				jsonEntries.push(`  "${escapedName}": "$(inputs.${paramName}.path)"`);
			} else if (paramDef.type === 'integer' || paramDef.type === 'float') {
				// Numeric input - CWL substitutes as number (no quotes)
				jsonEntries.push(`  "${escapedName}": $(inputs.${paramName})`);
			} else if (paramDef.type === 'boolean') {
				// Boolean input - CWL substitutes as true/false (no quotes)
				jsonEntries.push(`  "${escapedName}": $(inputs.${paramName})`);
			} else {
				// String/enum input - CWL substitutes as string, need to escape quotes
				// Use printf to handle escaping properly
				jsonEntries.push(`  "${escapedName}": "$(inputs.${paramName})"`);
			}
		}
		
		// Use printf to create JSON file
		// CWL expressions will be substituted before this runs
		// CWL stages the inputs directory, so no mkdir needed
		return `printf '{\n${jsonEntries.join(',\n')}\n}' > inputs/inputs.json`;
	}
	
	/**
	 * Generate InitialWorkDirRequirement listing to create inputs directory
	 * Returns a valid CWL Directory entry conforming to the CWL spec
	 */
	private generateInputsJsonListing(data: UnifiedSoftwareMetadata): any[] {
		return [
			{
				class: 'Directory',
				basename: 'inputs',
				listing: [],
				writable: true
			}
		];
	}
	
	/**
	 * Generate Docker run command with proper mountpoints and RUN_TOOL
	 * Tool-spec tools are always containerized and read from inputs.json in /data/in
	 */
	private generateDockerCommand(data: UnifiedSoftwareMetadata, config: CwlExportConfig, container: string): string {
		// Get tool name for RUN_TOOL environment variable
		const toolName = this.generateToolId(data.name);
		
		// Build docker run command
		// Mount inputs directory (where inputs.json is) to /data/in
		// Mount outputs directory to /data/out  
		// Set RUN_TOOL environment variable to the tool name
		let dockerCmd = `docker run --rm -v "\$(pwd)/inputs:/data/in:ro" -v "\$(runtime.outdir)/outputs:/data/out:rw" -e RUN_TOOL=${toolName} ${container}`;
		
		// If user provided a custom baseCommand, use it as the command inside the container
		// Otherwise, the container's default command will run
		if (config.baseCommand) {
			if (typeof config.baseCommand === 'string') {
				dockerCmd += ` ${config.baseCommand}`;
			}
		}
		
		return dockerCmd;
	}
	
	validate(data: UnifiedSoftwareMetadata, cwlConfig?: CwlExportConfig): string[] {
		const errors = super.validate(data);
		const config = cwlConfig || {
			cwlVersion: 'v1.2',
			outputs: [],
			baseCommand: undefined,
			container: data.galaxyConfig?.container
		};
		
		// Check for inputs (CWL requires at least one input or output)
		if (!data.toolSpec.parameters || Object.keys(data.toolSpec.parameters).length === 0) {
			if (config.outputs.length === 0) {
				errors.push('CWL CommandLineTool requires at least one input or output');
			}
		}
		
		// Warn if outputs are empty (but allow export)
		if (config.outputs.length === 0) {
			// This is a warning, not an error - user can edit manually
			console.warn('⚠️ No outputs defined. CWL file will have empty outputs array.');
		}
		
		// Validate output definitions if provided
		if (config.outputs.length > 0) {
			config.outputs.forEach((output, index) => {
				if (!output.name || output.name.trim() === '') {
					errors.push(`Output ${index + 1}: name is required`);
				}
				if (!output.type || output.type.trim() === '') {
					errors.push(`Output ${index + 1}: type is required`);
				}
				if (!output.glob || output.glob.trim() === '') {
					errors.push(`Output ${index + 1}: glob pattern is required`);
				}
			});
		}
		
		return errors;
	}
	
	/**
	 * Override download to accept CWL config
	 */
	download(data: UnifiedSoftwareMetadata, filename?: string, cwlConfig?: CwlExportConfig): void {
		const content = this.export(data, cwlConfig);
		const blob = new Blob([content], { type: this.mimeType });
		const url = URL.createObjectURL(blob);
		
		const link = document.createElement('a');
		link.href = url;
		link.download = filename || `${data.name.replace(/[^a-zA-Z0-9]/g, '_')}.${this.fileExtension}`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	}
}

