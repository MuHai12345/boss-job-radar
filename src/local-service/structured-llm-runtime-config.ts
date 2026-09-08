import { OPENAI_STRUCTURED_LLM_MODEL_IDS } from '../domain/llm/openai-structured-llm-provider.js';
import { LAVE8_STRUCTURED_LLM_MODEL_IDS } from '../domain/llm/lave8-structured-llm-provider.js';

export const BOSS_JOB_RADAR_OPENAI_API_KEY_ENV = 'BOSS_JOB_RADAR_OPENAI_API_KEY';
export const BOSS_JOB_RADAR_OPENAI_MODEL_ENV = 'BOSS_JOB_RADAR_OPENAI_MODEL';
export const BOSS_JOB_RADAR_LAVE8_API_KEY_ENV = 'BOSS_JOB_RADAR_LAVE8_API_KEY';
export const BOSS_JOB_RADAR_LAVE8_MODEL_ENV = 'BOSS_JOB_RADAR_LAVE8_MODEL';

export type StructuredLlmRuntimeConfig =
  | { readonly enabled: false }
  | { readonly enabled: true; readonly provider: 'openai'; readonly apiKey: string; readonly modelId: string }
  | { readonly enabled: true; readonly provider: 'lave8'; readonly apiKey: string; readonly modelId: string };

/** Parse explicit values only; never discover credentials or choose a model. */
export function parseStructuredLlmRuntimeConfig(
  openAiApiKey: unknown,
  openAiModel: unknown,
  lave8ApiKey?: unknown,
  lave8Model?: unknown,
): StructuredLlmRuntimeConfig {
  const hasOpenAi = openAiApiKey !== undefined || openAiModel !== undefined;
  const hasLave8 = lave8ApiKey !== undefined || lave8Model !== undefined;
  if (!hasOpenAi && !hasLave8) return { enabled: false };
  if (hasOpenAi && hasLave8) {
    throw new Error('Invalid structured LLM runtime configuration');
  }
  const apiKey = hasLave8 ? lave8ApiKey : openAiApiKey;
  const model = hasLave8 ? lave8Model : openAiModel;
  const allowedModels = hasLave8 ? LAVE8_STRUCTURED_LLM_MODEL_IDS : OPENAI_STRUCTURED_LLM_MODEL_IDS;
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0 || /\p{Cc}/u.test(apiKey)
    || typeof model !== 'string' || !allowedModels.some((allowed) => allowed === model)) {
    throw new Error('Invalid structured LLM runtime configuration');
  }
  return { enabled: true, provider: hasLave8 ? 'lave8' : 'openai', apiKey, modelId: model };
}
