import type { STRUCTURED_LLM_OUTPUT_SCHEMA_VERSION, STRUCTURED_LLM_PROMPT_VERSION } from './structured-llm-analysis-types.js';

export interface StructuredLlmProviderRequest {
  readonly promptVersion: typeof STRUCTURED_LLM_PROMPT_VERSION;
  readonly outputSchemaVersion: typeof STRUCTURED_LLM_OUTPUT_SCHEMA_VERSION;
  readonly systemPrompt: string;
  readonly userPrompt: string;
}

export interface StructuredLlmProvider {
  readonly timeoutMs?: number;
  readonly providerId: string;
  readonly modelId: string;
  generate(request: StructuredLlmProviderRequest): Promise<unknown>;
}

export function validateStructuredLlmProviderIdentity(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 120
    || value.trim() !== value || /\p{Cc}/u.test(value)) {
    throw new Error('Invalid structured LLM provider identity');
  }
  return value;
}
