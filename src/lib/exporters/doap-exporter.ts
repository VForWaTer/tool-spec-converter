// DOAP (Description of a Project) RDF exporter

import { BaseExporter } from './base-exporter.js';
import type { UnifiedSoftwareMetadata, Author } from '../unified-metadata.js';

export interface DoapConfig {
	maintainer?: Author;
	format?: 'turtle' | 'rdfxml';
}

export class DoapExporter extends BaseExporter {
	format = 'doap';
	displayName = 'DOAP';
	description = 'RDF vocabulary for describing software projects (Description of a Project)';
	mimeType = 'application/rdf+xml';
	fileExtension = 'rdf';

	// DOAP namespaces
	private readonly DOAP_NS = 'http://usefulinc.com/ns/doap#';
	private readonly FOAF_NS = 'http://xmlns.com/foaf/0.1/';
	private readonly RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
	private readonly RDFS_NS = 'http://www.w3.org/2000/01/rdf-schema#';
	private readonly SPDX_NS = 'http://spdx.org/licenses/';

	export(data: UnifiedSoftwareMetadata, doapConfig?: DoapConfig): string {
		console.log('🔄 Exporting to DOAP format...');

		const format = doapConfig?.format || 'turtle';
		const projectUri = this.generateProjectUri(data);
		const triples: Array<{ subject: string; predicate: string; object: string; isUri: boolean }> = [];

		// Add type
		triples.push({
			subject: projectUri,
			predicate: `${this.RDF_NS}type`,
			object: `${this.DOAP_NS}Project`,
			isUri: true
		});

		// Required fields
		triples.push({
			subject: projectUri,
			predicate: `${this.DOAP_NS}name`,
			object: data.name,
			isUri: false
		});

		triples.push({
			subject: projectUri,
			predicate: `${this.DOAP_NS}description`,
			object: data.description,
			isUri: false
		});

		// Short description (first sentence)
		const shortDesc = this.getShortDescription(data.description);
		if (shortDesc) {
			triples.push({
				subject: projectUri,
				predicate: `${this.DOAP_NS}shortdesc`,
				object: shortDesc,
				isUri: false
			});
		}

		// Maintainer (required)
		const maintainer = this.resolveMaintainer(data, doapConfig);
		if (maintainer) {
			const maintainerUri = this.generatePersonUri(maintainer, 'maintainer');
			this.addPersonTriples(triples, maintainerUri, maintainer);
			triples.push({
				subject: projectUri,
				predicate: `${this.DOAP_NS}maintainer`,
				object: maintainerUri,
				isUri: true
			});
		}

		// Homepage
		const homepage = data.citation.url || data.repository.htmlUrl;
		if (homepage) {
			triples.push({
				subject: projectUri,
				predicate: `${this.DOAP_NS}homepage`,
				object: homepage,
				isUri: true
			});
		}

		// License (SPDX URIs)
		if (data.license.license) {
			const licenses = Array.isArray(data.license.license) 
				? data.license.license 
				: [data.license.license];
			
			for (const license of licenses) {
				const spdxUri = this.convertLicenseToSpdxUri(license);
				if (spdxUri) {
					triples.push({
						subject: projectUri,
						predicate: `${this.DOAP_NS}license`,
						object: spdxUri,
						isUri: true
					});
				}
			}
		}

		// Programming language
		if (data.programmingLanguage && data.programmingLanguage !== 'Unknown') {
			triples.push({
				subject: projectUri,
				predicate: `${this.DOAP_NS}programming-language`,
				object: data.programmingLanguage,
				isUri: false
			});
		}

		// Categories (from keywords)
		if (data.keywords && data.keywords.length > 0) {
			for (const keyword of data.keywords) {
				triples.push({
					subject: projectUri,
					predicate: `${this.DOAP_NS}category`,
					object: keyword,
					isUri: false
				});
			}
		}

		// Repository
		if (data.repository.cloneUrl || data.repository.htmlUrl) {
			const repoUri = this.generateRepositoryUri(data);
			triples.push({
				subject: projectUri,
				predicate: `${this.DOAP_NS}repository`,
				object: repoUri,
				isUri: true
			});
			triples.push({
				subject: repoUri,
				predicate: `${this.RDF_NS}type`,
				object: `${this.DOAP_NS}GitRepository`,
				isUri: true
			});
			
			if (data.repository.cloneUrl) {
				triples.push({
					subject: repoUri,
					predicate: `${this.DOAP_NS}location`,
					object: data.repository.cloneUrl,
					isUri: true
				});
			}
			
			if (data.repository.htmlUrl) {
				triples.push({
					subject: repoUri,
					predicate: `${this.DOAP_NS}browse`,
					object: data.repository.htmlUrl,
					isUri: true
				});
			}
		}

		// Developers (authors)
		if (data.authors && data.authors.length > 0) {
			for (const author of data.authors) {
				const authorUri = this.generatePersonUri(author, 'developer');
				this.addPersonTriples(triples, authorUri, author);
				triples.push({
					subject: projectUri,
					predicate: `${this.DOAP_NS}developer`,
					object: authorUri,
					isUri: true
				});
			}
		}

		// Revision
		if (data.version) {
			triples.push({
				subject: projectUri,
				predicate: `${this.DOAP_NS}revision`,
				object: data.version,
				isUri: false
			});
		}

		// Release (structured version)
		if (data.version && data.citation.dateReleased) {
			const releaseUri = this.generateReleaseUri(data);
			triples.push({
				subject: projectUri,
				predicate: `${this.DOAP_NS}release`,
				object: releaseUri,
				isUri: true
			});
			triples.push({
				subject: releaseUri,
				predicate: `${this.RDF_NS}type`,
				object: `${this.DOAP_NS}Version`,
				isUri: true
			});
			triples.push({
				subject: releaseUri,
				predicate: `${this.DOAP_NS}revision`,
				object: data.version,
				isUri: false
			});
			triples.push({
				subject: releaseUri,
				predicate: `${this.DOAP_NS}created`,
				object: data.citation.dateReleased,
				isUri: false
			});
		}

		// Serialize to requested format
		if (format === 'turtle') {
			console.log('✅ DOAP export completed');
			return this.serializeToTurtle(triples);
		} else {
			console.log('✅ DOAP export completed');
			return this.serializeToRdfXml(triples);
		}
	}

