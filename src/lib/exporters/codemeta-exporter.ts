// CodeMeta JSON-LD exporter

import { BaseExporter } from './base-exporter.js';
import type { UnifiedSoftwareMetadata } from '../unified-metadata.js';

export class CodeMetaExporter extends BaseExporter {
	format = 'codemeta';
	displayName = 'CodeMeta';
	description = 'JSON-LD metadata following the CodeMeta standard for scientific software';
	mimeType = 'application/ld+json';
	fileExtension = 'json';
	
	export(data: UnifiedSoftwareMetadata): string {
		console.log('🔄 Exporting to CodeMeta format...');
		
		const codemeta = {
			'@context': 'https://doi.org/10.5063/schema/codemeta-2.0',
			'@type': 'SoftwareSourceCode',
			
			// Basic Information
			name: data.name,
			description: data.description,
			version: data.version,
			
			// Authors
			author: data.authors.map(author => ({
				'@type': 'Person',
				...(author.name && { name: author.name }),
				...(author.givenNames && { givenName: author.givenNames }),
				...(author.familyNames && { familyName: author.familyNames }),
				...(author.email && { email: author.email }),
				...(author.affiliation && { affiliation: author.affiliation }),
				...(author.orcid && { '@id': author.orcid })
			})),
			
			// Maintainers (if available)
			...(data.maintainers.length > 0 && {
				maintainer: data.maintainers.map(maintainer => ({
					'@type': 'Person',
					...(maintainer.name && { name: maintainer.name }),
					...(maintainer.email && { email: maintainer.email })
				}))
			}),
			
			// Repository Information
			codeRepository: data.repository.htmlUrl,
			url: data.citation.url || data.repository.htmlUrl,
			
			// Technical Details
			programmingLanguage: data.programmingLanguage,
			keywords: data.keywords,
			
			// Licensing
			...(data.license.license && {
				license: Array.isArray(data.license.license) 
					? data.license.license[0] 
					: data.license.license
			}),
			
			// Tool-Spec Specific
			...(data.toolSpec.parameters && {
				softwareRequirements: this.formatSoftwareRequirements(data.toolSpec.parameters),
				parameterSummary: this.getParameterSummary(data.toolSpec.parameters)
			}),
			
			// Citation Information
			...(data.citation.abstract && { abstract: data.citation.abstract }),
			...(data.citation.dateReleased && { datePublished: data.citation.dateReleased }),
			
			// Metadata
			dateModified: data.generatedAt,
			generator: {
				'@type': 'SoftwareApplication',
				name: data.generator,
				version: data.generatorVersion
			}
		};
		
		console.log('✅ CodeMeta export completed');
		return JSON.stringify(codemeta, null, 2);
	}
	
	/**
	 * Format tool-spec parameters as software requirements
	 */
	private formatSoftwareRequirements(parameters: Record<string, any>): string[] {
		const requirements: string[] = [];
		
		for (const [paramName, paramDef] of Object.entries(parameters)) {
			if (paramDef.type === 'asset' && paramDef.description) {
				requirements.push(`${paramName}: ${paramDef.description}`);
			}
		}
		
		return requirements;
	}
	
	/**
	 * Get parameter summary for CodeMeta
	 */
	private getParameterSummary(parameters: Record<string, any>): any {
		if (!parameters) return undefined;
		
		const paramSummary = {
			totalParameters: Object.keys(parameters).length,
			requiredParameters: 0,
			optionalParameters: 0,
			parameterTypes: {} as Record<string, number>
		};
		
		for (const [paramName, paramDef] of Object.entries(parameters)) {
			if (paramDef.optional) {
				paramSummary.optionalParameters++;
			} else {
				paramSummary.requiredParameters++;
			}
			
			const type = paramDef.type || 'unknown';
			paramSummary.parameterTypes[type] = (paramSummary.parameterTypes[type] || 0) + 1;
		}
		
		return paramSummary;
	}
	
	validate(data: UnifiedSoftwareMetadata): string[] {
		const errors = super.validate(data);
		
		// CodeMeta specific validations
		if (!data.repository.htmlUrl) {
			errors.push('Repository URL is required for CodeMeta');
		}
		
		return errors;
	}
}
