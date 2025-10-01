// Base exporter interface and utilities

import type { UnifiedSoftwareMetadata } from '../unified-metadata.js';

export interface MetadataExporter {
	format: string;
	displayName: string;
	description: string;
	mimeType: string;
	fileExtension: string;
	export(data: UnifiedSoftwareMetadata): string;
	validate?(data: UnifiedSoftwareMetadata): string[];
}

export interface ExportFormat {
	id: string;
	name: string;
	description: string;
	icon: string;
	exporter: MetadataExporter;
}

/**
 * Base class for metadata exporters
 */
export abstract class BaseExporter implements MetadataExporter {
	abstract format: string;
	abstract displayName: string;
	abstract description: string;
	abstract mimeType: string;
	abstract fileExtension: string;
	
	abstract export(data: UnifiedSoftwareMetadata): string;
	
	validate(data: UnifiedSoftwareMetadata): string[] {
		const errors: string[] = [];
		
		if (!data.name) {
			errors.push('Name is required');
		}
		
		if (!data.description) {
			errors.push('Description is required');
		}
		
		if (!data.authors || data.authors.length === 0) {
			errors.push('At least one author is required');
		}
		
		return errors;
	}
	
	/**
	 * Download the exported data as a file
	 */
	download(data: UnifiedSoftwareMetadata, filename?: string): void {
		const content = this.export(data);
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
