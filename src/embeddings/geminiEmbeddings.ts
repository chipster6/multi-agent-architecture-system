import type { EmbeddingProvider, EmbeddingProviderOptions } from './types.js';

interface GeminiEmbeddingResponse {
  embedding?: {
    values?: number[];
  };
}

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly dimensions: number;

  constructor(apiKey: string, options: EmbeddingProviderOptions) {
    this.apiKey = apiKey;
    this.model = options.model;
    this.dimensions = options.dimensions;
  }

  async embedText(text: string): Promise<number[]> {
    const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:embedContent`);
    url.searchParams.set('key', this.apiKey);

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: {
          parts: [{ text }],
        },
        outputDimensionality: this.dimensions,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini embeddings request failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as GeminiEmbeddingResponse;
    const values = data.embedding?.values;

    if (!values || !Array.isArray(values)) {
      throw new Error('Gemini embeddings response missing values');
    }

    if (values.length !== this.dimensions) {
      throw new Error(`Gemini embeddings dimension mismatch: expected ${this.dimensions}, got ${values.length}`);
    }

    return values;
  }
}
