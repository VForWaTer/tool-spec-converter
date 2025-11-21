// Galaxy tool.xml exporter

import { BaseExporter } from './base-exporter.js';
import type { UnifiedSoftwareMetadata, GalaxyExportConfig, GalaxyOutput } from '../unified-metadata.js';

export class GalaxyExporter extends BaseExporter {
	format = 'galaxy';
	displayName = 'Galaxy';
	description = 'Galaxy tool.xml format for tool integration';
	mimeType = 'application/xml';
	fileExtension = 'xml';
	
	export(data: UnifiedSoftwareMetadata, galaxyConfig?: GalaxyExportConfig): string {
		console.log('🔄 Exporting to Galaxy tool.xml format...');
		
		const config = galaxyConfig || data.galaxyConfig;
		if (!config) {
			throw new Error('Galaxy configuration is required for export');
		}
		
		// Generate tool ID from repository name
		const toolId = this.generateToolId(data.repository.name);
		
		// Get short description (first sentence) and full description
		const shortDesc = this.getShortDescription(data.description);
		const fullDesc = data.description;
		
		// Get version
		const version = data.version;
		
		// Get profile
		const profile = config.profile || '24.0';
		
		// Build XML
		const xml = this.buildToolXml({
			toolId,
			name: data.name,
			version,
			profile,
			shortDescription: shortDesc,
			help: fullDesc,
			command: config.command || '',
			inputs: this.buildInputs(data),
			outputs: config.outputs || [],
			container: config.container,
			containerVersion: config.containerVersion,
			citations: data.citation,
			authors: data.authors
		});
		
		console.log('✅ Galaxy export completed');
		return xml;
	}
	
	/**
	 * Generate tool ID from repository name
	 */
	private generateToolId(repoName: string): string {
		// Convert to lowercase, replace special chars with underscores
		return repoName
			.toLowerCase()
			.replace(/[^a-z0-9]/g, '_')
			.replace(/_+/g, '_')
			.replace(/^_|_$/g, '') + '_v1';
	}
	
	/**
	 * Get short description (first sentence)
	 */
	private getShortDescription(description: string): string {
		if (!description) return '';
		
		// Find first sentence (ending with . ! or ?)
		const match = description.match(/^[^.!?]+[.!?]/);
		if (match) {
			return match[0].trim();
		}
		
		// If no sentence ending, take first 100 chars
		return description.substring(0, 100).trim();
	}
	
	/**
	 * Build inputs section from tool-spec parameters and data
	 */
	private buildInputs(data: UnifiedSoftwareMetadata): string {
		const inputs: string[] = [];
		
		// Add data inputs from toolSpec.data
		if (data.toolSpec.data) {
			if (Array.isArray(data.toolSpec.data)) {
				data.toolSpec.data.forEach((dataItem, index) => {
					const dataName = typeof dataItem === 'string' ? dataItem : `data_${index + 1}`;
					inputs.push(this.buildDataInput(dataName, typeof dataItem === 'string' ? undefined : dataItem));
				});
			} else {
				Object.entries(data.toolSpec.data).forEach(([dataName, dataDef]) => {
					inputs.push(this.buildDataInput(dataName, dataDef));
				});
			}
		}
		
		// Add parameters from toolSpec.parameters
		if (data.toolSpec.parameters) {
			Object.entries(data.toolSpec.parameters).forEach(([paramName, paramDef]) => {
				inputs.push(this.buildParameterInput(paramName, paramDef));
			});
		}
		
		return inputs.join('\n    ');
	}
	
