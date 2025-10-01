// Tool-spec validation logic

import { load } from 'js-yaml';

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

export interface ToolSpecData {
	description?: string;
	example?: string;
	extension?: string | string[];
}

export interface ToolSpec {
	title: string;
	description: string;
	parameters?: Record<string, ToolSpecParameter>;
	data?: Record<string, ToolSpecData> | string[];
}

export interface ToolSpecValidationResult {
	isValid: boolean;
	toolSpec: ToolSpec | null;
	errors: string[];
	warnings: string[];
}

/**
 * Validate tool.yml content according to tool-spec standards
 */
export function validateToolSpec(yamlContent: string): ToolSpecValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	
	try {
		// Parse YAML
		const parsed = load(yamlContent) as any;
		console.log('🔍 Parsed YAML structure:', parsed);
		
		if (!parsed || typeof parsed !== 'object') {
			errors.push('Invalid YAML: Root must be an object');
			return { isValid: false, toolSpec: null, errors, warnings };
		}
		
		// Check for tools section
		if (!parsed.tools || typeof parsed.tools !== 'object') {
			errors.push('Missing required "tools" section');
			return { isValid: false, toolSpec: null, errors, warnings };
		}
		
		// Get the first (and typically only) tool
		const toolNames = Object.keys(parsed.tools);
		if (toolNames.length === 0) {
			errors.push('No tools defined in "tools" section');
			return { isValid: false, toolSpec: null, errors, warnings };
		}
		
		if (toolNames.length > 1) {
			warnings.push(`Multiple tools found (${toolNames.length}), using first one: ${toolNames[0]}`);
		}
		
		const toolName = toolNames[0];
		const tool = parsed.tools[toolName];
		
		console.log(`🔧 Validating tool: "${toolName}"`);
		console.log('📋 Tool definition:', tool);
		
		// Validate required fields
		if (!tool.title || typeof tool.title !== 'string') {
			errors.push('Missing required field: "title"');
		}
		
		if (!tool.description || typeof tool.description !== 'string') {
			errors.push('Missing required field: "description"');
		}
		
		// Version field is deprecated - ignore it completely but warn if present
		if (tool.version) {
			warnings.push('Field "version" is deprecated and ignored. Use semantic version tags on the GitHub repository instead.');
		}
		
		// Validate parameters if present
		if (tool.parameters) {
			console.log('⚙️ Validating parameters...');
			validateParameters(tool.parameters, errors, warnings);
		}
		
		// Validate data if present
		if (tool.data) {
			console.log('📊 Validating data definitions...');
			validateData(tool.data, errors, warnings);
		}
		
		// Create the validated tool spec (ignore version field completely)
		const toolSpec: ToolSpec = {
			title: tool.title || '',
			description: tool.description || '',
			// version field is completely ignored - use GitHub repo tags instead
			parameters: tool.parameters || undefined,
			data: tool.data || undefined
		};
		
		console.log('✅ Tool spec validation completed');
		console.log('📝 Extracted tool spec:', toolSpec);
		
		// Log detailed parameter and data information
		if (toolSpec.parameters) {
			console.log('⚙️ Tool Parameters:');
			Object.entries(toolSpec.parameters).forEach(([paramName, paramDef]) => {
				console.log(`  - ${paramName}:`, {
					type: paramDef.type,
					description: paramDef.description || 'No description',
					optional: paramDef.optional || false,
					default: paramDef.default || 'No default',
					array: paramDef.array || false,
					...(paramDef.type === 'enum' && { values: paramDef.values }),
					...(paramDef.type === 'integer' || paramDef.type === 'float') && {
						min: paramDef.min || 'No min',
						max: paramDef.max || 'No max'
					}
				});
			});
		}
		
		if (toolSpec.data) {
			console.log('📊 Tool Data:');
			if (Array.isArray(toolSpec.data)) {
				toolSpec.data.forEach((dataItem, index) => {
					console.log(`  - ${index + 1}: ${dataItem}`);
				});
			} else {
				Object.entries(toolSpec.data).forEach(([dataName, dataDef]) => {
					console.log(`  - ${dataName}:`, {
						description: dataDef.description || 'No description',
						extension: dataDef.extension || 'No extension specified',
						example: dataDef.example || 'No example'
					});
				});
			}
		}
		
		return {
			isValid: errors.length === 0,
			toolSpec,
			errors,
			warnings
		};
		
	} catch (error) {
		console.error('❌ YAML parsing error:', error);
		errors.push(`YAML parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`);
		return { isValid: false, toolSpec: null, errors, warnings };
	}
}

