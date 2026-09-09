import { OPENAI_STRUCTURED_LLM_OUTPUT_SCHEMA } from './openai-structured-llm-output-schema.js';
import type { StructuredLlmProvider, StructuredLlmProviderRequest } from './structured-llm-provider.js';
import {
  emitDiagnosticSafely, safeLave8RequestParameter, summarizeLave8Error, summarizeLave8Response,
  type Lave8RequestParameter, type Lave8StructuredLlmDiagnosticEvent,
} from './lave8-structured-llm-diagnostics.js';

export type { Lave8StructuredLlmDiagnosticEvent } from './lave8-structured-llm-diagnostics.js';

export const LAVE8_STRUCTURED_LLM_TIMEOUT_MS = 45_000;
export const LAVE8_STRUCTURED_LLM_ENDPOINT = 'https://lave8.com/v1/responses';
export const LAVE8_STRUCTURED_LLM_MODEL_IDS = Object.freeze(['gpt-5.6-sol'] as const);

export interface Lave8StructuredLlmProviderOptions {
  readonly apiKey: string;
  readonly modelId: string;
  readonly fetchImpl?: typeof fetch;
  readonly onDiagnostic?: (event: Lave8StructuredLlmDiagnosticEvent) => void;
}

function failed(): never { throw new Error('Structured LLM provider failed'); }

/** Guard external objects before reading fields; do not invoke accessors. */
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) failed();
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) failed();
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !descriptor || !('value' in descriptor) || !descriptor.enumerable) failed();
  }
  return value as Record<string, unknown>;
}

function withoutFailure(value: Record<string, unknown>): void {
  if ((value.error !== undefined && value.error !== null)
    || (value.incomplete_details !== undefined && value.incomplete_details !== null)
    || (value.refusal !== undefined && value.refusal !== null)) failed();
}

function parseResponse(value: unknown): unknown {
  const response = object(value);
  withoutFailure(response);
  if (response.status !== 'completed' || !Array.isArray(response.output)) failed();
  let payload: string | undefined;
  for (const output of response.output) {
    const item = object(output);
    withoutFailure(item);
    if (item.type === 'reasoning') {
      // Reasoning never supplies the final structured payload.
      if (item.status !== undefined && item.status !== 'completed') failed();
      continue;
    }
    // All other output kinds (including tool calls/results) fail closed.
    if (item.type !== 'message' || item.role !== 'assistant' || item.status !== 'completed'
      || payload !== undefined || !Array.isArray(item.content) || item.content.length !== 1) failed();
    const content = object(item.content[0]);
    withoutFailure(content);
    if (content.type !== 'output_text' || typeof content.text !== 'string') failed();
    payload = content.text;
  }
  if (payload === undefined) failed();
  const parsed: unknown = JSON.parse(payload);
  return parsed;
}

export function createLave8StructuredLlmProvider(options: Lave8StructuredLlmProviderOptions): StructuredLlmProvider {
  try {
    const { apiKey, modelId, fetchImpl = globalThis.fetch, onDiagnostic } = options;
    if (typeof apiKey !== 'string' || apiKey.trim().length === 0 || /\p{Cc}/u.test(apiKey)
      || typeof modelId !== 'string' || !LAVE8_STRUCTURED_LLM_MODEL_IDS.some((allowed) => allowed === modelId)
      || typeof fetchImpl !== 'function') {
      throw new Error();
    }

    // The secret stays in the closure and is used only in Authorization.
    return Object.freeze({
      providerId: 'lave8', modelId,
      async generate(request: StructuredLlmProviderRequest): Promise<unknown> {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const controller = new AbortController();
          const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              reject(new Error('Structured LLM provider failed'));
              controller.abort();
              emitDiagnosticSafely(onDiagnostic, { scope: 'lave8', event: 'timeout' });
            }, LAVE8_STRUCTURED_LLM_TIMEOUT_MS);
          });
          const send = async (): Promise<unknown> => {
            const init: RequestInit = {
              method: 'POST',
              redirect: 'error',
              credentials: 'omit',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              signal: controller.signal,
              body: JSON.stringify({
                model: modelId, store: false, stream: false,
                reasoning: { effort: 'low' }, max_output_tokens: 4000,
                input: [
                  { role: 'system', content: [{ type: 'input_text', text: request.systemPrompt }] },
                  { role: 'user', content: [{ type: 'input_text', text: request.userPrompt }] },
                ],
                text: {
                  format: {
                    type: 'json_schema', name: 'structured_llm_job_analysis', strict: true,
                    schema: OPENAI_STRUCTURED_LLM_OUTPUT_SCHEMA,
                  },
                },
              }),
            };
            emitDiagnosticSafely(onDiagnostic, { scope: 'lave8', event: 'request_started' });
            let response: Response;
            try {
              response = await fetchImpl(LAVE8_STRUCTURED_LLM_ENDPOINT, init);
            } catch {
              if (!controller.signal.aborted) {
                emitDiagnosticSafely(onDiagnostic, { scope: 'lave8', event: 'network_failure' });
              }
              return failed();
            }
            if (controller.signal.aborted) failed();
            const status = response.status;
            if (!Number.isInteger(status)) failed();
            emitDiagnosticSafely(onDiagnostic, { scope: 'lave8', event: 'http_response', status });
            if (status < 200 || status >= 300) {
              let requestParameter: Lave8RequestParameter = 'unknown';
              let summary = summarizeLave8Error(undefined);
              try {
                const errorBody: unknown = await response.json();
                requestParameter = safeLave8RequestParameter(errorBody);
                summary = summarizeLave8Error(errorBody);
              } catch {
                // A non-JSON error body provides no approved parameter metadata.
              }
              if (controller.signal.aborted) failed();
              emitDiagnosticSafely(onDiagnostic, { scope: 'lave8', event: 'http_non_2xx', status, requestParameter, summary });
              return failed();
            }
            let body: unknown;
            try {
              body = await response.json();
            } catch {
              if (!controller.signal.aborted) {
                emitDiagnosticSafely(onDiagnostic, { scope: 'lave8', event: 'response_json_invalid' });
              }
              return failed();
            }
            if (controller.signal.aborted) failed();
            let parsed: unknown;
            try {
              parsed = parseResponse(body);
            } catch {
              emitDiagnosticSafely(onDiagnostic, {
                scope: 'lave8', event: 'response_contract_invalid', summary: summarizeLave8Response(body),
              });
              return failed();
            }
            emitDiagnosticSafely(onDiagnostic, { scope: 'lave8', event: 'response_accepted' });
            return parsed;
          };
          // Bound both fetch and body reading, even when an injected transport
          // ignores abort. There is exactly one send and no retry or fallback.
          return await Promise.race([send(), timeout]);
        } catch {
          return failed();
        } finally {
          if (timer !== undefined) clearTimeout(timer);
        }
      },
    });
  } catch {
    throw new Error('Invalid Lave8 structured LLM provider configuration');
  }
}
