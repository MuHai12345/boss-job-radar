import { describe, expect, it } from 'vitest';

import {
  summarizeLave8Error,
  type Lave8ErrorMessageHint,
} from '../src/domain/llm/lave8-structured-llm-diagnostics';

function hints(message: unknown): readonly Lave8ErrorMessageHint[] {
  return summarizeLave8Error({ error: { message } }).messageHints;
}

describe('Lave8 safe error message hints', () => {
  it('classifies only fixed local hints for representative relay compatibility messages', () => {
    expect(hints('Unknown model: requested model not found')).toEqual([
      'model',
      'model_not_found',
    ]);
    expect(hints('This model is not supported')).toEqual([
      'model',
      'model_unsupported',
      'unsupported',
    ]);
    expect(hints('Unsupported reasoning.effort parameter')).toEqual([
      'unsupported',
      'reasoning',
      'reasoning_effort',
    ]);
    expect(hints('json_schema is not supported in text.format')).toEqual([
      'unsupported',
      'text_format',
      'json_schema',
      'schema',
    ]);
    expect(hints('Use /v1/chat/completions instead of the Responses API endpoint')).toEqual([
      'responses_api',
      'chat_completions',
      'endpoint',
    ]);
    expect(hints('Unauthorized API key')).toEqual(['authentication']);
    expect(hints('Forbidden by permission policy')).toEqual(['permission']);
    expect(hints('Rate limit exceeded; quota exhausted')).toEqual(['rate_limit', 'quota']);
  });

  it('returns only other for unrecognized external text and never reflects it', () => {
    const sentinel = 'PRIVATE_VENDOR_SENTINEL_9f88c7';
    const summary = summarizeLave8Error({
      error: {
        message: sentinel,
        type: 'PRIVATE_VENDOR_TYPE',
        code: 'PRIVATE_VENDOR_CODE',
      },
    });

    expect(summary.messageHints).toEqual(['other']);
    expect(JSON.stringify(summary)).not.toContain(sentinel);
    expect(JSON.stringify(summary)).not.toContain('PRIVATE_VENDOR_TYPE');
    expect(JSON.stringify(summary)).not.toContain('PRIVATE_VENDOR_CODE');
  });

  it('does not invoke message accessors and treats missing/non-string messages as unavailable', () => {
    expect(hints(undefined)).toEqual([]);
    expect(hints(null)).toEqual([]);
    expect(hints(123)).toEqual([]);

    let getterCalls = 0;
    const error: Record<string, unknown> = {};
    Object.defineProperty(error, 'message', {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error('PRIVATE_ACCESSOR_SENTINEL');
      },
    });

    expect(summarizeLave8Error({ error }).messageHints).toEqual([]);
    expect(getterCalls).toBe(0);
  });

  it('inspects at most the first 2048 characters', () => {
    const message = `${'x'.repeat(2048)} model not found reasoning json_schema chat/completions`;
    expect(hints(message)).toEqual(['other']);
  });

  it('does not misclassify ordinary words that merely contain parameter-name substrings', () => {
    expect(hints('An upstream relay restored prior modeling metadata.')).toEqual(['other']);
  });

  it('deduplicates and bounds emitted hints to at most 16 fixed values', () => {
    const result = hints([
      'model not found unsupported api key permission forbidden rate limit quota',
      'unknown parameter invalid parameter background store stream reasoning effort',
      'max_output_tokens input text.format json_schema schema',
      '/v1/responses chat/completions endpoint',
    ].join(' '));

    expect(result.length).toBeLessThanOrEqual(16);
    expect(new Set(result).size).toBe(result.length);
    for (const value of result) {
      expect(typeof value).toBe('string');
      expect(value).not.toContain(' ');
    }
  });
});
