// CITATION.cff parser and validator

import { Cite } from '@citation-js/core';
import '@citation-js/plugin-cff';
import { load } from 'js-yaml';

export interface CitationAuthor {
	givenNames?: string;
	familyNames?: string;
	name?: string;
	orcid?: string;
	email?: string;
	affiliation?: string;
}

export interface CitationCff {
	cffVersion?: string;
	message?: string;
	authors: CitationAuthor[];
	title: string;
	version?: string;
	dateReleased?: string;
	url?: string;
	repository?: string;
	repositoryCode?: string;
	license?: string | string[];
	keywords?: string[];
	abstract?: string;
	preferredCitation?: any;
	identifiers?: Array<{
		type: string;
		value: string;
	}>;
}

export interface CitationCffValidationResult {
	isValid: boolean;
	citationCff: CitationCff | null;
	errors: string[];
	warnings: string[];
}

/**
 * Parse and validate CITATION.cff content using citation-js
 */
export function parseCitationCff(yamlContent: string): CitationCffValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	
	try {
		console.log('🔍 Parsing CITATION.cff with citation-js...');
		
		// Parse using citation-js with error handling
		let cite: Cite;
		try {
			cite = new Cite(yamlContent);
		} catch (parseError) {
			console.warn('⚠️ Citation-js parsing failed, falling back to manual YAML parsing');
			return parseCitationCffManually(yamlContent);
		}
		
		const parsed = cite.data[0]; // Get the first (and typically only) citation
		
		console.log('🔍 Parsed CITATION.cff structure:', parsed);
		
		if (!parsed || typeof parsed !== 'object') {
			errors.push('Invalid CITATION.cff: Could not parse content');
			return { isValid: false, citationCff: null, errors, warnings };
		}
		
		// Validate required fields
		if (!parsed.title) {
			errors.push('Missing required field: "title"');
		}
		
		if (!parsed.author || !Array.isArray(parsed.author) || parsed.author.length === 0) {
			errors.push('Missing required field: "author" (must be a non-empty array)');
		}
		
		// Validate authors if present
		if (parsed.author && Array.isArray(parsed.author)) {
			console.log('👥 Validating authors...');
			parsed.author.forEach((author: any, index: number) => {
				if (!author || typeof author !== 'object') {
					errors.push(`Author at index ${index} must be an object`);
					return;
				}
				
				// Check for required author fields (at least one of literal or given/family)
				if (!author.literal && (!author.given && !author.family)) {
					errors.push(`Author at index ${index} must have either "literal" or "given"/"family"`);
				}
				
				console.log(`  ✅ Author ${index + 1} validated`);
			});
		}
		
		// Check for common missing fields and add warnings
		if (!parsed.issued) {
			warnings.push('Field "issued" (date) is missing (recommended for proper citation)');
		}
		
		if (!parsed.license) {
			warnings.push('Field "license" is missing (recommended for proper citation)');
		}
		
		if (!parsed.URL && !parsed.repository) {
			warnings.push('Neither "URL" nor "repository" field is present (recommended for proper citation)');
		}
		
		// Convert citation-js format to our internal format
		const citationCff: CitationCff = {
			cffVersion: parsed['cff-version'],
			message: parsed.message,
			authors: (parsed.author || []).map((author: any) => ({
				givenNames: author.given,
				familyNames: author.family,
				name: author.literal,
				orcid: author.ORCID,
				email: author.email,
				affiliation: author.affiliation
			})),
			title: parsed.title || '',
			version: parsed.version,
			dateReleased: parsed.issued ? parsed.issued['date-parts'][0].join('-') : undefined,
			url: parsed.URL,
			repository: parsed.repository,
			repositoryCode: parsed['repository-code'],
			license: parsed.license,
			keywords: parsed.keyword,
			abstract: parsed.abstract,
			preferredCitation: parsed['preferred-citation'],
			identifiers: parsed.identifier
		};
		
		console.log('✅ CITATION.cff validation completed');
		console.log('📝 Extracted citation info:', {
			title: citationCff.title,
			authorsCount: citationCff.authors.length,
			version: citationCff.version || 'Not specified',
			license: citationCff.license || 'Not specified',
			hasUrl: !!citationCff.url,
			hasRepository: !!citationCff.repository
		});
		
		return {
			isValid: errors.length === 0,
			citationCff,
			errors,
			warnings
		};
		
	} catch (error) {
		console.error('❌ CITATION.cff parsing error:', error);
		errors.push(`CITATION.cff parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`);
		return { isValid: false, citationCff: null, errors, warnings };
	}
}

/**
 * Fallback manual parsing when citation-js fails
 */
