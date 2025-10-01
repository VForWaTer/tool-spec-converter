// Type declarations for citation-js packages

declare module '@citation-js/core' {
  export class Cite {
    constructor(input: string);
    data: any[];
  }
}

declare module '@citation-js/plugin-cff' {
  // Plugin registration - no exports needed
}
