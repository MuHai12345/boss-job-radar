import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createOpenAiStructuredLlmProvider,
  OPENAI_STRUCTURED_LLM_TIMEOUT_MS,
} from '../src/domain/llm/openai-structured-llm-provider';
import { OPENAI_STRUCTURED_LLM_OUTPUT_SCHEMA } from '../src/domain/llm/openai-structured-llm-output-schema';
import type { StructuredLlmProviderRequest } from '../src/domain/llm/structured-llm-provider';

const REQUEST = {
  promptVersion: 'structured-llm-job-analysis-prompt-v1',
  outputSchemaVersion: 'structured-llm-job-analysis-v1',
  systemPrompt: 'SYSTEM_PROMPT_SENTINEL',
  userPrompt: 'USER_PROMPT_SENTINEL',
} satisfies StructuredLlmProviderRequest;

const SECRET = 'sk-test-PRIVATE_SECRET_SENTINEL';

function responseJson(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function completedResponse(payload: unknown, includeReasoning = true): unknown {
  return {
    id: 'resp_test',
    object: 'response',
    status: 'completed',
    error: null,
    incomplete_details: null,
    output: [
      ...(includeReasoning ? [{ type: 'reasoning', id: 'rs_test', summary: [] }] : []),
      {
        type: 'message',
        id: 'msg_test',
        status: 'completed',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: JSON.stringify(payload),
            annotations: [],
          },
        ],
      },
    ],
  };
}

function provider(fetchImpl: typeof fetch, modelId = 'gpt-5.6-terra') {
  return createOpenAiStructuredLlmProvider({
    apiKey: SECRET,
    modelId,
    fetchImpl,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('OpenAI structured LLM provider configuration', () => {
  it('uses a fixed provider id and accepts only the approved explicit model ids', () => {
    const fetchImpl: typeof fetch = async () => responseJson(completedResponse({ ok: true }));
    for (const modelId of ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol']) {
      const current = provider(fetchImpl, modelId);
      expect(current.providerId).toBe('openai');
      expect(current.modelId).toBe(modelId);
    }
    for (const modelId of ['', 'gpt-5.6', 'gpt-6-astra', ' gpt-5.6-sol', 'gpt-5.6-sol ']) {
      expect(() => provider(fetchImpl, modelId)).toThrow(
        'Invalid OpenAI structured LLM provider configuration',
      );
    }
  });

  it('validates the constructor secret without persisting or exposing it on the provider object', () => {
    const fetchImpl: typeof fetch = async () => responseJson(completedResponse({ ok: true }));
    for (const apiKey of ['', '   ', 'bad\nkey', 'bad\u0000key']) {
      expect(() => createOpenAiStructuredLlmProvider({ apiKey, modelId: 'gpt-5.6-luna', fetchImpl })).toThrow(
        'Invalid OpenAI structured LLM provider configuration',
      );
    }

    const current = provider(fetchImpl);
    expect(Object.keys(current).sort()).toEqual(['generate', 'modelId', 'providerId', 'timeoutMs']);
    expect(current.timeoutMs).toBe(OPENAI_STRUCTURED_LLM_TIMEOUT_MS);
    expect(JSON.stringify(current)).not.toContain(SECRET);
  });
});

describe('OpenAI Responses request contract', () => {
  it('sends exactly one fixed-endpoint POST with the key only in Authorization and keeps system/user prompts separate', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ input, init });
      return responseJson(completedResponse({ transported: true }));
    };

    await expect(provider(fetchImpl).generate(REQUEST)).resolves.toEqual({ transported: true });
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.input).toBe('https://api.openai.com/v1/responses');
    expect(call.init?.method).toBe('POST');
    expect(call.init?.redirect).toBe('error');
    expect(call.init?.credentials).toBe('omit');

    const headers = call.init?.headers as Record<string, string>;
    expect(headers).toEqual({
      Authorization: `Bearer ${SECRET}`,
      'Content-Type': 'application/json',
    });

    expect(typeof call.init?.body).toBe('string');
    const rawBody = call.init!.body as string;
    expect(rawBody).not.toContain(SECRET);
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'gpt-5.6-terra',
      store: false,
      background: false,
      stream: false,
      reasoning: { effort: 'low' },
      max_output_tokens: 4000,
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: REQUEST.systemPrompt }],
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: REQUEST.userPrompt }],
        },
      ],
    });
    for (const forbidden of [
      'tools', 'conversation', 'previous_response_id', 'user', 'metadata',
      'web_search', 'file_search', 'code_interpreter',
    ]) {
      expect(body).not.toHaveProperty(forbidden);
    }

    expect(body.text).toEqual({
      format: {
        type: 'json_schema',
        name: 'structured_llm_job_analysis',
        strict: true,
        schema: OPENAI_STRUCTURED_LLM_OUTPUT_SCHEMA,
      },
    });
  });

  it('publishes a strict root object schema aligned with the v1 transport contract', () => {
    const root = OPENAI_STRUCTURED_LLM_OUTPUT_SCHEMA;
    expect(root.type).toBe('object');
    expect(root.additionalProperties).toBe(false);
    expect(root).not.toHaveProperty('anyOf');
    expect(new Set(root.required)).toEqual(new Set(Object.keys(root.properties)));
    expect(root.properties.schemaVersion).toEqual({
      type: 'string',
      enum: ['structured-llm-job-analysis-v1'],
    });
    expect(root.properties.roleSummary).toEqual({ type: 'string', minLength: 1, maxLength: 600 });
    expect(root.properties.responsibilityFindings.maxItems).toBe(12);
    expect(root.properties.interviewQuestions.maxItems).toBe(6);
    expect(root.properties.confidence).toEqual({
      type: 'string',
      enum: ['high', 'medium', 'low'],
    });

    const seen = new Set<object>();
    function inspect(value: unknown): void {
      if (value === null || typeof value !== 'object' || seen.has(value as object)) return;
      seen.add(value as object);
      if (Array.isArray(value)) {
        for (const item of value) inspect(item);
        return;
      }
      const object = value as Record<string, unknown>;
      if (object.type === 'object') {
        expect(object.additionalProperties).toBe(false);
        const properties = object.properties as Record<string, unknown>;
        expect(new Set(object.required as string[])).toEqual(new Set(Object.keys(properties)));
      }
      for (const child of Object.values(object)) inspect(child);
    }
    inspect(root);
  });
});

