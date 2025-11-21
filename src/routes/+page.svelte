<script lang="ts">
	import { onMount } from 'svelte';
	import { analysisStore, startAnalysis, cancelAnalysis, resetAnalysis } from '$lib/analysis-engine.js';
	import type { AnalysisState } from '$lib/types.js';
	import { getExportFormats, getDefaultExportFormat } from '$lib/exporters/export-registry.js';
	import type { UnifiedSoftwareMetadata, GalaxyOutput, GalaxyExportConfig, CwlOutput, CwlExportConfig } from '$lib/unified-metadata.js';
	
	let searchValue = $state('');
	let isSearching = $state(false);
	let searchInput: HTMLInputElement;
	let analysisState: AnalysisState = $state({
		state: 'idle',
		repoUrl: '',
		repoInfo: null,
		checks: new Map(),
		currentCheck: null,
		progress: 0,
		toolYaml: null,
		citationCff: null,
		metadata: null,
		warnings: [],
		errors: [],
		canCancel: false,
		canRetry: false
	});
	
	// UI state
	let isAnalysisCollapsed = $state(false);
	let showExportSection = $state(false);
	let selectedExportFormat = $state('codemeta');
	let exportFormats = getExportFormats();
	let autoCollapseTimer: number | null = null;
	
	// Galaxy-specific state
	let galaxyOutputs: GalaxyOutput[] = $state([]);
	let galaxyCommand: string = $state('');
	let galaxyContainer: string = $state('');
	let galaxyContainerVersion: string = $state('');
	
	// CWL-specific state
	let cwlOutputs: CwlOutput[] = $state([]);
	let cwlVersion: 'v1.1' | 'v1.2' = $state('v1.2');
	let cwlBaseCommand: string = $state('');
	let cwlContainer: string = $state('');
	
	// Subscribe to analysis store
	analysisStore.subscribe(state => {
		analysisState = state;
		isSearching = state.state === 'analyzing' || state.state === 'completed' || state.state === 'error';
		
		// Handle analysis completion
		if (state.state === 'completed') {
			showExportSection = true;
			
			// Initialize Galaxy config from metadata
			if (state.metadata?.galaxyConfig) {
				galaxyCommand = state.metadata.galaxyConfig.command || '';
				galaxyContainer = state.metadata.galaxyConfig.container || '';
				galaxyContainerVersion = state.metadata.galaxyConfig.containerVersion || '';
				galaxyOutputs = state.metadata.galaxyConfig.outputs || [];
			}
			
			// Initialize container from repository if not set
			if (!galaxyContainer && state.metadata?.repository?.fullName) {
				galaxyContainer = `ghcr.io/${state.metadata.repository.fullName}:latest`;
			}
			
			// Initialize CWL config from metadata
			if (state.metadata?.galaxyConfig) {
				cwlContainer = state.metadata.galaxyConfig.container || '';
				cwlBaseCommand = state.metadata.galaxyConfig.command || '';
			}
			
			// Initialize container from repository if not set
			if (!cwlContainer && state.metadata?.repository?.fullName) {
				cwlContainer = `ghcr.io/${state.metadata.repository.fullName}:latest`;
			}
			
			// Auto-collapse analysis after 2 seconds
			if (autoCollapseTimer) {
				clearTimeout(autoCollapseTimer);
			}
			autoCollapseTimer = setTimeout(() => {
				isAnalysisCollapsed = true;
			}, 2000);
		}
		
		// Reset UI state when starting new analysis
		if (state.state === 'analyzing' && state.progress === 0) {
			isAnalysisCollapsed = false;
			showExportSection = false;
			if (autoCollapseTimer) {
				clearTimeout(autoCollapseTimer);
				autoCollapseTimer = null;
			}
		}
	});
	
	function handleSearch() {
		if (searchValue.trim()) {
			startAnalysis(searchValue.trim());
		}
	}
	
	function handleInput() {
		if (!searchValue.trim() && analysisState.state === 'idle') {
			isSearching = false;
		}
	}
	
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			handleSearch();
		}
	}
	
	function handleCancel() {
		cancelAnalysis();
	}
	
	function handleRetry() {
		if (searchValue.trim()) {
			startAnalysis(searchValue.trim());
		}
	}
	
	function handleNewSearch() {
		resetAnalysis();
		isSearching = false;
		searchValue = '';
		searchInput?.focus();
	}
	
	function toggleAnalysisCollapse() {
		isAnalysisCollapsed = !isAnalysisCollapsed;
	}
	
	function handleExport() {
		if (!analysisState.metadata) return;
		
		const format = exportFormats.find(f => f.id === selectedExportFormat);
		if (!format) return;
		
		// For Galaxy export, we need to pass the config
		if (selectedExportFormat === 'galaxy') {
			const galaxyConfig: GalaxyExportConfig = {
				command: galaxyCommand || analysisState.metadata.galaxyConfig?.command || '',
				container: galaxyContainer || analysisState.metadata.galaxyConfig?.container,
				containerVersion: galaxyContainerVersion || analysisState.metadata.galaxyConfig?.containerVersion,
				outputs: galaxyOutputs,
				profile: '24.0'
			};
			
			if ('download' in format.exporter) {
				(format.exporter as any).download(analysisState.metadata, undefined, galaxyConfig);
			}
		} else if (selectedExportFormat === 'cwl') {
			const cwlConfig: CwlExportConfig = {
				cwlVersion: cwlVersion,
				outputs: cwlOutputs,
				baseCommand: cwlBaseCommand || undefined,
				container: cwlContainer || analysisState.metadata.galaxyConfig?.container || undefined
			};
			
			if ('download' in format.exporter) {
				(format.exporter as any).download(analysisState.metadata, undefined, cwlConfig);
			}
		} else {
			if ('download' in format.exporter) {
				(format.exporter as any).download(analysisState.metadata);
			}
		}
	}
	
	function getCurrentExportData(): string {
		if (!analysisState.metadata) return '';
		
		const format = exportFormats.find(f => f.id === selectedExportFormat);
		if (!format) return '';
		
		// For Galaxy export, we need to pass the config
		if (selectedExportFormat === 'galaxy') {
			const galaxyConfig: GalaxyExportConfig = {
				command: galaxyCommand || analysisState.metadata.galaxyConfig?.command || '',
				container: galaxyContainer || analysisState.metadata.galaxyConfig?.container,
				containerVersion: galaxyContainerVersion || analysisState.metadata.galaxyConfig?.containerVersion,
				outputs: galaxyOutputs,
				profile: '24.0'
			};
			
			return (format.exporter as any).export(analysisState.metadata, galaxyConfig);
		}
		
		// For CWL export, we need to pass the config
		if (selectedExportFormat === 'cwl') {
			const cwlConfig: CwlExportConfig = {
				cwlVersion: cwlVersion,
				outputs: cwlOutputs,
				baseCommand: cwlBaseCommand || undefined,
				container: cwlContainer || analysisState.metadata.galaxyConfig?.container || undefined
			};
			
			return (format.exporter as any).export(analysisState.metadata, cwlConfig);
		}
		
		return format.exporter.export(analysisState.metadata);
	}
	
	function addGalaxyOutput() {
		galaxyOutputs = [...galaxyOutputs, { name: '', label: '', format: 'data', description: '' }];
	}
	
	function removeGalaxyOutput(index: number) {
		galaxyOutputs = galaxyOutputs.filter((_, i) => i !== index);
	}
	
	function updateGalaxyOutput(index: number, field: keyof GalaxyOutput, value: string) {
		galaxyOutputs = galaxyOutputs.map((output, i) => 
			i === index ? { ...output, [field]: value } : output
		);
	}
	
	// Common Galaxy datatypes for dropdown
	const galaxyDatatypes = [
		'data', 'txt', 'tabular', 'csv', 'json', 'xml', 'fasta', 'fastqsanger', 
		'gff', 'gtf', 'bed', 'vcf', 'sam', 'bam', 'bai', 'bigwig', 'bigbed'
	];
	
	function addCwlOutput() {
		cwlOutputs = [...cwlOutputs, { name: '', type: 'File', glob: '*.out', label: '', doc: '' }];
	}
	
	function removeCwlOutput(index: number) {
		cwlOutputs = cwlOutputs.filter((_, i) => i !== index);
	}
	
	function updateCwlOutput(index: number, field: keyof CwlOutput, value: string) {
		cwlOutputs = cwlOutputs.map((output, i) => 
			i === index ? { ...output, [field]: value } : output
		);
	}
	
	// Common CWL output types for dropdown
	const cwlOutputTypes = [
		'File', 'Directory', 'string', 'int', 'float', 'boolean'
	];
	
	onMount(() => {
		searchInput?.focus();
	});
