# Tool-Spec Converter

A web application for analyzing tool-spec compliant GitHub repositories and converting them to various software metadata formats.

## Features

- **Repository Analysis**: Validates tool-spec compliance by checking for `src/tool.yml` and `CITATION.cff`
- **Metadata Extraction**: Extracts parameters, data definitions, and citation information
- **Multiple Export Formats**: Supports CodeMeta JSON-LD and more formats (extensible)
- **License Validation**: Compares licenses between CITATION.cff and LICENSE file
- **Modern UI**: Clean, responsive interface with real-time progress tracking

## Development

Install dependencies and start the development server:

```sh
npm install
npm run dev
```

## Building

To create a production build:

```sh
npm run build
```

Preview the production build:

```sh
npm run preview
```

## Deployment

This project is automatically deployed to GitHub Pages via GitHub Actions when changes are pushed to the `main` branch.

### Manual Deployment

1. Build the project: `npm run build`
2. The static files will be in the `build/` directory
3. Deploy the contents of `build/` to your web server

## Usage

1. Enter a GitHub repository URL (e.g., `https://github.com/vforwater/tool_template_python`)
2. The tool will analyze the repository for tool-spec compliance
3. View the analysis results and export metadata in various formats

## Supported Metadata Formats

- **CodeMeta**: JSON-LD metadata following the CodeMeta standard for scientific software
- More formats coming soon...

## Technology Stack

- **Frontend**: SvelteKit 5 with TypeScript
- **Styling**: Tailwind CSS
- **YAML Parsing**: js-yaml
- **Citation Parsing**: @citation-js/plugin-cff
- **Deployment**: GitHub Pages with GitHub Actions