describe('OpenAI Responses success parsing', () => {
  it('accepts one completed assistant output_text after an optional reasoning item and returns parsed unknown JSON', async () => {
    const expected = { schemaVersion: 'transport-test', nested: { value: 3 } };
    const fetchImpl: typeof fetch = async () => responseJson(completedResponse(expected));
    await expect(provider(fetchImpl).generate(REQUEST)).resolves.toEqual(expected);

    const noReasoning: typeof fetch = async () => responseJson(completedResponse(expected, false));
    await expect(provider(noReasoning).generate(REQUEST)).resolves.toEqual(expected);
  });

  it('does not trust Structured Outputs as the product grounding boundary', async () => {
    const deliberatelyInvalidProductShape = { arbitrary: 'transport-only-json' };
    const fetchImpl: typeof fetch = async () => responseJson(completedResponse(deliberatelyInvalidProductShape));
    await expect(provider(fetchImpl).generate(REQUEST)).resolves.toEqual(deliberatelyInvalidProductShape);
  });
});

describe('OpenAI Responses fail-closed behavior', () => {
  it.each([
    ['incomplete response', { ...completedResponse({ ok: true }) as Record<string, unknown>, status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }],
    ['failed response', { ...completedResponse({ ok: true }) as Record<string, unknown>, status: 'failed', error: { message: 'PRIVATE_UPSTREAM_ERROR' } }],
    ['queued response', { ...completedResponse({ ok: true }) as Record<string, unknown>, status: 'queued' }],
    ['missing output', { status: 'completed', error: null, incomplete_details: null }],
    ['tool output', { ...completedResponse({ ok: true }) as Record<string, unknown>, output: [{ type: 'function_call', name: 'x' }] }],
    ['multiple assistant messages', {
      ...completedResponse({ ok: true }) as Record<string, unknown>,
      output: [
        (completedResponse({ one: 1 }, false) as { output: unknown[] }).output[0],
        (completedResponse({ two: 2 }, false) as { output: unknown[] }).output[0],
      ],
    }],
    ['multiple content items', {
      ...completedResponse({ ok: true }) as Record<string, unknown>,
      output: [{
        type: 'message', role: 'assistant', status: 'completed',
        content: [
          { type: 'output_text', text: '{"a":1}' },
          { type: 'output_text', text: '{"b":2}' },
        ],
      }],
    }],
    ['refusal', {
      ...completedResponse({ ok: true }) as Record<string, unknown>,
      output: [{
        type: 'message', role: 'assistant', status: 'completed',
        content: [{ type: 'refusal', refusal: 'PRIVATE_REFUSAL_TEXT' }],
      }],
    }],
    ['refusal plus output', {
      ...completedResponse({ ok: true }) as Record<string, unknown>,
      output: [{
        type: 'message', role: 'assistant', status: 'completed',
        content: [
          { type: 'refusal', refusal: 'PRIVATE_REFUSAL_TEXT' },
          { type: 'output_text', text: '{"ok":true}' },
        ],
      }],
    }],
  ])('rejects %s with only the fixed generic error', async (_name, body) => {
    const fetchImpl: typeof fetch = async () => responseJson(body);
    await expect(provider(fetchImpl).generate(REQUEST)).rejects.toThrow(
      'Structured LLM provider failed',
    );
    try {
      await provider(fetchImpl).generate(REQUEST);
    } catch (error) {
      expect(String(error)).not.toContain('PRIVATE_');
    }
  });

  it('rejects malformed JSON output text, malformed HTTP JSON, and non-2xx without leaking bodies', async () => {
    const invalidOutputText: typeof fetch = async () => responseJson({
      ...(completedResponse({ ok: true }) as Record<string, unknown>),
      output: [{
        type: 'message', role: 'assistant', status: 'completed',
        content: [{ type: 'output_text', text: '{PRIVATE_BAD_JSON' }],
      }],
    });
    await expect(provider(invalidOutputText).generate(REQUEST)).rejects.toThrow(
      'Structured LLM provider failed',
    );

    const invalidHttpJson: typeof fetch = async () => new Response('PRIVATE_NOT_JSON', { status: 200 });
    await expect(provider(invalidHttpJson).generate(REQUEST)).rejects.toThrow(
      'Structured LLM provider failed',
    );

    let jsonRead = false;
    const non2xx: typeof fetch = async () => ({
      status: 429,
      async json() {
        jsonRead = true;
        throw new Error('PRIVATE_RATE_LIMIT_BODY');
      },
    } as unknown as Response);
    await expect(provider(non2xx).generate(REQUEST)).rejects.toThrow(
      'Structured LLM provider failed',
    );
    expect(jsonRead).toBe(false);
  });

  it('uses zero retries and sanitizes thrown transport errors', async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      throw new Error(`${SECRET} PRIVATE_NETWORK_DETAIL`);
    };
    await expect(provider(fetchImpl).generate(REQUEST)).rejects.toThrow(
      'Structured LLM provider failed',
    );
    expect(calls).toBe(1);
    try {
      await provider(fetchImpl).generate(REQUEST);
    } catch (error) {
      expect(String(error)).not.toContain(SECRET);
      expect(String(error)).not.toContain('PRIVATE_NETWORK_DETAIL');
    }
  });

  it('aborts at the fixed 45 second timeout with one request and no retry', async () => {
    vi.useFakeTimers();
    let calls = 0;
    let signal: AbortSignal | undefined;
    const fetchImpl: typeof fetch = (_input, init) => {
      calls += 1;
      signal = init?.signal as AbortSignal | undefined;
      return new Promise<Response>(() => undefined);
    };
    const pending = provider(fetchImpl).generate(REQUEST);
    const rejected = expect(pending).rejects.toThrow('Structured LLM provider failed');
    expect(OPENAI_STRUCTURED_LLM_TIMEOUT_MS).toBe(45_000);
    expect(calls).toBe(1);
    expect(signal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(OPENAI_STRUCTURED_LLM_TIMEOUT_MS);
    await rejected;
    expect(signal?.aborted).toBe(true);
    expect(calls).toBe(1);
  });
});