function parseCitationCffManually(yamlContent: string): CitationCffValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	
	try {
		console.log('🔍 Parsing CITATION.cff manually with YAML parser...');
		
		// Parse YAML manually
		const parsed = load(yamlContent) as any;
		console.log('🔍 Manually parsed CITATION.cff structure:', parsed);
		
		if (!parsed || typeof parsed !== 'object') {
			errors.push('Invalid YAML: Root must be an object');
			return { isValid: false, citationCff: null, errors, warnings };
		}
		
		// Validate required fields
		if (!parsed.title || typeof parsed.title !== 'string') {
			errors.push('Missing required field: "title"');
		}
		
		if (!parsed.authors || !Array.isArray(parsed.authors) || parsed.authors.length === 0) {
			errors.push('Missing required field: "authors" (must be a non-empty array)');
		}
		
		// Validate authors if present
		if (parsed.authors && Array.isArray(parsed.authors)) {
			console.log('👥 Validating authors...');
			parsed.authors.forEach((author: any, index: number) => {
				if (!author || typeof author !== 'object') {
					errors.push(`Author at index ${index} must be an object`);
					return;
				}
				
				// Check for required author fields (at least one of name or givenNames/familyNames)
				if (!author.name && (!author['given-names'] && !author['family-names'])) {
					errors.push(`Author at index ${index} must have either "name" or "given-names"/"family-names"`);
				}
				
				console.log(`  ✅ Author ${index + 1} validated`);
			});
		}
		
		// Check for common missing fields and add warnings
		if (!parsed.version) {
			warnings.push('Field "version" is missing (recommended for proper citation)');
		}
		
		if (!parsed['date-released']) {
			warnings.push('Field "date-released" is missing (recommended for proper citation)');
		}
		
		if (!parsed.license) {
			warnings.push('Field "license" is missing (recommended for proper citation)');
		}
		
		if (!parsed.url && !parsed['repository-code']) {
			warnings.push('Neither "url" nor "repository-code" field is present (recommended for proper citation)');
		}
		
		// Convert to our internal format
		const citationCff: CitationCff = {
			cffVersion: parsed['cff-version'],
			message: parsed.message,
			authors: (parsed.authors || []).map((author: any) => ({
				givenNames: author['given-names'],
				familyNames: author['family-names'],
				name: author.name,
				orcid: author.orcid,
				email: author.email,
				affiliation: author.affiliation
			})),
			title: parsed.title || '',
			version: parsed.version,
			dateReleased: parsed['date-released'],
			url: parsed.url,
			repository: parsed['repository-code'],
			repositoryCode: parsed['repository-code'],
			license: parsed.license,
			keywords: parsed.keywords,
			abstract: parsed.abstract,
			preferredCitation: parsed['preferred-citation'],
			identifiers: parsed.identifiers
		};
		
		console.log('✅ Manual CITATION.cff validation completed');
		console.log('📝 Extracted citation info:', {
			title: citationCff.title,
			authorsCount: citationCff.authors.length,
			version: citationCff.version || 'Not specified',
			license: citationCff.license || 'Not specified',
			hasUrl: !!citationCff.url,
			hasRepository: !!citationCff.repository
		});
		
		return {
			isValid: errors.length === 0,
			citationCff,
			errors,
			warnings
		};
		
	} catch (error) {
		console.error('❌ Manual CITATION.cff parsing error:', error);
		errors.push(`Manual parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`);
		return { isValid: false, citationCff: null, errors, warnings };
	}
}

/**
 * Normalize license string for comparison
 */
export function normalizeLicense(license: string): string {
	return license
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '')
		.replace(/\s+/g, '');
}

/**
 * Compare licenses from CITATION.cff and LICENSE file
 */
export function compareLicenses(cffLicense: string | string[] | undefined, licenseFileContent: string): {
	areCompatible: boolean;
	warnings: string[];
} {
	const warnings: string[] = [];
	
	if (!cffLicense && !licenseFileContent) {
		warnings.push('No license information found in either CITATION.cff or LICENSE file');
		return { areCompatible: true, warnings };
	}
	
	if (!cffLicense) {
		warnings.push('No license specified in CITATION.cff, but LICENSE file is present');
		return { areCompatible: true, warnings };
	}
	
	if (!licenseFileContent) {
		warnings.push('License specified in CITATION.cff, but no LICENSE file found in repository');
		return { areCompatible: true, warnings };
	}
	
	// Normalize CFF license (handle both string and array)
	const cffLicenses = Array.isArray(cffLicense) ? cffLicense : [cffLicense];
	const normalizedCffLicenses = cffLicenses.map(normalizeLicense);
	
	// Extract license from LICENSE file content (basic detection)
	const licenseFileLower = licenseFileContent.toLowerCase();
	const commonLicenses = [
		'mit', 'apache', 'gpl', 'bsd', 'mozilla', 'eclipse', 'unlicense', 'cc0'
	];
	
	let detectedLicense = '';
	for (const license of commonLicenses) {
		if (licenseFileLower.includes(license)) {
			detectedLicense = license;
			break;
		}
	}
	
	if (!detectedLicense) {
		warnings.push('Could not detect license type from LICENSE file content');
		return { areCompatible: true, warnings };
	}
	
	const normalizedFileLicense = normalizeLicense(detectedLicense);
	
	// Check if licenses are compatible
	const areCompatible = normalizedCffLicenses.some(cffLicense => 
		cffLicense.includes(normalizedFileLicense) || normalizedFileLicense.includes(cffLicense)
	);
	
	if (!areCompatible) {
		warnings.push(`License mismatch: CITATION.cff specifies "${cffLicenses.join(', ')}" but LICENSE file appears to be "${detectedLicense}"`);
	}
	
	return { areCompatible, warnings };
}