	/**
	 * Resolve maintainer with fallback chain
	 */
	private resolveMaintainer(data: UnifiedSoftwareMetadata, doapConfig?: DoapConfig): Author | null {
		// 1. From doapConfig (user-editable)
		if (doapConfig?.maintainer) {
			return doapConfig.maintainer;
		}

		// 2. Extract owner from repository fullName
		if (data.repository.fullName) {
			const parts = data.repository.fullName.split('/');
			if (parts.length >= 1 && parts[0]) {
				return {
					name: parts[0]
				};
			}
		}

		// 3. Use first author as fallback
		if (data.authors && data.authors.length > 0) {
			return data.authors[0];
		}

		return null;
	}

	/**
	 * Add FOAF Person triples
	 */
	private addPersonTriples(triples: Array<{ subject: string; predicate: string; object: string; isUri: boolean }>, personUri: string, person: Author): void {
		triples.push({
			subject: personUri,
			predicate: `${this.RDF_NS}type`,
			object: `${this.FOAF_NS}Person`,
			isUri: true
		});

		// Name
		if (person.name) {
			triples.push({
				subject: personUri,
				predicate: `${this.FOAF_NS}name`,
				object: person.name,
				isUri: false
			});
		} else if (person.givenNames || person.familyNames) {
			const fullName = [person.givenNames, person.familyNames].filter(Boolean).join(' ');
			if (fullName) {
				triples.push({
					subject: personUri,
					predicate: `${this.FOAF_NS}name`,
					object: fullName,
					isUri: false
				});
			}
		}

		// Given name
		if (person.givenNames) {
			triples.push({
				subject: personUri,
				predicate: `${this.FOAF_NS}givenName`,
				object: person.givenNames,
				isUri: false
			});
		}

		// Family name
		if (person.familyNames) {
			triples.push({
				subject: personUri,
				predicate: `${this.FOAF_NS}familyName`,
				object: person.familyNames,
				isUri: false
			});
		}

		// Email
		if (person.email) {
			triples.push({
				subject: personUri,
				predicate: `${this.FOAF_NS}mbox`,
				object: `mailto:${person.email}`,
				isUri: true
			});
		}

		// ORCID
		if (person.orcid) {
			const orcidUri = person.orcid.startsWith('http') ? person.orcid : `https://orcid.org/${person.orcid}`;
			triples.push({
				subject: personUri,
				predicate: `${this.FOAF_NS}account`,
				object: orcidUri,
				isUri: true
			});
		}
	}

