import { afterEach, expect, it, vi } from 'vitest';
import { createLave8StructuredLlmProvider, LAVE8_STRUCTURED_LLM_TIMEOUT_MS, type Lave8StructuredLlmDiagnosticEvent } from '../src/domain/llm/lave8-structured-llm-provider';

const request = { promptVersion: 'structured-llm-job-analysis-prompt-v1', outputSchemaVersion: 'structured-llm-job-analysis-v1', systemPrompt: 'PRIVATE_PROMPT', userPrompt: 'PRIVATE_JD' } as const;
const completed = JSON.stringify({ status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: '{"value":"PRIVATE_MODEL_TEXT"}' }] }] });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function setup(response: Response | (() => Response | Promise<Response>)) {
  const events: Lave8StructuredLlmDiagnosticEvent[] = [];
  const fetchImpl = vi.fn(async () => typeof response === 'function' ? response() : response);
  const provider = createLave8StructuredLlmProvider({ apiKey: 'PRIVATE_API_KEY', modelId: 'gpt-5.6-sol', fetchImpl, onDiagnostic: event => events.push(event) });
  return { events, fetchImpl, provider };
}

it.each([
  ['empty', '', 'application/json', 'response_body_empty', 'application_json', false, 'empty'],
  ['HTML', '<html>PRIVATE_BODY</html>', 'text/html; secret=PRIVATE_HEADER', 'response_json_invalid', 'text_html', false, 'lt_1kb'],
  ['SSE', 'event: response\ndata: PRIVATE_BODY\n\n', 'text/event-stream', 'response_json_invalid', 'text_event_stream', true, 'lt_1kb'],
  ['SSE with wrong header', 'data: PRIVATE_BODY\n\n', 'application/json', 'response_json_invalid', 'application_json', true, 'lt_1kb'],
  ['truncated JSON', '{"status":"PRIVATE_BODY', 'application/json', 'response_json_invalid', 'application_json', false, 'lt_1kb'],
  ['whitespace', ' \r\n\t', 'text/plain', 'response_json_invalid', 'text_plain', false, 'lt_1kb'],
  ['valid JSON, invalid contract', '{"private":"PRIVATE_BODY"}', 'application/json', 'response_contract_invalid', 'application_json', false, 'lt_1kb'],
] as const)('separates body receipt and parsing for 200 + %s without leaking content', async (_name, body, header, terminal, contentType, sseLike, bodySize) => {
  const { events, fetchImpl, provider } = setup(new Response(body, { headers: { 'content-type': header } }));
  await expect(provider.generate(request)).rejects.toThrow('Structured LLM provider failed');
  expect(events).toContainEqual(expect.objectContaining({ event: 'response_body_read_started', contentType }));
  expect(events).toContainEqual(expect.objectContaining({ event: 'response_body_received', contentType, bodySize, sseLike }));
  expect(events.at(-1)).toMatchObject({ event: terminal });
  expect(events.some(event => event.event === 'response_accepted')).toBe(false);
  expect(events.map(event => event.event)).not.toContain('response_body_read_failed');
  if (terminal === 'response_contract_invalid') expect(events.map(event => event.event)).toContain('response_json_parsed');
  else expect(events.map(event => event.event)).not.toContain('response_json_parsed');
  expect(fetchImpl).toHaveBeenCalledOnce();
  expect(JSON.stringify(events)).not.toMatch(/PRIVATE_|Authorization|Cookie|Session/);
  for (const event of events) expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

it.each([
  ['APPLICATION/JSON; charset=utf-8', 'application_json'],
  ['text/event-stream', 'text_event_stream'],
  ['text/plain', 'text_plain'],
  ['text/html', 'text_html'],
  ['application/x-PRIVATE_HEADER', 'other'],
  [null, 'absent'],
] as const)('classifies Content-Type %s without changing existing JSON/contract acceptance', async (header, contentType) => {
  const response = new Response(new TextEncoder().encode(completed), { headers: header === null ? {} : { 'content-type': header } });
  const jsonSpy = vi.spyOn(response, 'json');
  const { events, provider, fetchImpl } = setup(response);
  await expect(provider.generate(request)).resolves.toEqual({ value: 'PRIVATE_MODEL_TEXT' });
  expect(events.map(event => event.event)).toEqual(['request_started', 'http_response', 'response_body_read_started', 'response_body_received', 'response_json_parsed', 'response_accepted']);
  expect(events[2]).toMatchObject({ contentType });
  expect(jsonSpy).not.toHaveBeenCalled();
  expect(fetchImpl).toHaveBeenCalledOnce();
  expect(JSON.stringify(events)).not.toContain('PRIVATE_');
});

it.each([[1023, 'lt_1kb'], [1024, '1_10kb'], [10 * 1024, '10_100kb'], [100 * 1024, '100kb_1mb'], [1024 * 1024, 'gte_1mb']] as const)('uses only a fixed bucket for %s received bytes', async (size, bodySize) => {
  const { events, provider } = setup(new Response('x'.repeat(size)));
  await expect(provider.generate(request)).rejects.toThrow('Structured LLM provider failed');
  expect(events).toContainEqual(expect.objectContaining({ event: 'response_body_received', bodySize }));
  expect(JSON.stringify(events)).not.toContain(String(size));
});

it('classifies a stream error after partial bytes as body read failure, never JSON syntax failure', async () => {
  let pulls = 0;
  const stream = new ReadableStream<Uint8Array>({ pull(controller) {
    if (pulls++ === 0) controller.enqueue(new TextEncoder().encode('{"PRIVATE_PARTIAL":'));
    else controller.error(new Error('PRIVATE_STREAM_ERROR'));
  } });
  const { events, provider, fetchImpl } = setup(new Response(stream, { headers: { 'content-type': 'application/json' } }));
  await expect(provider.generate(request)).rejects.toThrow('Structured LLM provider failed');
  expect(events.map(event => event.event)).toEqual(['request_started', 'http_response', 'response_body_read_started', 'response_body_read_failed']);
  expect(fetchImpl).toHaveBeenCalledOnce();
  expect(JSON.stringify(events)).not.toContain('PRIVATE_');
});

it('preserves UTF-8 BOM decoding and buckets received bytes rather than decoded character count', async () => {
  const responseText = '\uFEFF' + completed.replace('PRIVATE_MODEL_TEXT', '中'.repeat(400));
  expect(responseText.length).toBeLessThan(1024);
  const { provider, events } = setup(new Response(new TextEncoder().encode(responseText)));
  await expect(provider.generate(request)).resolves.toEqual({ value: '中'.repeat(400) });
  expect(events).toContainEqual(expect.objectContaining({ event: 'response_body_received', bodySize: '1_10kb', sseLike: false }));
  expect(JSON.stringify(events)).not.toContain('中');
});

it('treats a null body as empty and SSE-looking text inside valid JSON as ordinary JSON', async () => {
  const empty = setup(new Response(null));
  await expect(empty.provider.generate(request)).rejects.toThrow('Structured LLM provider failed');
  expect(empty.events.at(-1)).toMatchObject({ event: 'response_body_empty' });
  const json = setup(new Response(completed.replace('PRIVATE_MODEL_TEXT', 'data: PRIVATE_MODEL_TEXT')));
  await expect(json.provider.generate(request)).resolves.toEqual({ value: 'data: PRIVATE_MODEL_TEXT' });
  expect(json.events).toContainEqual(expect.objectContaining({ event: 'response_body_received', sseLike: false }));
});

it('records 3-second headers and 59-second stream failure without inventing a proxy timeout cause', async () => {
  vi.useFakeTimers();
  const { events, provider, fetchImpl } = setup(async () => {
    await new Promise(resolve => setTimeout(resolve, 3000));
    return new Response(new ReadableStream({ start(controller) {
      setTimeout(() => controller.error(new Error('PRIVATE_TRANSPORT_ERROR')), 56_000);
    } }));
  });
  const rejected = expect(provider.generate(request)).rejects.toThrow('Structured LLM provider failed');
  await vi.advanceTimersByTimeAsync(59_000);
  await rejected;
  expect(events.at(-1)).toMatchObject({ event: 'response_body_read_failed' });
  expect(Date.parse(events[1]!.timestamp!) - Date.parse(events[0]!.timestamp!)).toBe(3000);
  expect(Date.parse(events.at(-1)!.timestamp!) - Date.parse(events[0]!.timestamp!)).toBe(59_000);
  expect(events.map(event => event.event)).not.toContain('timeout');
  expect(JSON.stringify(events)).not.toMatch(/PRIVATE_|proxy/);
  expect(fetchImpl).toHaveBeenCalledOnce();
});

it('keeps the 90-second deadline over a stalled body, suppressing late body diagnostics and retries', async () => {
  vi.useFakeTimers();
  let bodyController!: ReadableStreamDefaultController<Uint8Array>;
  const { events, provider, fetchImpl } = setup(new Response(new ReadableStream<Uint8Array>({ start(controller) { bodyController = controller; } })));
  const rejected = expect(provider.generate(request)).rejects.toThrow('Structured LLM provider failed');
  await vi.advanceTimersByTimeAsync(LAVE8_STRUCTURED_LLM_TIMEOUT_MS);
  await rejected;
  expect(events.at(-1)).toMatchObject({ event: 'timeout' });
  const count = events.length;
  bodyController.enqueue(new TextEncoder().encode(completed));
  bodyController.close();
  await vi.advanceTimersByTimeAsync(1);
  expect(events).toHaveLength(count);
  expect(fetchImpl).toHaveBeenCalledOnce();
});
