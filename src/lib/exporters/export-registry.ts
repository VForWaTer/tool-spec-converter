// Export format registry and management

import { CodeMetaExporter } from './codemeta-exporter.js';
import { GalaxyExporter } from './galaxy-exporter.js';
import { DoapExporter } from './doap-exporter.js';
import type { ExportFormat, MetadataExporter } from './base-exporter.js';

// Export format registry
const exportFormats: ExportFormat[] = [
	{
		id: 'codemeta',
		name: 'CodeMeta',
		description: 'JSON-LD metadata following the CodeMeta standard for scientific software',
		icon: '📄',
		exporter: new CodeMetaExporter()
	},
	{
		id: 'galaxy',
		name: 'Galaxy',
		description: 'Galaxy tool.xml format for tool integration',
		icon: '🌌',
		exporter: new GalaxyExporter()
	},
	{
		id: 'doap',
		name: 'DOAP',
		description: 'RDF vocabulary for describing software projects (Description of a Project)',
		icon: '📋',
		exporter: new DoapExporter()
	}
	// Future formats will be added here:
	// {
	//   id: 'json',
	//   name: 'Simple JSON',
	//   description: 'Simple JSON format for basic metadata',
	//   icon: '📋',
	//   exporter: new JSONExporter()
	// },
	// {
	//   id: 'yaml',
	//   name: 'YAML',
	//   description: 'Human-readable YAML format',
	//   icon: '📝',
	//   exporter: new YAMLExporter()
	// },
	// {
	//   id: 'schema-org',
	//   name: 'Schema.org',
	//   description: 'Schema.org JSON-LD for web discoverability',
	//   icon: '🌐',
	//   exporter: new SchemaOrgExporter()
	// },
	// {
	//   id: 'adms-sw',
	//   name: 'ADMS.SW',
	//   description: 'Asset Description Metadata Schema for Software',
	//   icon: '🏷️',
	//   exporter: new ADMSSWExporter()
	// },
	// {
	//   id: 'bibtex',
	//   name: 'BibTeX',
	//   description: 'BibTeX format for academic citations',
	//   icon: '📚',
	//   exporter: new BibTeXExporter()
	// }
];

/**
 * Get all available export formats
 */
export function getExportFormats(): ExportFormat[] {
	return [...exportFormats];
}

/**
 * Get export format by ID
 */
export function getExportFormat(id: string): ExportFormat | undefined {
	return exportFormats.find(format => format.id === id);
}

/**
 * Get the default export format (CodeMeta)
 */
export function getDefaultExportFormat(): ExportFormat {
	return exportFormats[0];
}

/**
 * Register a new export format
 */
export function registerExportFormat(format: ExportFormat): void {
	const existingIndex = exportFormats.findIndex(f => f.id === format.id);
	if (existingIndex >= 0) {
		exportFormats[existingIndex] = format;
	} else {
		exportFormats.push(format);
	}
}
