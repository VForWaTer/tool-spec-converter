// Schema.org JSON-LD exporter

import { BaseExporter } from './base-exporter.js';
import type { UnifiedSoftwareMetadata, Author } from '../unified-metadata.js';

export class SchemaOrgExporter extends BaseExporter {
	format = 'schema-org';
	displayName = 'Schema.org';
	description = 'JSON-LD metadata following Schema.org SoftwareApplication standard for web discoverability';
	mimeType = 'application/ld+json';
	fileExtension = 'json';
	
	export(data: UnifiedSoftwareMetadata): string {
		console.log('🔄 Exporting to Schema.org format...');
		
		const schemaOrg = {
			'@context': 'https://schema.org',
			'@type': 'SoftwareApplication',
			
			// Basic Information
			name: data.name,
			description: data.description,
			
			// Version
			...(data.version && { softwareVersion: data.version }),
			
			// Authors
			author: data.authors.map(author => this.mapAuthor(author)),
			
			// Maintainers (if available)
			...(data.maintainers.length > 0 && {
				maintainer: data.maintainers.map(maintainer => this.mapAuthor(maintainer))
			}),
			
			// URLs
			...(data.citation.url || data.repository.htmlUrl ? {
				url: data.citation.url || data.repository.htmlUrl
			} : {}),
			...(data.repository.htmlUrl || data.repository.cloneUrl ? {
				codeRepository: data.repository.htmlUrl || data.repository.cloneUrl
			} : {}),
			
			// Technical Details
			...(data.programmingLanguage && { programmingLanguage: data.programmingLanguage }),
			...(data.keywords.length > 0 && { keywords: data.keywords }),
			
			// Licensing
			...(data.license.license && {
				license: this.normalizeLicense(data.license.license)
			}),
			
			// Dates
			...(data.citation.dateReleased && { datePublished: this.formatDate(data.citation.dateReleased) }),
			...(data.repository.createdAt && { dateCreated: this.formatDate(data.repository.createdAt) }),
			...(data.repository.updatedAt || data.generatedAt ? {
				dateModified: this.formatDate(data.repository.updatedAt || data.generatedAt)
			} : {}),
			
			// Abstract
			...(data.citation.abstract && { abstract: data.citation.abstract }),
			
			// Citation (as CreativeWork)
			...(this.hasCitationData(data) && {
				citation: this.formatCitation(data)
			}),
			
			// Software Requirements (from tool-spec parameters)
			...(data.toolSpec.parameters && {
				softwareRequirements: this.formatSoftwareRequirements(data.toolSpec.parameters)
			})
		};
		
		console.log('✅ Schema.org export completed');
		return JSON.stringify(schemaOrg, null, 2);
	}
	
	/**
	 * Map author to Schema.org Person format
	 * Prefers structured (givenName/familyName) over literal (name) if both present
	 */
	private mapAuthor(author: Author): any {
		const person: any = {
			'@type': 'Person'
		};
		
		// Prefer structured names over literal name
		if (author.givenNames || author.familyNames) {
			if (author.givenNames) {
				person.givenName = author.givenNames;
			}
			if (author.familyNames) {
				person.familyName = author.familyNames;
			}
		} else if (author.name) {
			person.name = author.name;
		}
		
		// Add optional fields
		if (author.email) {
			person.email = author.email;
		}
		if (author.affiliation) {
			person.affiliation = {
				'@type': 'Organization',
				name: author.affiliation
			};
		}
		
		// Add ORCID identifier
		if (author.orcid) {
			const orcidUrl = author.orcid.startsWith('http') 
				? author.orcid 
				: `https://orcid.org/${author.orcid.replace(/^https?:\/\/orcid\.org\//, '')}`;
			
			person.identifier = {
				'@type': 'PropertyValue',
				propertyID: 'ORCID',
				value: orcidUrl
			};
		}
		
		return person;
	}
	