/**
 * Validate parameters section
 */
function validateParameters(parameters: any, errors: string[], warnings: string[]): void {
	if (typeof parameters !== 'object' || Array.isArray(parameters)) {
		errors.push('Parameters must be an object');
		return;
	}
	
	for (const [paramName, paramDef] of Object.entries(parameters)) {
		console.log(`  🔍 Validating parameter: ${paramName}`);
		
		if (!paramDef || typeof paramDef !== 'object') {
			errors.push(`Parameter "${paramName}" must be an object`);
			continue;
		}
		
		const param = paramDef as any;
		
		// Validate required type field
		if (!param.type) {
			errors.push(`Parameter "${paramName}" missing required "type" field`);
			continue;
		}
		
		const validTypes = ['string', 'integer', 'float', 'boolean', 'enum', 'asset'];
		if (!validTypes.includes(param.type)) {
			errors.push(`Parameter "${paramName}" has invalid type "${param.type}". Must be one of: ${validTypes.join(', ')}`);
		}
		
		// Validate enum-specific fields
		if (param.type === 'enum') {
			if (!param.values || !Array.isArray(param.values)) {
				errors.push(`Parameter "${paramName}" with type "enum" must have "values" array`);
			}
			if (param.array === true) {
				errors.push(`Parameter "${paramName}" cannot combine "type=enum" with "array=true"`);
			}
		}
		
		// Validate min/max for numeric types
		if (param.type === 'integer' || param.type === 'float') {
			if (param.min !== undefined && typeof param.min !== 'number') {
				errors.push(`Parameter "${paramName}" min value must be a number`);
			}
			if (param.max !== undefined && typeof param.max !== 'number') {
				errors.push(`Parameter "${paramName}" max value must be a number`);
			}
			if (param.min !== undefined && param.max !== undefined && param.min >= param.max) {
				errors.push(`Parameter "${paramName}" min value must be less than max value`);
			}
		}
		
		// Validate array field
		if (param.array !== undefined && typeof param.array !== 'boolean') {
			errors.push(`Parameter "${paramName}" array field must be boolean`);
		}
		
		// Validate optional field
		if (param.optional !== undefined && typeof param.optional !== 'boolean') {
			errors.push(`Parameter "${paramName}" optional field must be boolean`);
		}
		
		console.log(`  ✅ Parameter "${paramName}" validated`);
	}
}

/**
 * Validate data section
 */
function validateData(data: any, errors: string[], warnings: string[]): void {
	if (Array.isArray(data)) {
		// Simple array format
		console.log('  📋 Data defined as simple array');
		for (const item of data) {
			if (typeof item !== 'string') {
				errors.push(`Data item must be a string, got: ${typeof item}`);
			}
		}
	} else if (typeof data === 'object') {
		// Object format with detailed definitions
		console.log('  📋 Data defined as detailed object');
		for (const [dataName, dataDef] of Object.entries(data)) {
			console.log(`  🔍 Validating data: ${dataName}`);
			
			if (!dataDef || typeof dataDef !== 'object') {
				errors.push(`Data "${dataName}" must be an object`);
				continue;
			}
			
			const dataItem = dataDef as any;
			
			// Validate extension field
			if (dataItem.extension !== undefined) {
				if (typeof dataItem.extension !== 'string' && !Array.isArray(dataItem.extension)) {
					errors.push(`Data "${dataName}" extension must be string or array of strings`);
				}
			}
			
			console.log(`  ✅ Data "${dataName}" validated`);
		}
	} else {
		errors.push('Data must be an array or object');
	}
}
