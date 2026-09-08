import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createLave8StructuredLlmProvider,
  LAVE8_STRUCTURED_LLM_ENDPOINT,
  LAVE8_STRUCTURED_LLM_MODEL_IDS,
  LAVE8_STRUCTURED_LLM_TIMEOUT_MS,
} from '../src/domain/llm/lave8-structured-llm-provider';
import { OPENAI_STRUCTURED_LLM_OUTPUT_SCHEMA } from '../src/domain/llm/openai-structured-llm-output-schema';
import type { StructuredLlmProviderRequest } from '../src/domain/llm/structured-llm-provider';

const REQUEST = {
  promptVersion: 'structured-llm-job-analysis-prompt-v1',
  outputSchemaVersion: 'structured-llm-job-analysis-v1',
  systemPrompt: 'SYSTEM_PROMPT_SENTINEL',
  userPrompt: 'USER_PROMPT_SENTINEL',
} satisfies StructuredLlmProviderRequest;

const SECRET = 'relay-test-PRIVATE_SECRET_SENTINEL';

function responseJson(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function completedResponse(payload: unknown, includeReasoning = true): unknown {
  return {
    id: 'resp_relay_test',
    object: 'response',
    status: 'completed',
    error: null,
    incomplete_details: null,
    output: [
      ...(includeReasoning ? [{ type: 'reasoning', id: 'rs_relay_test', summary: [] }] : []),
      {
        type: 'message',
        id: 'msg_relay_test',
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

function provider(fetchImpl: typeof fetch, modelId = 'gpt-6-astra') {
  return createLave8StructuredLlmProvider({
    apiKey: SECRET,
    modelId,
    fetchImpl,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Lave8 structured LLM provider configuration', () => {
  it('uses independent provider identity, a fixed endpoint, and only the approved model', () => {
    expect(LAVE8_STRUCTURED_LLM_ENDPOINT).toBe('https://lave8.com/v1/responses');
    expect(Object.isFrozen(LAVE8_STRUCTURED_LLM_MODEL_IDS)).toBe(true);
    expect(LAVE8_STRUCTURED_LLM_MODEL_IDS).toEqual(['gpt-6-astra']);

    const fetchImpl: typeof fetch = async () => responseJson(completedResponse({ ok: true }));
    const current = provider(fetchImpl);
    expect(current.providerId).toBe('lave8');
    expect(current.modelId).toBe('gpt-6-astra');

    for (const modelId of ['', 'gpt-6', 'gpt-5.6-sol', ' gpt-6-astra', 'gpt-6-astra ']) {
      expect(() => provider(fetchImpl, modelId)).toThrow(
        'Invalid Lave8 structured LLM provider configuration',
      );
    }
  });

  it('validates the relay secret without exposing it on the provider object', () => {
    const fetchImpl: typeof fetch = async () => responseJson(completedResponse({ ok: true }));
    for (const apiKey of ['', '   ', 'bad\nkey', 'bad\u0000key']) {
      expect(() => createLave8StructuredLlmProvider({ apiKey, modelId: 'gpt-6-astra', fetchImpl })).toThrow(
        'Invalid Lave8 structured LLM provider configuration',
      );
    }

    const current = provider(fetchImpl);
    expect(Object.keys(current).sort()).toEqual(['generate', 'modelId', 'providerId']);
    expect(JSON.stringify(current)).not.toContain(SECRET);
  });
});

describe('Lave8 Responses request contract', () => {
  it('sends one fixed relay POST, keeps the secret only in Bearer auth, and preserves the strict Responses shape', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ input, init });
      return responseJson(completedResponse({ transported: true }));
    };

    await expect(provider(fetchImpl).generate(REQUEST)).resolves.toEqual({ transported: true });
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.input).toBe('https://lave8.com/v1/responses');
    expect(call.init?.method).toBe('POST');
    expect(call.init?.redirect).toBe('error');
    expect(call.init?.credentials).toBe('omit');
    expect(call.init?.headers).toEqual({
      Authorization: `Bearer ${SECRET}`,
      'Content-Type': 'application/json',
    });

    expect(typeof call.init?.body).toBe('string');
    const rawBody = call.init!.body as string;
    expect(rawBody).not.toContain(SECRET);
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'gpt-6-astra',
      store: false,
      background: false,
      stream: false,
      reasoning: { effort: 'low' },
      max_output_tokens: 4000,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: REQUEST.systemPrompt }] },
        { role: 'user', content: [{ type: 'input_text', text: REQUEST.userPrompt }] },
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
});

