import { randomUUID } from 'node:crypto';
import { LOCAL_BUILD_ID } from './build-identity.js';
import { STRUCTURED_LLM_PROMPT_VERSION, STRUCTURED_LLM_OUTPUT_SCHEMA_VERSION } from '../domain/llm/structured-llm-analysis-types.js';
import type { StructuredLlmProvider } from '../domain/llm/structured-llm-provider.js';

export function createRuntimeIdentity(provider?: StructuredLlmProvider) {
  // Never reflect custom provider identity/config strings into evidence.
  const providerId = provider === undefined ? 'disabled'
    : provider.providerId === 'lave8' ? 'lave8' : provider.providerId === 'openai' ? 'openai' : 'unknown';
  const model = ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'].find(id => id === provider?.modelId) ?? 'unknown';
  return Object.freeze({
    runtimeId: randomUUID(), buildId: LOCAL_BUILD_ID, runtimeStartedAt: new Date().toISOString(),
    provider: providerId, model,
    providerTimeoutMs: provider?.timeoutMs !== undefined && Number.isSafeInteger(provider.timeoutMs) && provider.timeoutMs > 0 ? provider.timeoutMs : null,
    browserDeadlineMs: null, localDeadlineMs: null,
    promptVersion: STRUCTURED_LLM_PROMPT_VERSION, outputSchemaVersion: STRUCTURED_LLM_OUTPUT_SCHEMA_VERSION,
  });
}
export type RuntimeIdentity = ReturnType<typeof createRuntimeIdentity>;
