const RESPONSE_STATUSES = ['completed', 'failed', 'incomplete', 'queued', 'in_progress', 'cancelled', 'other'] as const;
const OUTPUT_ITEM_KINDS = ['reasoning', 'message', 'function_call', 'web_search_call', 'file_search_call', 'computer_call', 'other'] as const;
const CONTENT_KINDS = ['output_text', 'refusal', 'other'] as const;
const REQUEST_PARAMETERS = [
  'model', 'background', 'store', 'stream', 'reasoning', 'reasoning.effort',
  'max_output_tokens', 'input', 'text', 'text.format', 'text.format.type',
  'text.format.name', 'text.format.strict', 'text.format.schema', 'unknown',
] as const;

export type Lave8RequestParameter = typeof REQUEST_PARAMETERS[number];

export interface Lave8ErrorSummary {
  readonly bodyStructure: 'json_object_absent' | 'error_object_absent' | 'error_object_present';
  readonly errorType: 'invalid_request' | 'authentication' | 'rate_limit' | 'server' | 'other' | 'absent';
  readonly errorCode: 'invalid_api_key' | 'model_not_found' | 'unsupported_parameter'
    | 'rate_limit' | 'insufficient_quota' | 'context_length' | 'other' | 'absent';
}

export interface Lave8ResponseStructuralSummary {
  readonly responseStatus: typeof RESPONSE_STATUSES[number];
  readonly outputItemKinds: readonly (typeof OUTPUT_ITEM_KINDS[number])[];
  readonly assistantMessageCount: number;
  readonly assistantContentKinds: readonly (typeof CONTENT_KINDS[number])[];
  readonly outputTextCount: number;
}

export type Lave8StructuredLlmDiagnosticEvent = { readonly scope: 'lave8' } & (
  | { readonly event: 'request_started' | 'timeout' | 'network_failure' | 'response_json_invalid' | 'response_accepted' }
  | { readonly event: 'http_response'; readonly status: number }
  | { readonly event: 'http_non_2xx'; readonly status: number; readonly requestParameter: Lave8RequestParameter; readonly summary: Lave8ErrorSummary }
  | { readonly event: 'response_contract_invalid'; readonly summary: Lave8ResponseStructuralSummary }
);

export function emitDiagnosticSafely(
  callback: ((event: Lave8StructuredLlmDiagnosticEvent) => void) | undefined,
  event: Lave8StructuredLlmDiagnosticEvent,
): void {
  try { callback?.(event); } catch {
    // Diagnostics must never change the provider result or trigger another call.
  }
}

/** Inspect only named own data properties, never external accessors. */
function field(value: unknown, key: string): unknown {
  try {
    if (value === null || typeof value !== 'object') return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function member<const T extends readonly string[]>(value: unknown, choices: T, fallback: T[number]): T[number] {
  // Return the local constant, never an external string or a coerced value.
  return choices.find((choice) => choice === value) ?? fallback;
}

export function safeLave8RequestParameter(body: unknown): Lave8RequestParameter {
  return member(field(field(body, 'error'), 'param'), REQUEST_PARAMETERS, 'unknown');
}

function isPlainObject(value: unknown): boolean {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype: unknown = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function errorType(value: unknown): Lave8ErrorSummary['errorType'] {
  switch (value) {
    case undefined: case null: return 'absent';
    case 'invalid_request_error': case 'invalid_request': return 'invalid_request';
    case 'authentication_error': case 'authentication': return 'authentication';
    case 'rate_limit_error': case 'rate_limit': return 'rate_limit';
    case 'server_error': case 'server': return 'server';
    default: return 'other';
  }
}

function errorCode(value: unknown): Lave8ErrorSummary['errorCode'] {
  switch (value) {
    case undefined: case null: return 'absent';
    case 'invalid_api_key': return 'invalid_api_key';
    case 'model_not_found': return 'model_not_found';
    case 'unsupported_parameter': return 'unsupported_parameter';
    case 'rate_limit_exceeded': case 'rate_limit': return 'rate_limit';
    case 'insufficient_quota': return 'insufficient_quota';
    case 'context_length_exceeded': case 'context_length': return 'context_length';
    default: return 'other';
  }
}

/** Fixed local categories only; never read error.message or serialize external data. */
export function summarizeLave8Error(body: unknown): Lave8ErrorSummary {
  const bodyPresent = isPlainObject(body);
  const error = bodyPresent ? field(body, 'error') : undefined;
  const errorPresent = isPlainObject(error);
  return {
    bodyStructure: !bodyPresent ? 'json_object_absent'
      : errorPresent ? 'error_object_present' : 'error_object_absent',
    errorType: errorType(errorPresent ? field(error, 'type') : undefined),
    errorCode: errorCode(errorPresent ? field(error, 'code') : undefined),
  };
}

// Cap traversal and all counts at 100. Kind arrays contain unique local enums.
const SUMMARY_LIMIT = 100;
function boundedItems(value: unknown): unknown[] {
  try {
    if (!Array.isArray(value)) return [];
    const length = field(value, 'length');
    if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0) return [];
    const result: unknown[] = [];
    for (let index = 0; index < Math.min(length, SUMMARY_LIMIT); index += 1) {
      result.push(field(value, String(index)));
    }
    return result;
  } catch {
    return [];
  }
}

export function summarizeLave8Response(value: unknown): Lave8ResponseStructuralSummary {
  const outputItemKinds = new Set<typeof OUTPUT_ITEM_KINDS[number]>();
  const assistantContentKinds = new Set<typeof CONTENT_KINDS[number]>();
  let assistantMessageCount = 0;
  let outputTextCount = 0;
  for (const item of boundedItems(field(value, 'output'))) {
    const kind = member(field(item, 'type'), OUTPUT_ITEM_KINDS, 'other');
    outputItemKinds.add(kind);
    if (kind !== 'message' || field(item, 'role') !== 'assistant') continue;
    assistantMessageCount = Math.min(assistantMessageCount + 1, SUMMARY_LIMIT);
    for (const content of boundedItems(field(item, 'content'))) {
      const contentKind = member(field(content, 'type'), CONTENT_KINDS, 'other');
      assistantContentKinds.add(contentKind);
      if (contentKind === 'output_text') outputTextCount = Math.min(outputTextCount + 1, SUMMARY_LIMIT);
    }
  }
  return {
    responseStatus: member(field(value, 'status'), RESPONSE_STATUSES, 'other'),
    outputItemKinds: [...outputItemKinds],
    assistantMessageCount,
    assistantContentKinds: [...assistantContentKinds],
    outputTextCount,
  };
}