	/**
	 * Build a data input element
	 */
	private buildDataInput(name: string, dataDef?: { description?: string; extension?: string | string[] }): string {
		const label = this.sanitizeXml(name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
		const format = this.determineDataFormat(dataDef?.extension);
		
		let xml = `    <param name="${this.sanitizeXml(name)}" type="data" label="${label}" format="${format}"`;
		
		if (dataDef?.description) {
			xml += ` help="${this.sanitizeXml(dataDef.description)}"`;
		}
		
		xml += ' />';
		return xml;
	}
	
	/**
	 * Build a parameter input element
	 */
	private buildParameterInput(name: string, paramDef: any): string {
		const label = this.sanitizeXml(name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
		const galaxyType = this.mapToolSpecTypeToGalaxy(paramDef.type);
		
		let xml = `    <param name="${this.sanitizeXml(name)}" type="${galaxyType}" label="${label}"`;
		
		// Add optional attribute
		if (paramDef.optional) {
			xml += ' optional="true"';
		}
		
		// Add default value
		if (paramDef.default !== undefined && paramDef.default !== null) {
			xml += ` value="${this.sanitizeXml(String(paramDef.default))}"`;
		}
		
		// Add min/max for numeric types
		if ((paramDef.type === 'integer' || paramDef.type === 'float') && paramDef.min !== undefined) {
			xml += ` min="${paramDef.min}"`;
		}
		if ((paramDef.type === 'integer' || paramDef.type === 'float') && paramDef.max !== undefined) {
			xml += ` max="${paramDef.max}"`;
		}
		
		// Add help text (from description)
		if (paramDef.description) {
			xml += ` help="${this.sanitizeXml(paramDef.description)}"`;
		}
		
		// Handle enum/select type
		if (paramDef.type === 'enum' && paramDef.values && paramDef.values.length > 0) {
			xml += '>\n';
			paramDef.values.forEach((value: string) => {
				xml += `      <option value="${this.sanitizeXml(value)}">${this.sanitizeXml(value)}</option>\n`;
			});
			xml += '    </param>';
		} else {
			xml += ' />';
		}
		
		return xml;
	}
	
	/**
	 * Map tool-spec parameter type to Galaxy input type
	 */
	private mapToolSpecTypeToGalaxy(type: string): string {
		const mapping: Record<string, string> = {
			'string': 'text',
			'integer': 'integer',
			'float': 'float',
			'boolean': 'boolean',
			'enum': 'select',
			'asset': 'data'
		};
		
		return mapping[type] || 'text';
	}
	
	/**
	 * Determine Galaxy datatype from file extension
	 */
	private determineDataFormat(extension?: string | string[]): string {
		if (!extension) return 'data';
		
		const ext = Array.isArray(extension) ? extension[0] : extension;
		const extLower = ext.toLowerCase().replace(/^\./, '');
		
		// Common Galaxy datatypes
		const formatMap: Record<string, string> = {
			'txt': 'txt',
			'tsv': 'tabular',
			'csv': 'csv',
			'json': 'json',
			'xml': 'xml',
			'fasta': 'fasta',
			'fastq': 'fastqsanger',
			'gff': 'gff',
			'gtf': 'gtf',
			'bed': 'bed',
			'vcf': 'vcf',
			'sam': 'sam',
			'bam': 'bam'
		};
		
		return formatMap[extLower] || 'data';
	}
	
	/**
	 * Build the complete tool.xml
	 */
	private buildToolXml(options: {
		toolId: string;
		name: string;
		version: string;
		profile: string;
		shortDescription: string;
		help: string;
		command: string;
		inputs: string;
		outputs: GalaxyOutput[];
		container?: string;
		containerVersion?: string;
		citations: any;
		authors: any[];
	}): string {
		let xml = `<?xml version="1.0"?>
<tool id="${this.sanitizeXml(options.toolId)}" name="${this.sanitizeXml(options.name)}" version="${this.sanitizeXml(options.version)}" profile="${this.sanitizeXml(options.profile)}">
    <description>${this.sanitizeXml(options.shortDescription)}</description>
    <help>${this.sanitizeXml(options.help)}</help>
    <command`;
		
		// Add interpreter if command suggests one
		if (options.command.includes('python')) {
			xml += ' interpreter="python"';
		} else if (options.command.includes('perl')) {
			xml += ' interpreter="perl"';
		} else if (options.command.includes('Rscript')) {
			xml += ' interpreter="Rscript"';
		}
		
		xml += `>${this.sanitizeXml(options.command)}</command>
    <inputs>
${options.inputs}
    </inputs>
    <outputs>`;
		
		// Add output definitions
		if (options.outputs.length > 0) {
			options.outputs.forEach(output => {
				xml += `
        <data name="${this.sanitizeXml(output.name)}" label="${this.sanitizeXml(output.label)}" format="${this.sanitizeXml(output.format)}"`;
				if (output.description) {
					xml += `>
            <change_format>
                <when input="format" value="${this.sanitizeXml(output.format)}" format="${this.sanitizeXml(output.format)}"/>
            </change_format>
        </data>`;
				} else {
					xml += ' />';
				}
			});
		} else {
			xml += `
        <!-- Add output definitions here. Example:
        <data name="output" label="Output File" format="txt" /> -->`;
		}
		
		xml += `
    </outputs>
    <requirements>`;
		
		// Add container requirement
		if (options.container) {
			xml += `
        <container type="docker">${this.sanitizeXml(options.container)}</container>`;
		} else {
			xml += `
        <!-- Add container requirement here -->`;
		}
		
		xml += `
    </requirements>`;
		
		// Add citations
		if (options.citations && (options.authors.length > 0 || options.citations.title)) {
			xml += `
    <citations>
        <citation type="citation.cff">`;
			
			if (options.citations.title) {
				xml += `
            <name>${this.sanitizeXml(options.citations.title)}</name>`;
			}
			
			if (options.authors.length > 0) {
				options.authors.forEach(author => {
					xml += `
            <author`;
					if (author.name) {
						xml += ` name="${this.sanitizeXml(author.name)}"`;
					} else if (author.givenNames || author.familyNames) {
						xml += ` name="${this.sanitizeXml([author.givenNames, author.familyNames].filter(Boolean).join(' '))}"`;
					}
					if (author.email) {
						xml += ` email="${this.sanitizeXml(author.email)}"`;
					}
					xml += ' />';
				});
			}
			
			xml += `
        </citation>
    </citations>`;
		}
		
		// Add stdio (exit code handling)
		xml += `
    <stdio>
        <exit_code range="1:" level="fatal"/>
    </stdio>
</tool>`;
		
		return xml;
	}
	
	/**
	 * Sanitize XML special characters
	 */
	private sanitizeXml(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&apos;');
	}
	
	validate(data: UnifiedSoftwareMetadata, galaxyConfig?: GalaxyExportConfig): string[] {
		const errors = super.validate(data);
		const config = galaxyConfig || data.galaxyConfig;
		
		if (!config) {
			errors.push('Galaxy configuration is required');
			return errors;
		}
		
		// Check for required command
		if (!config.command || config.command.trim() === '') {
			errors.push('Command is required for Galaxy export');
		}
		
		// Validate outputs (if provided)
		if (config.outputs && config.outputs.length > 0) {
			config.outputs.forEach((output, index) => {
				if (!output.name || output.name.trim() === '') {
					errors.push(`Output ${index + 1}: name is required`);
				}
				if (!output.label || output.label.trim() === '') {
					errors.push(`Output ${index + 1}: label is required`);
				}
				if (!output.format || output.format.trim() === '') {
					errors.push(`Output ${index + 1}: format is required`);
				}
			});
		}
		// Note: outputs are optional - user can add them manually in the XML
		
		return errors;
	}
	
	/**
	 * Override download to accept Galaxy config
	 */
	download(data: UnifiedSoftwareMetadata, filename?: string, galaxyConfig?: GalaxyExportConfig): void {
		const content = this.export(data, galaxyConfig);
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

