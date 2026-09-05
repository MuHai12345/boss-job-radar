import type { IncomingMessage } from 'node:http';
import { TextDecoder } from 'node:util';

export { validateImportRequest } from '../import-request-validation.js';

export const MAX_OBSERVATION_BODY_BYTES = 1_048_576;

export type LimitedBodyResult =
  | { readonly status: 'ok'; readonly body: Buffer }
  | { readonly status: 'too_large' };

export function decodeJsonBody(body: Buffer): unknown {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  return JSON.parse(decoder.decode(body)) as unknown;
}

export function readLimitedRequestBody(
  request: IncomingMessage,
): Promise<LimitedBodyResult> {
  const contentLength = request.headers['content-length'];
  if (
    contentLength !== undefined &&
    /^\d+$/u.test(contentLength) &&
    BigInt(contentLength) > BigInt(MAX_OBSERVATION_BODY_BYTES)
  ) {
    request.resume();
    return Promise.resolve({ status: 'too_large' });
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let receivedBytes = 0;
    let tooLarge = false;

    request.on('data', (chunk: Buffer) => {
      if (tooLarge) {
        return;
      }

      receivedBytes += chunk.length;
      if (receivedBytes > MAX_OBSERVATION_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        resolve({ status: 'too_large' });
        return;
      }

      chunks.push(chunk);
    });
    request.on('end', () => {
      if (!tooLarge) {
        resolve({ status: 'ok', body: Buffer.concat(chunks, receivedBytes) });
      }
    });
    request.on('error', reject);
  });
}