describe('Lave8 Responses success parsing', () => {
  it('accepts exactly one completed assistant output_text after optional reasoning and returns parsed unknown JSON', async () => {
    const expected = { schemaVersion: 'relay-transport-test', nested: { value: 6 } };
    await expect(provider(async () => responseJson(completedResponse(expected))).generate(REQUEST)).resolves.toEqual(expected);
    await expect(provider(async () => responseJson(completedResponse(expected, false))).generate(REQUEST)).resolves.toEqual(expected);
  });

  it('keeps product grounding outside the transport layer', async () => {
    const transportOnly = { arbitrary: 'transport-only-json' };
    await expect(provider(async () => responseJson(completedResponse(transportOnly))).generate(REQUEST)).resolves.toEqual(transportOnly);
  });
});

describe('Lave8 Responses fail-closed behavior', () => {
  it.each([
    ['incomplete', { ...completedResponse({ ok: true }) as Record<string, unknown>, status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }],
    ['failed', { ...completedResponse({ ok: true }) as Record<string, unknown>, status: 'failed', error: { message: 'PRIVATE_UPSTREAM_ERROR' } }],
    ['queued', { ...completedResponse({ ok: true }) as Record<string, unknown>, status: 'queued' }],
    ['tool output', { ...completedResponse({ ok: true }) as Record<string, unknown>, output: [{ type: 'function_call', name: 'x' }] }],
    ['chat completions shape', { id: 'chatcmpl_test', choices: [{ message: { role: 'assistant', content: '{"ok":true}' } }] }],
    ['refusal', {
      ...completedResponse({ ok: true }) as Record<string, unknown>,
      output: [{
        type: 'message', role: 'assistant', status: 'completed',
        content: [{ type: 'refusal', refusal: 'PRIVATE_REFUSAL_TEXT' }],
      }],
    }],
  ])('rejects %s using only the fixed generic error', async (_name, body) => {
    const current = provider(async () => responseJson(body));
    await expect(current.generate(REQUEST)).rejects.toThrow('Structured LLM provider failed');
    try {
      await current.generate(REQUEST);
    } catch (error) {
      expect(String(error)).not.toContain('PRIVATE_');
      expect(String(error)).not.toContain(SECRET);
    }
  });

  it('rejects malformed output JSON, malformed HTTP JSON, and non-2xx without reading an error body', async () => {
    const invalidOutput = provider(async () => responseJson({
      ...(completedResponse({ ok: true }) as Record<string, unknown>),
      output: [{
        type: 'message', role: 'assistant', status: 'completed',
        content: [{ type: 'output_text', text: '{PRIVATE_BAD_JSON' }],
      }],
    }));
    await expect(invalidOutput.generate(REQUEST)).rejects.toThrow('Structured LLM provider failed');

    await expect(provider(async () => new Response('PRIVATE_NOT_JSON', { status: 200 })).generate(REQUEST)).rejects.toThrow(
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
    await expect(provider(non2xx).generate(REQUEST)).rejects.toThrow('Structured LLM provider failed');
    expect(jsonRead).toBe(false);
  });

  it('uses zero retries and does not leak a thrown relay/network error', async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      throw new Error(`${SECRET} PRIVATE_NETWORK_DETAIL`);
    };
    await expect(provider(fetchImpl).generate(REQUEST)).rejects.toThrow('Structured LLM provider failed');
    expect(calls).toBe(1);
  });

  it('aborts at the fixed 45 second deadline with one request and no fallback', async () => {
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
    expect(LAVE8_STRUCTURED_LLM_TIMEOUT_MS).toBe(45_000);
    expect(calls).toBe(1);
    expect(signal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(LAVE8_STRUCTURED_LLM_TIMEOUT_MS);
    await rejected;
    expect(signal?.aborted).toBe(true);
    expect(calls).toBe(1);
  });
});