</script>

<div class="min-h-screen bg-gray-50">
	<div class="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-4 transition-all duration-500 ease-in-out {isSearching ? 'pt-8' : ''}">
		<!-- Search Container -->
		<div class="w-full max-w-2xl transition-all duration-500 ease-in-out {isSearching ? 'mb-8' : ''}">
			<!-- Search Bar -->
			<div class="relative">
				<div class="flex items-center w-full bg-white rounded-full shadow-lg border border-gray-200 hover:shadow-xl transition-shadow duration-200 focus-within:shadow-xl focus-within:border-blue-300">
					<!-- Search Icon -->
					<div class="pl-6 pr-4">
						<svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
						</svg>
					</div>
					
					<!-- Input Field -->
					<input
						bind:this={searchInput}
						bind:value={searchValue}
						oninput={handleInput}
						onkeydown={handleKeydown}
						type="text"
						placeholder="https://github.com/vforwater/tool_template_python"
						class="flex-1 py-4 pr-6 text-lg bg-transparent border-none outline-none placeholder-gray-400 text-gray-700"
					/>
					
					<!-- Search Button -->
					{#if searchValue.trim()}
						<button
							onclick={handleSearch}
							class="mr-2 p-2 rounded-full hover:bg-gray-100 transition-colors duration-200"
							title="Search"
                            aria-label="Search"
						>
							<svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path>
							</svg>
						</button>
					{/if}
				</div>
			</div>
			
			<!-- Search Suggestions/Instructions (only show when not searching) -->
			{#if !isSearching}
				<div class="mt-8 text-center">
					<p class="text-gray-600 text-lg">Enter a tool-spec compliant GitHub Repository</p>
					<p class="text-gray-400 text-sm mt-2">Press Enter or click the search button to begin</p>
				</div>
			{/if}
		</div>
		
		<!-- Content Area (appears after search) -->
		{#if isSearching}
			<div class="w-full max-w-4xl animate-fade-in">
				<!-- Analysis Card -->
				<div class="bg-white rounded-lg shadow-lg p-6 mb-6">
					<!-- Header with repo info and actions -->
					<div class="flex justify-between items-start mb-6">
						<div class="flex items-center gap-3">
							<button
								onclick={toggleAnalysisCollapse}
								class="p-1 hover:bg-gray-100 rounded transition-colors"
								title={isAnalysisCollapsed ? 'Expand analysis' : 'Collapse analysis'}
								aria-label={isAnalysisCollapsed ? 'Expand analysis' : 'Collapse analysis'}
							>
								<svg class="w-5 h-5 text-gray-500 transition-transform {isAnalysisCollapsed ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
								</svg>
							</button>
							<div>
								<h2 class="text-2xl font-semibold text-gray-800 mb-2">Repository Analysis</h2>
								<p class="text-gray-600">
									Analyzing: <span class="font-medium text-blue-600">{analysisState.repoUrl}</span>
								</p>
								{#if analysisState.repoInfo}
									<p class="text-sm text-gray-500 mt-1">
										{analysisState.repoInfo.fullName} • {analysisState.repoInfo.stars} stars
									</p>
								{/if}
							</div>
						</div>
						<div class="flex gap-2">
							{#if analysisState.canCancel}
								<button
									onclick={handleCancel}
									class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
								>
									Cancel
								</button>
							{/if}
							{#if analysisState.canRetry}
								<button
									onclick={handleRetry}
									class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
								>
									Retry
								</button>
							{/if}
							{#if analysisState.state === 'completed'}
								<button
									onclick={handleNewSearch}
									class="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
								>
									New Search
								</button>
							{/if}
						</div>
					</div>

					<!-- Collapsible Content -->
					<div class="transition-all duration-300 ease-in-out overflow-hidden {isAnalysisCollapsed ? 'max-h-0 opacity-0' : 'opacity-100'}">
						<!-- Progress Bar -->
						{#if analysisState.state === 'analyzing'}
							<div class="mb-6">
								<div class="flex justify-between text-sm text-gray-600 mb-2">
									<span>Progress</span>
									<span>{analysisState.progress}%</span>
								</div>
								<div class="w-full bg-gray-200 rounded-full h-2">
									<div 
										class="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
										style="width: {analysisState.progress}%"
									></div>
								</div>
							</div>
						{/if}

					<!-- Check Results -->
					<div class="space-y-4">
						{#each Array.from(analysisState.checks.values()) as check}
							<div class="flex items-center p-4 border rounded-lg {check.status === 'completed' ? 'border-green-200 bg-green-50' : check.status === 'failed' ? 'border-red-200 bg-red-50' : check.status === 'running' ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'}">
								<!-- Status Icon -->
								<div class="flex-shrink-0 mr-4">
									{#if check.status === 'completed'}
										<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
										</svg>
									{:else if check.status === 'failed'}
										<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
										</svg>
									{:else if check.status === 'running'}
										<svg class="w-6 h-6 text-blue-600 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
										</svg>
									{:else}
										<svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
										</svg>
									{/if}
								</div>

								<!-- Check Info -->
								<div class="flex-1">
									<h3 class="font-medium text-gray-900">{check.name}</h3>
									<p class="text-sm text-gray-600">{check.description}</p>
									{#if check.error}
										<p class="text-sm text-red-600 mt-1">{check.error}</p>
									{/if}
									{#if check.warning}
										<p class="text-sm text-yellow-600 mt-1">{check.warning}</p>
									{/if}
									{#if check.duration}
										<p class="text-xs text-gray-500 mt-1">Completed in {check.duration}ms</p>
									{/if}
								</div>
							</div>
						{/each}
					</div>

					<!-- Warnings and Errors -->
					{#if analysisState.warnings.length > 0}
						<div class="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
							<h4 class="font-medium text-yellow-800 mb-2">Warnings</h4>
							<ul class="text-sm text-yellow-700 space-y-1">
								{#each analysisState.warnings as warning}
									<li>• {warning}</li>
								{/each}
							</ul>
						</div>
					{/if}

					{#if analysisState.errors.length > 0}
						<div class="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
							<h4 class="font-medium text-red-800 mb-2">Errors</h4>
							<ul class="text-sm text-red-700 space-y-1">
								{#each analysisState.errors as error}
									<li>• {error}</li>
								{/each}
							</ul>
						</div>
					{/if}

						<!-- Final Status -->
						{#if analysisState.state === 'completed'}
							<div class="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
								<h4 class="font-medium text-green-800 mb-2">Analysis Complete</h4>
								<p class="text-sm text-green-700">
									{#if analysisState.toolYaml}
										Repository is tool-spec compliant! ✅
									{:else}
										Analysis completed with issues.
									{/if}
								</p>
							</div>
						{/if}
					</div>
				</div>
				
				<!-- Export Section -->
				{#if showExportSection && analysisState.metadata}
					<div class="bg-white rounded-lg shadow-lg p-6 animate-fade-in">
						<h2 class="text-2xl font-semibold text-gray-800 mb-6">📤 Export Metadata</h2>
						
						<!-- Export Format Tabs -->
						<div class="mb-6">
							<div class="border-b border-gray-200">
								<nav class="-mb-px flex space-x-8">
									{#each exportFormats as format}
										<button
											onclick={() => selectedExportFormat = format.id}
											class="py-2 px-1 border-b-2 font-medium text-sm transition-colors {selectedExportFormat === format.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
										>
											<span class="mr-2">{format.icon}</span>
											{format.name}
										</button>
									{/each}
								</nav>
							</div>
						</div>
						
						<!-- Export Format Description -->
						{#each exportFormats as format}
							{#if selectedExportFormat === format.id}
								<div class="mb-6">
									<h3 class="text-lg font-medium text-gray-900 mb-2">{format.name}</h3>
									<p class="text-gray-600 mb-4">{format.description}</p>
									
									<!-- Galaxy-specific inputs -->
									{#if selectedExportFormat === 'galaxy'}
										<!-- Outputs Section -->
										<div class="mb-6">
											<div class="flex justify-between items-center mb-3">
												<h4 class="font-medium text-gray-900">Outputs</h4>
												<button
													onclick={addGalaxyOutput}
													class="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
												>
													+ Add Output
												</button>
											</div>
											
											{#if galaxyOutputs.length === 0}
												<p class="text-sm text-gray-500 mb-3">No outputs defined. You can add them here or edit the downloaded XML manually.</p>
											{/if}
											
											<div class="space-y-4">
												{#each galaxyOutputs as output, index}
													<div class="border border-gray-200 rounded-lg p-4 bg-gray-50">
														<div class="flex justify-between items-start mb-3">
															<h5 class="font-medium text-gray-700">Output {index + 1}</h5>
															<button
																onclick={() => removeGalaxyOutput(index)}
																class="text-red-600 hover:text-red-700 text-sm"
															>
																Remove
															</button>
														</div>
														<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
															<div>
																<label class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
																<input
																	type="text"
																	value={output.name}
																	oninput={(e) => updateGalaxyOutput(index, 'name', e.currentTarget.value)}
																	placeholder="output_name"
																	class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
																/>
															</div>
															<div>
																<label class="block text-sm font-medium text-gray-700 mb-1">Label *</label>
																<input
																	type="text"
																	value={output.label}
																	oninput={(e) => updateGalaxyOutput(index, 'label', e.currentTarget.value)}
																	placeholder="Output Label"
																	class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
																/>
															</div>
															<div>
																<label class="block text-sm font-medium text-gray-700 mb-1">Format *</label>
																<select
																	value={output.format}
																	onchange={(e) => updateGalaxyOutput(index, 'format', e.currentTarget.value)}
																	class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
																>
																	{#each galaxyDatatypes as datatype}
																		<option value={datatype}>{datatype}</option>
																	{/each}
																</select>
															</div>
															<div>
																<label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
																<input
																	type="text"
																	value={output.description || ''}
																	oninput={(e) => updateGalaxyOutput(index, 'description', e.currentTarget.value)}
																	placeholder="Optional description"
																	class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
																/>
															</div>
														</div>
													</div>
												{/each}
											</div>
											<p class="text-xs text-gray-500 mt-2">
												Note: For complex outputs (collections), edit the downloaded XML manually.
											</p>
										</div>
										
										<!-- Command Section -->
										<div class="mb-6">
											<label class="block text-sm font-medium text-gray-700 mb-2">
												Command Template *
												{#if analysisState.metadata?.galaxyConfig?.command && !galaxyCommand}
													<span class="text-gray-500 font-normal">(auto-detected from Dockerfile)</span>
												{/if}
											</label>
											<input
												type="text"
												bind:value={galaxyCommand}
												placeholder="python /src/run.py $input1 $param1"
												class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
											/>
											<p class="text-xs text-gray-500 mt-1">
												Use $param_name for parameters and $input_name for data inputs.
											</p>
										</div>
										
										<!-- Container Section -->
										<div class="mb-6">
											<label class="block text-sm font-medium text-gray-700 mb-2">
												Container Image
												{#if analysisState.metadata?.galaxyConfig?.container && !galaxyContainer}
													<span class="text-gray-500 font-normal">(auto-detected, can be overridden)</span>
												{/if}
											</label>
											<input
												type="text"
												bind:value={galaxyContainer}
												placeholder="ghcr.io/owner/repo:latest"
												class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
											/>
											<p class="text-xs text-gray-500 mt-1">
												Docker container image location (e.g., ghcr.io/owner/repo:latest)
											</p>
										</div>
									{/if}
									
									<!-- CWL-specific inputs -->
									{#if selectedExportFormat === 'cwl'}
										<!-- CWL Version Section -->
										<div class="mb-6">
											<label class="block text-sm font-medium text-gray-700 mb-2">
												CWL Version *
											</label>
											<select
												bind:value={cwlVersion}
												class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
											>
												<option value="v1.2">v1.2 (Latest)</option>
												<option value="v1.1">v1.1</option>
											</select>
											<p class="text-xs text-gray-500 mt-1">
												Select the CWL specification version to use
											</p>
										</div>
										
										<!-- Outputs Section -->
										<div class="mb-6">
											<div class="flex justify-between items-center mb-3">
												<h4 class="font-medium text-gray-900">Outputs</h4>
												<button
													onclick={addCwlOutput}
													class="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
												>
													+ Add Output
												</button>
											</div>
											
											{#if cwlOutputs.length === 0}
												<p class="text-sm text-gray-500 mb-3">No outputs defined. You can add them here or edit the downloaded CWL file manually.</p>
											{/if}
											
											<div class="space-y-4">
												{#each cwlOutputs as output, index}
													<div class="border border-gray-200 rounded-lg p-4 bg-gray-50">
														<div class="flex justify-between items-start mb-3">
															<h5 class="font-medium text-gray-700">Output {index + 1}</h5>
															<button
																onclick={() => removeCwlOutput(index)}
																class="text-red-600 hover:text-red-700 text-sm"
															>
																Remove
															</button>
														</div>
														<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
															<div>
																<label class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
																<input
																	type="text"
																	value={output.name}
																	oninput={(e) => updateCwlOutput(index, 'name', e.currentTarget.value)}
																	placeholder="output_name"
																	class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
																/>
															</div>
															<div>
																<label class="block text-sm font-medium text-gray-700 mb-1">Type *</label>
																<select
																	value={output.type}
																	onchange={(e) => updateCwlOutput(index, 'type', e.currentTarget.value)}
																	class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
																>
																	{#each cwlOutputTypes as outputType}
																		<option value={outputType}>{outputType}</option>
																	{/each}
																</select>
															</div>
															<div>
																<label class="block text-sm font-medium text-gray-700 mb-1">Glob Pattern *</label>
																<input
																	type="text"
																	value={output.glob}
																	oninput={(e) => updateCwlOutput(index, 'glob', e.currentTarget.value)}
																	placeholder="*.out"
																	class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
																/>
															</div>
															<div>
																<label class="block text-sm font-medium text-gray-700 mb-1">Label</label>
																<input
																	type="text"
																	value={output.label || ''}
																	oninput={(e) => updateCwlOutput(index, 'label', e.currentTarget.value)}
																	placeholder="Output Label"
																	class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
																/>
															</div>
															<div class="md:col-span-2">
																<label class="block text-sm font-medium text-gray-700 mb-1">Documentation</label>
																<input
																	type="text"
																	value={output.doc || ''}
																	oninput={(e) => updateCwlOutput(index, 'doc', e.currentTarget.value)}
																	placeholder="Optional description"
																	class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
																/>
															</div>
														</div>
													</div>
												{/each}
											</div>
											<p class="text-xs text-gray-500 mt-2">
												Note: Glob patterns use shell-style wildcards (e.g., *.out, output.txt, results/*.json)
											</p>
										</div>
										
										<!-- Base Command Section -->
										<div class="mb-6">
											<label class="block text-sm font-medium text-gray-700 mb-2">
												Base Command
												{#if analysisState.metadata?.galaxyConfig?.command && !cwlBaseCommand}
													<span class="text-gray-500 font-normal">(auto-generated from Docker, can be overridden)</span>
												{/if}
											</label>
											<input
												type="text"
												bind:value={cwlBaseCommand}
												placeholder="docker run --rm ..."
												class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
											/>
											<p class="text-xs text-gray-500 mt-1">
												Docker command will be auto-generated if container is specified. You can override it here.
											</p>
										</div>
										
										<!-- Container Section -->
										<div class="mb-6">
											<label class="block text-sm font-medium text-gray-700 mb-2">
												Container Image
												{#if analysisState.metadata?.galaxyConfig?.container && !cwlContainer}
													<span class="text-gray-500 font-normal">(auto-detected, can be overridden)</span>
												{/if}
											</label>
											<input
												type="text"
												bind:value={cwlContainer}
												placeholder="ghcr.io/owner/repo:latest"
												class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
											/>
											<p class="text-xs text-gray-500 mt-1">
												Docker container image location (e.g., ghcr.io/owner/repo:latest)
											</p>
										</div>
									{/if}
									
									<!-- Export Actions -->
									<div class="flex gap-3 mb-6">
										<button
											onclick={handleExport}
											class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
										>
											📥 Download {format.name}
										</button>
									</div>
									
									<!-- Export Preview -->
									<div class="bg-gray-50 rounded-lg p-4">
										<h4 class="font-medium text-gray-900 mb-3">Preview:</h4>
										<pre class="text-sm text-gray-700 overflow-x-auto whitespace-pre-wrap">{getCurrentExportData()}</pre>
									</div>
								</div>
							{/if}
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	@keyframes fade-in {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	
	.animate-fade-in {
		animation: fade-in 0.5s ease-out;
	}
</style>
