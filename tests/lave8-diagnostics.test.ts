import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  safeLave8RequestParameter,
  summarizeLave8Error,
} from '../src/domain/llm/lave8-structured-llm-diagnostics';
import {
  createLave8StructuredLlmProvider,
  LAVE8_STRUCTURED_LLM_TIMEOUT_MS,
  type Lave8StructuredLlmDiagnosticEvent,
} from '../src/domain/llm/lave8-structured-llm-provider';
import type { StructuredLlmProviderRequest } from '../src/domain/llm/structured-llm-provider';

const SECRET = 'relay-diagnostic-PRIVATE_SECRET_SENTINEL';
const REQUEST = {
  promptVersion: 'structured-llm-job-analysis-prompt-v1',
  outputSchemaVersion: 'structured-llm-job-analysis-v1',
  systemPrompt: 'PRIVATE_SYSTEM_PROMPT_SENTINEL',
  userPrompt: 'PRIVATE_USER_PROMPT_AND_JD_SENTINEL',
} satisfies StructuredLlmProviderRequest;

function responseJson(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function completedResponse(payload: unknown): unknown {
  return {
    id: 'PRIVATE_RESPONSE_ID',
    status: 'completed',
    error: null,
    incomplete_details: null,
    output: [
      { type: 'reasoning', id: 'PRIVATE_REASONING_ID', summary: [{ text: 'PRIVATE_REASONING_TEXT' }] },
      {
        type: 'message',
        id: 'PRIVATE_MESSAGE_ID',
        status: 'completed',
        role: 'assistant',
        content: [{
          type: 'output_text',
          text: JSON.stringify(payload),
          annotations: [{ secret: 'PRIVATE_ANNOTATION' }],
        }],
      },
    ],
  };
}

function create(options: {
  fetchImpl: typeof fetch;
  events?: Lave8StructuredLlmDiagnosticEvent[];
  onDiagnostic?: (event: Lave8StructuredLlmDiagnosticEvent) => void;
}) {
  return createLave8StructuredLlmProvider({
    apiKey: SECRET,
    modelId: 'gpt-5.6-sol',
    fetchImpl: options.fetchImpl,
    onDiagnostic: options.onDiagnostic ?? ((event) => {
      expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      options.events?.push(event);
    }),
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Lave8 secret-safe diagnostic classifiers', () => {
  it('recognizes only the approved request parameter paths and maps everything else to unknown', () => {
    const approved = [
      'model', 'background', 'store', 'stream', 'reasoning', 'reasoning.effort',
      'max_output_tokens', 'input', 'text', 'text.format', 'text.format.type',
      'text.format.name', 'text.format.strict', 'text.format.schema',
    ] as const;
    for (const param of approved) {
      expect(safeLave8RequestParameter({ error: { param } })).toBe(param);
    }
    expect(safeLave8RequestParameter({ error: { param: 'PRIVATE_UNKNOWN_PARAMETER' } })).toBe('unknown');
    expect(safeLave8RequestParameter({ error: { param: 123 } })).toBe('unknown');
    expect(safeLave8RequestParameter(null)).toBe('unknown');
  });

  it('summarizes only fixed error structure/type/code categories without reading message accessors', () => {
    expect(summarizeLave8Error(undefined)).toEqual({
      bodyStructure: 'json_object_absent', errorType: 'absent', errorCode: 'absent', messageHints: [],
    });
    expect(summarizeLave8Error({ ok: false })).toEqual({
      bodyStructure: 'error_object_absent', errorType: 'absent', errorCode: 'absent', messageHints: [],
    });
    expect(summarizeLave8Error({ error: {
      type: 'invalid_request_error', code: 'unsupported_parameter', message: 'PRIVATE_RAW_MESSAGE',
    } })).toEqual({
      bodyStructure: 'error_object_present', errorType: 'invalid_request', errorCode: 'unsupported_parameter',
      messageHints: ['other'],
    });
    expect(summarizeLave8Error({ error: {
      type: 'authentication_error', code: 'invalid_api_key',
    } })).toEqual({
      bodyStructure: 'error_object_present', errorType: 'authentication', errorCode: 'invalid_api_key', messageHints: [],
    });
    expect(summarizeLave8Error({ error: {
      type: 'rate_limit_error', code: 'insufficient_quota',
    } })).toEqual({
      bodyStructure: 'error_object_present', errorType: 'rate_limit', errorCode: 'insufficient_quota', messageHints: [],
    });
    expect(summarizeLave8Error({ error: {
      type: 'PRIVATE_EXTERNAL_TYPE', code: 'PRIVATE_EXTERNAL_CODE',
    } })).toEqual({
      bodyStructure: 'error_object_present', errorType: 'other', errorCode: 'other', messageHints: [],
    });

    let messageRead = false;
    const externalError = { type: 'server_error', code: 'context_length_exceeded' } as Record<string, unknown>;
    Object.defineProperty(externalError, 'message', {
      enumerable: true,
      get() {
        messageRead = true;
        throw new Error('PRIVATE_MESSAGE_ACCESSOR');
      },
    });
    expect(summarizeLave8Error({ error: externalError })).toEqual({
      bodyStructure: 'error_object_present', errorType: 'server', errorCode: 'context_length', messageHints: [],
    });
    expect(messageRead).toBe(false);
  });
});

describe('Lave8 secret-safe transport diagnostics', () => {
  it('emits only request/http/accepted metadata for a successful response', async () => {
    const events: Lave8StructuredLlmDiagnosticEvent[] = [];
    const provider = create({
      events,
      fetchImpl: async () => responseJson(completedResponse({ transported: true })),
    });

    await expect(provider.generate(REQUEST)).resolves.toEqual({ transported: true });
    expect(events).toMatchObject([
      { scope: 'lave8', event: 'request_started' },
      { scope: 'lave8', event: 'http_response', status: 200 },
      { scope: 'lave8', event: 'response_accepted' },
    ]);
    const serialized = JSON.stringify(events);
    for (const forbidden of [SECRET, REQUEST.systemPrompt, REQUEST.userPrompt, 'PRIVATE_RESPONSE_ID', 'PRIVATE_REASONING_TEXT']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('extracts only approved non-2xx metadata and never relays provider error text', async () => {
    const events: Lave8StructuredLlmDiagnosticEvent[] = [];
    const provider = create({
      events,
      fetchImpl: async () => responseJson({
        error: {
          param: 'reasoning.effort',
          message: `PRIVATE_UPSTREAM_MESSAGE ${SECRET}`,
          code: 'unsupported_parameter',
          type: 'invalid_request_error',
        },
      }, 400),
    });

    await expect(provider.generate(REQUEST)).rejects.toThrow('Structured LLM provider failed');
    expect(events).toMatchObject([
      { scope: 'lave8', event: 'request_started' },
      { scope: 'lave8', event: 'http_response', status: 400 },
      {
        scope: 'lave8', event: 'http_non_2xx', status: 400, requestParameter: 'reasoning.effort',
        summary: {
          bodyStructure: 'error_object_present', errorType: 'invalid_request', errorCode: 'unsupported_parameter',
          messageHints: ['other'],
        },
      },
    ]);
    expect(JSON.stringify(events)).not.toContain('PRIVATE_');
    expect(JSON.stringify(events)).not.toContain(SECRET);
  });

  it('maps arbitrary upstream error metadata to fixed unknown/other categories', async () => {
    const events: Lave8StructuredLlmDiagnosticEvent[] = [];
    const provider = create({
      events,
      fetchImpl: async () => responseJson({
        error: {
          param: 'PRIVATE_MADE_UP_FIELD',
          message: 'PRIVATE_BODY',
          type: 'PRIVATE_TYPE',
          code: 'PRIVATE_CODE',
        },
      }, 422),
    });

    await expect(provider.generate(REQUEST)).rejects.toThrow('Structured LLM provider failed');
    expect(events.at(-1)).toMatchObject({
      scope: 'lave8', event: 'http_non_2xx', status: 422, requestParameter: 'unknown',
      summary: {
        bodyStructure: 'error_object_present', errorType: 'other', errorCode: 'other', messageHints: ['other'],
      },
    });
    expect(JSON.stringify(events)).not.toContain('PRIVATE_');
  });

  it('classifies a non-JSON non-2xx body without exposing the body', async () => {
    const events: Lave8StructuredLlmDiagnosticEvent[] = [];
    const provider = create({
      events,
      fetchImpl: async () => new Response('PRIVATE_NON_JSON_ERROR_BODY', { status: 400 }),
    });

    await expect(provider.generate(REQUEST)).rejects.toThrow('Structured LLM provider failed');
    expect(events.at(-1)).toMatchObject({
      scope: 'lave8', event: 'http_non_2xx', status: 400, requestParameter: 'unknown',
      summary: {
        bodyStructure: 'json_object_absent', errorType: 'absent', errorCode: 'absent', messageHints: [],
      },
    });
    expect(JSON.stringify(events)).not.toContain('PRIVATE_NON_JSON_ERROR_BODY');
  });

  it('distinguishes malformed 2xx JSON without exposing response text or parse errors', async () => {
    const events: Lave8StructuredLlmDiagnosticEvent[] = [];
    const provider = create({
      events,
      fetchImpl: async () => new Response('PRIVATE_RAW_RESPONSE_BODY', { status: 200 }),
    });

    await expect(provider.generate(REQUEST)).rejects.toThrow('Structured LLM provider failed');
    expect(events).toMatchObject([
      { scope: 'lave8', event: 'request_started' },
      { scope: 'lave8', event: 'http_response', status: 200 },
      { scope: 'lave8', event: 'response_json_invalid' },
    ]);
    expect(JSON.stringify(events)).not.toContain('PRIVATE_RAW_RESPONSE_BODY');
  });

  it('summarizes an invalid Responses contract using only fixed enums and bounded counts', async () => {
    const events: Lave8StructuredLlmDiagnosticEvent[] = [];
    const body = {
      status: 'failed',
      error: { message: 'PRIVATE_PROVIDER_FAILURE' },
      output: [
        {
          type: 'message', role: 'assistant', status: 'completed',
          content: [{ type: 'refusal', refusal: 'PRIVATE_REFUSAL_TEXT' }],
        },
        { type: 'PRIVATE_UNKNOWN_OUTPUT_KIND', payload: 'PRIVATE_PAYLOAD' },
      ],
    };
    const provider = create({ events, fetchImpl: async () => responseJson(body) });

    await expect(provider.generate(REQUEST)).rejects.toThrow('Structured LLM provider failed');
    expect(events).toMatchObject([
      { scope: 'lave8', event: 'request_started' },
      { scope: 'lave8', event: 'http_response', status: 200 },
      {
        scope: 'lave8', event: 'response_contract_invalid',
        summary: {
          responseStatus: 'failed',
          outputItemKinds: ['message', 'other'],
          assistantMessageCount: 1,
          assistantContentKinds: ['refusal'],
          outputTextCount: 0,
        },
      },
    ]);
    const serialized = JSON.stringify(events);
    for (const forbidden of ['PRIVATE_PROVIDER_FAILURE', 'PRIVATE_REFUSAL_TEXT', 'PRIVATE_UNKNOWN_OUTPUT_KIND', 'PRIVATE_PAYLOAD']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('emits network_failure once and never retries a rejected transport', async () => {
    const events: Lave8StructuredLlmDiagnosticEvent[] = [];
    let calls = 0;
    const provider = create({
      events,
      fetchImpl: async () => {
        calls += 1;
        throw new Error(`PRIVATE_NETWORK_ERROR ${SECRET}`);
      },
    });

    await expect(provider.generate(REQUEST)).rejects.toThrow('Structured LLM provider failed');
    expect(calls).toBe(1);
    expect(events).toMatchObject([
      { scope: 'lave8', event: 'request_started' },
      { scope: 'lave8', event: 'network_failure' },
    ]);
    expect(JSON.stringify(events)).not.toContain('PRIVATE_');
    expect(JSON.stringify(events)).not.toContain(SECRET);
  });

  it('emits timeout without double-reporting the abort as a network failure', async () => {
    vi.useFakeTimers();
    const events: Lave8StructuredLlmDiagnosticEvent[] = [];
    let calls = 0;
    let signal: AbortSignal | undefined;
    const provider = create({
      events,
      fetchImpl: (_input, init) => {
        calls += 1;
        signal = init?.signal as AbortSignal | undefined;
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('PRIVATE_ABORT_ERROR')), { once: true });
        });
      },
    });

    const pending = provider.generate(REQUEST);
    const rejected = expect(pending).rejects.toThrow('Structured LLM provider failed');
    await vi.advanceTimersByTimeAsync(LAVE8_STRUCTURED_LLM_TIMEOUT_MS);
    await rejected;

    expect(calls).toBe(1);
    expect(signal?.aborted).toBe(true);
    expect(events).toMatchObject([
      { scope: 'lave8', event: 'request_started' },
      { scope: 'lave8', event: 'timeout' },
    ]);
  });

  it('ignores diagnostic callback failures without changing a successful provider result or causing another fetch', async () => {
    let calls = 0;
    const provider = create({
      fetchImpl: async () => {
        calls += 1;
        return responseJson(completedResponse({ ok: true }));
      },
      onDiagnostic() {
        throw new Error('PRIVATE_DIAGNOSTIC_CALLBACK_FAILURE');
      },
    });

    await expect(provider.generate(REQUEST)).resolves.toEqual({ ok: true });
    expect(calls).toBe(1);
  });
});
