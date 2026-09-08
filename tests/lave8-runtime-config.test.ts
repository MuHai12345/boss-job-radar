import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  BOSS_JOB_RADAR_LAVE8_API_KEY_ENV,
  BOSS_JOB_RADAR_LAVE8_MODEL_ENV,
  BOSS_JOB_RADAR_OPENAI_API_KEY_ENV,
  BOSS_JOB_RADAR_OPENAI_MODEL_ENV,
  parseStructuredLlmRuntimeConfig,
} from '../src/local-service/structured-llm-runtime-config';

const mainSource = readFileSync(
  fileURLToPath(new URL('../src/local-service/main.ts', import.meta.url)),
  'utf8',
);

describe('Lave8 runtime configuration', () => {
  it('keeps provider-specific environment variables explicit and disabled by default', () => {
    expect(BOSS_JOB_RADAR_OPENAI_API_KEY_ENV).toBe('BOSS_JOB_RADAR_OPENAI_API_KEY');
    expect(BOSS_JOB_RADAR_OPENAI_MODEL_ENV).toBe('BOSS_JOB_RADAR_OPENAI_MODEL');
    expect(BOSS_JOB_RADAR_LAVE8_API_KEY_ENV).toBe('BOSS_JOB_RADAR_LAVE8_API_KEY');
    expect(BOSS_JOB_RADAR_LAVE8_MODEL_ENV).toBe('BOSS_JOB_RADAR_LAVE8_MODEL');
    expect(parseStructuredLlmRuntimeConfig(undefined, undefined, undefined, undefined)).toEqual({ enabled: false });
  });

  it('accepts only the approved Lave8 model and preserves the original relay secret value', () => {
    const apiKey = '  relay-private-key  ';
    expect(parseStructuredLlmRuntimeConfig(undefined, undefined, apiKey, 'gpt-6-astra')).toEqual({
      enabled: true,
      provider: 'lave8',
      apiKey,
      modelId: 'gpt-6-astra',
    });
  });

  it('fails closed for partial/invalid Lave8 configuration and simultaneous providers', () => {
    const invalidCases: readonly (readonly [unknown, unknown, unknown, unknown])[] = [
      [undefined, undefined, 'relay-key', undefined],
      [undefined, undefined, undefined, 'gpt-6-astra'],
      [undefined, undefined, '', 'gpt-6-astra'],
      [undefined, undefined, '   ', 'gpt-6-astra'],
      [undefined, undefined, 'bad\nkey', 'gpt-6-astra'],
      [undefined, undefined, 'relay-key', ''],
      [undefined, undefined, 'relay-key', 'gpt-6'],
      [undefined, undefined, 'relay-key', ' gpt-6-astra'],
      ['openai-key', 'gpt-5.6-terra', 'relay-key', 'gpt-6-astra'],
      ['openai-key', undefined, 'relay-key', 'gpt-6-astra'],
    ];

    for (const args of invalidCases) {
      expect(() => parseStructuredLlmRuntimeConfig(...args)).toThrow(
        'Invalid structured LLM runtime configuration',
      );
    }
  });

  it('preserves the existing OpenAI configuration result shape for existing callers', () => {
    const apiKey = '  sk-local-test-key  ';
    expect(parseStructuredLlmRuntimeConfig(apiKey, 'gpt-5.6-terra')).toEqual({
      enabled: true,
      apiKey,
      modelId: 'gpt-5.6-terra',
    });
  });

  it('wires Lave8 only in the local-service process and includes both provider secrets in startup sanitization', () => {
    expect(mainSource).toContain('createOpenAiStructuredLlmProvider');
    expect(mainSource).toContain('createLave8StructuredLlmProvider');
    expect(mainSource).toContain('process.env[BOSS_JOB_RADAR_OPENAI_API_KEY_ENV]');
    expect(mainSource).toContain('process.env[BOSS_JOB_RADAR_LAVE8_API_KEY_ENV]');
    expect(mainSource).toContain('openAiApiKey,');
    expect(mainSource).toContain('lave8ApiKey,');
    expect(mainSource).toContain("llmConfig.provider === 'lave8'");
    expect(mainSource).not.toContain('fetch(');
    expect(mainSource).not.toContain('api.openai.com');
    expect(mainSource).not.toContain('lave8.com');
  });
});
