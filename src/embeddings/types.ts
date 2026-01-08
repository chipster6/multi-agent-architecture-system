export interface EmbeddingProvider {
  embedText(text: string): Promise<number[]>;
}

export interface EmbeddingProviderOptions {
  model: string;
  dimensions: number;
}