	/**
	 * Convert license string to SPDX URI
	 */
	private convertLicenseToSpdxUri(license: string): string | null {
		if (!license) return null;

		// Normalize license string
		const normalized = license
			.trim()
			.replace(/\s+/g, '-')
			.replace(/[()]/g, '')
			.toUpperCase();

		// Common license mappings
		const licenseMap: Record<string, string> = {
			'MIT': 'MIT',
			'APACHE-2.0': 'Apache-2.0',
			'APACHE2': 'Apache-2.0',
			'APACHE': 'Apache-2.0',
			'GPL-2.0': 'GPL-2.0',
			'GPL-3.0': 'GPL-3.0',
			'GPL2': 'GPL-2.0',
			'GPL3': 'GPL-3.0',
			'BSD-2-CLAUSE': 'BSD-2-Clause',
			'BSD-3-CLAUSE': 'BSD-3-Clause',
			'BSD2': 'BSD-2-Clause',
			'BSD3': 'BSD-3-Clause',
			'LGPL-2.1': 'LGPL-2.1',
			'LGPL-3.0': 'LGPL-3.0',
			'MPL-2.0': 'MPL-2.0',
			'AGPL-3.0': 'AGPL-3.0',
			'UNLICENSE': 'Unlicense',
			'CC0-1.0': 'CC0-1.0'
		};

		const spdxId = licenseMap[normalized] || normalized;
		return `${this.SPDX_NS}${spdxId}`;
	}

	/**
	 * Get short description (first sentence)
	 */
	private getShortDescription(description: string): string {
		if (!description) return '';

		const match = description.match(/^[^.!?]+[.!?]/);
		if (match) {
			return match[0].trim();
		}

		return description.substring(0, 100).trim();
	}

	/**
	 * Generate project URI
	 */
	private generateProjectUri(data: UnifiedSoftwareMetadata): string {
		if (data.repository.htmlUrl) {
			return `${data.repository.htmlUrl}#project`;
		}
		return `https://example.com/${data.name.replace(/[^a-zA-Z0-9]/g, '-')}#project`;
	}

	/**
	 * Generate person URI
	 */
	private generatePersonUri(person: Author, role: string): string {
		if (person.orcid) {
			const orcidUri = person.orcid.startsWith('http') ? person.orcid : `https://orcid.org/${person.orcid}`;
			return `${orcidUri}#${role}`;
		}
		if (person.email) {
			return `mailto:${person.email}#${role}`;
		}
		const name = person.name || [person.givenNames, person.familyNames].filter(Boolean).join(' ') || 'unknown';
		return `https://example.com/person/${encodeURIComponent(name)}#${role}`;
	}

	/**
	 * Generate repository URI
	 */
	private generateRepositoryUri(data: UnifiedSoftwareMetadata): string {
		if (data.repository.htmlUrl) {
			return `${data.repository.htmlUrl}#repository`;
		}
		return `https://example.com/repo/${data.name.replace(/[^a-zA-Z0-9]/g, '-')}#repository`;
	}

	/**
	 * Generate release URI
	 */
	private generateReleaseUri(data: UnifiedSoftwareMetadata): string {
		const baseUri = data.repository.htmlUrl || `https://example.com/${data.name.replace(/[^a-zA-Z0-9]/g, '-')}`;
		return `${baseUri}#release-${data.version}`;
	}

	/**
	 * Serialize triples to Turtle format
	 */
	private serializeToTurtle(triples: Array<{ subject: string; predicate: string; object: string; isUri: boolean }>): string {
		let output = `@prefix doap: <${this.DOAP_NS}> .
@prefix foaf: <${this.FOAF_NS}> .
@prefix rdf: <${this.RDF_NS}> .
@prefix rdfs: <${this.RDFS_NS}> .

`;

		// Group triples by subject
		const bySubject = new Map<string, Array<{ predicate: string; object: string; isUri: boolean }>>();
		for (const triple of triples) {
			if (!bySubject.has(triple.subject)) {
				bySubject.set(triple.subject, []);
			}
			bySubject.get(triple.subject)!.push({
				predicate: triple.predicate,
				object: triple.object,
				isUri: triple.isUri
			});
		}

		// Write each subject block
		for (const [subject, predicates] of bySubject.entries()) {
			output += this.formatUri(subject) + '\n';
			for (let i = 0; i < predicates.length; i++) {
				const pred = predicates[i];
				const isLast = i === predicates.length - 1;
				const indent = '    ';
				output += indent + this.formatPredicate(pred.predicate) + ' ' + this.formatObject(pred.object, pred.isUri);
				output += isLast ? ' .\n\n' : ' ;\n';
			}
		}

		return output;
	}