	/**
	 * Normalize license string to SPDX format, fall back to original if normalization fails
	 */
	private normalizeLicense(license: string | string[]): string {
		const licenseStr = Array.isArray(license) ? license[0] : license;
		
		if (!licenseStr) {
			return '';
		}
		
		// Common SPDX license identifiers
		const spdxMap: Record<string, string> = {
			'mit': 'MIT',
			'apache': 'Apache-2.0',
			'apache-2.0': 'Apache-2.0',
			'apache2': 'Apache-2.0',
			'gpl': 'GPL-3.0',
			'gpl-3.0': 'GPL-3.0',
			'gpl-2.0': 'GPL-2.0',
			'gplv3': 'GPL-3.0',
			'gplv2': 'GPL-2.0',
			'bsd': 'BSD-3-Clause',
			'bsd-3-clause': 'BSD-3-Clause',
			'bsd-2-clause': 'BSD-2-Clause',
			'mozilla': 'MPL-2.0',
			'mpl-2.0': 'MPL-2.0',
			'eclipse': 'EPL-1.0',
			'epl-1.0': 'EPL-1.0',
			'unlicense': 'Unlicense',
			'cc0': 'CC0-1.0',
			'cc0-1.0': 'CC0-1.0'
		};
		
		// Try to normalize
		const normalized = licenseStr
			.toLowerCase()
			.replace(/[^a-z0-9-]/g, '')
			.trim();
		
		// Check for exact match or partial match
		if (spdxMap[normalized]) {
			return spdxMap[normalized];
		}
		
		// Check for partial matches
		for (const [key, value] of Object.entries(spdxMap)) {
			if (normalized.includes(key) || key.includes(normalized)) {
				return value;
			}
		}
		
		// Fall back to original
		return licenseStr;
	}
	
	/**
	 * Format date to ISO 8601 string
	 */
	private formatDate(date: string): string {
		if (!date) {
			return '';
		}
		
		// If already in ISO format, return as-is
		if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/.test(date)) {
			return date;
		}
		
		// Try to parse and format
		try {
			const parsed = new Date(date);
			if (!isNaN(parsed.getTime())) {
				return parsed.toISOString();
			}
		} catch (e) {
			// Fall through to return original
		}
		
		// Return original if parsing fails
		return date;
	}
	
	/**
	 * Check if citation data is available
	 */
	private hasCitationData(data: UnifiedSoftwareMetadata): boolean {
		return !!(data.citation.title || 
			data.citation.authors.length > 0 || 
			data.citation.dateReleased ||
			data.citation.url);
	}
	
	/**
	 * Format citation as Schema.org CreativeWork
	 */
	private formatCitation(data: UnifiedSoftwareMetadata): any {
		const citation: any = {
			'@type': 'CreativeWork'
		};
		
		if (data.citation.title) {
			citation.name = data.citation.title;
		}
		
		if (data.citation.authors.length > 0) {
			citation.author = data.citation.authors.map(author => this.mapAuthor(author));
		}
		
		if (data.citation.dateReleased) {
			citation.datePublished = this.formatDate(data.citation.dateReleased);
		}
		
		if (data.citation.url) {
			citation.url = data.citation.url;
		}
		
		if (data.citation.abstract) {
			citation.abstract = data.citation.abstract;
		}
		
		if (data.citation.keywords && data.citation.keywords.length > 0) {
			citation.keywords = data.citation.keywords;
		}
		
		return citation;
	}
	
	/**
	 * Format tool-spec parameters as software requirements
	 */
	private formatSoftwareRequirements(parameters: Record<string, any>): string[] {
		const requirements: string[] = [];
		
		for (const [paramName, paramDef] of Object.entries(parameters)) {
			if (paramDef.type === 'asset' && paramDef.description) {
				requirements.push(`${paramName}: ${paramDef.description}`);
			} else if (paramDef.description) {
				requirements.push(`${paramName} (${paramDef.type}): ${paramDef.description}`);
			}
		}
		
		return requirements;
	}
	
	validate(data: UnifiedSoftwareMetadata): string[] {
		const errors = super.validate(data);
		
		// Require url or codeRepository (at least one)
		if (!data.citation.url && !data.repository.htmlUrl && !data.repository.cloneUrl) {
			errors.push('At least one of "url" or "codeRepository" is required for Schema.org');
		}
		
		// Require softwareVersion
		if (!data.version) {
			errors.push('Software version is required for Schema.org');
		}
		
		return errors;
	}
}

