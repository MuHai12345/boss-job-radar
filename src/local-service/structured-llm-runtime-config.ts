import { OPENAI_STRUCTURED_LLM_MODEL_IDS } from '../domain/llm/openai-structured-llm-provider.js';

export const BOSS_JOB_RADAR_OPENAI_API_KEY_ENV = 'BOSS_JOB_RADAR_OPENAI_API_KEY';
export const BOSS_JOB_RADAR_OPENAI_MODEL_ENV = 'BOSS_JOB_RADAR_OPENAI_MODEL';

export type StructuredLlmRuntimeConfig =
  | { readonly enabled: false }
  | { readonly enabled: true; readonly apiKey: string; readonly modelId: string };

/** Parse explicit values only; never discover credentials or choose a model. */
export function parseStructuredLlmRuntimeConfig(
  apiKey: unknown,
  model: unknown,
): StructuredLlmRuntimeConfig {
  if (apiKey === undefined && model === undefined) return { enabled: false };
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0 || /\p{Cc}/u.test(apiKey)
    || typeof model !== 'string' || !OPENAI_STRUCTURED_LLM_MODEL_IDS.some((allowed) => allowed === model)) {
    throw new Error('Invalid structured LLM runtime configuration');
  }
  return { enabled: true, apiKey, modelId: model };
}