	/**
	 * Serialize triples to RDF/XML format
	 */
	private serializeToRdfXml(triples: Array<{ subject: string; predicate: string; object: string; isUri: boolean }>): string {
		let output = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF
    xmlns:rdf="${this.RDF_NS}"
    xmlns:rdfs="${this.RDFS_NS}"
    xmlns:doap="${this.DOAP_NS}"
    xmlns:foaf="${this.FOAF_NS}">
`;

		// Group triples by subject
		const bySubject = new Map<string, Array<{ predicate: string; object: string; isUri: boolean }>>();
		for (const triple of triples) {
			if (!bySubject.has(triple.subject)) {
				bySubject.set(triple.subject, []);
			}
			bySubject.get(triple.subject)!.push({
				predicate: triple.predicate,
				object: triple.object,
				isUri: triple.isUri
			});
		}

		// Write each subject as an element
		for (const [subject, predicates] of bySubject.entries()) {
			// Determine element type from first predicate if it's rdf:type
			let elementType = 'rdf:Description';
			const typePred = predicates.find(p => p.predicate === `${this.RDF_NS}type`);
			if (typePred && typePred.isUri) {
				elementType = this.formatQName(typePred.object);
			}

			output += `  <${elementType} rdf:about="${this.escapeXml(subject)}">\n`;
			
			for (const pred of predicates) {
				if (pred.predicate === `${this.RDF_NS}type`) continue; // Already used for element type
				
				const qname = this.formatQName(pred.predicate);
				if (pred.isUri) {
					output += `    <${qname} rdf:resource="${this.escapeXml(pred.object)}"/>\n`;
				} else {
					output += `    <${qname}>${this.escapeXml(pred.object)}</${qname}>\n`;
				}
			}
			
			output += `  </${elementType}>\n`;
		}

		output += '</rdf:RDF>\n';
		return output;
	}

	/**
	 * Format URI with prefix if possible
	 */
	private formatUri(uri: string): string {
		if (uri.startsWith(this.DOAP_NS)) {
			return `doap:${uri.substring(this.DOAP_NS.length)}`;
		}
		if (uri.startsWith(this.FOAF_NS)) {
			return `foaf:${uri.substring(this.FOAF_NS.length)}`;
		}
		if (uri.startsWith(this.RDF_NS)) {
			return `rdf:${uri.substring(this.RDF_NS.length)}`;
		}
		return `<${uri}>`;
	}

	/**
	 * Format predicate with prefix if possible
	 */
	private formatPredicate(predicate: string): string {
		return this.formatUri(predicate);
	}

	/**
	 * Format object (URI or literal)
	 */
	private formatObject(obj: string, isUri: boolean): string {
		if (isUri) {
			return this.formatUri(obj);
		}
		// Escape special characters in literals
		const escaped = obj.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
		return `"${escaped}"`;
	}

	/**
	 * Format QName for RDF/XML
	 */
	private formatQName(uri: string): string {
		if (uri.startsWith(this.DOAP_NS)) {
			return `doap:${uri.substring(this.DOAP_NS.length)}`;
		}
		if (uri.startsWith(this.FOAF_NS)) {
			return `foaf:${uri.substring(this.FOAF_NS.length)}`;
		}
		if (uri.startsWith(this.RDF_NS)) {
			return `rdf:${uri.substring(this.RDF_NS.length)}`;
		}
		if (uri.startsWith(this.RDFS_NS)) {
			return `rdfs:${uri.substring(this.RDFS_NS.length)}`;
		}
		return uri;
	}

	/**
	 * Escape XML special characters
	 */
	private escapeXml(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&apos;');
	}

	validate(data: UnifiedSoftwareMetadata, doapConfig?: DoapConfig): string[] {
		const errors = super.validate(data);

		// DOAP specific validations
		const maintainer = this.resolveMaintainer(data, doapConfig);
		if (!maintainer) {
			errors.push('Maintainer is required for DOAP (could not resolve from repository owner or authors)');
		}

		// Validate URIs if present
		if (data.citation.url && !this.isValidUri(data.citation.url)) {
			errors.push('Invalid URL in citation');
		}

		if (data.repository.htmlUrl && !this.isValidUri(data.repository.htmlUrl)) {
			errors.push('Invalid repository URL');
		}

		return errors;
	}

	/**
	 * Check if string is a valid URI
	 */
	private isValidUri(uri: string): boolean {
		try {
			new URL(uri);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Override download to accept DOAP config
	 */
	download(data: UnifiedSoftwareMetadata, filename?: string, doapConfig?: DoapConfig): void {
		const content = this.export(data, doapConfig);
		const blob = new Blob([content], { type: this.mimeType });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		const ext = doapConfig?.format === 'turtle' ? 'ttl' : 'rdf';
		link.download = filename || `${data.name.replace(/[^a-zA-Z0-9]/g, '_')}.${ext}`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	}
}
