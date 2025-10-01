<script lang="ts">
	import { onMount } from 'svelte';
	import { analysisStore, startAnalysis, cancelAnalysis, resetAnalysis } from '$lib/analysis-engine.js';
	import type { AnalysisState } from '$lib/types.js';
	import { getExportFormats, getDefaultExportFormat } from '$lib/exporters/export-registry.js';
	import type { UnifiedSoftwareMetadata } from '$lib/unified-metadata.js';
	
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
	
	// Subscribe to analysis store
	analysisStore.subscribe(state => {
		analysisState = state;
		isSearching = state.state === 'analyzing' || state.state === 'completed' || state.state === 'error';
		
		// Handle analysis completion
		if (state.state === 'completed') {
			showExportSection = true;
			
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
		if (format && 'download' in format.exporter) {
			(format.exporter as any).download(analysisState.metadata);
		}
	}
	
	function getCurrentExportData(): string {
		if (!analysisState.metadata) return '';
		
		const format = exportFormats.find(f => f.id === selectedExportFormat);
		if (format) {
			return format.exporter.export(analysisState.metadata);
		}
		return '';
	}
	
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
					<div class="transition-all duration-300 ease-in-out overflow-hidden {isAnalysisCollapsed ? 'max-h-0 opacity-0' : 'max-h-screen opacity-100'}">
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
