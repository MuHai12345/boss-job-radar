import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

const TOKEN_BYTES = 32;

export function createBridgeSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

export function hasExpectedLoopbackHost(request: IncomingMessage): boolean {
  const localPort = request.socket.localPort;
  if (localPort === undefined) {
    return false;
  }

  return request.headers.host === `127.0.0.1:${localPort}`;
}

export function hasAllowedExtensionOrigin(
  origin: string | undefined,
): boolean {
  if (origin === undefined) {
    return true;
  }

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  return (
    parsed.protocol === 'chrome-extension:' &&
    parsed.hostname.length > 0 &&
    parsed.username === '' &&
    parsed.password === '' &&
    parsed.port === '' &&
    (parsed.pathname === '' || parsed.pathname === '/') &&
    parsed.search === '' &&
    parsed.hash === ''
  );
}

export function hasValidBridgeToken(
  receivedToken: string | undefined,
  expectedToken: string,
): boolean {
  if (receivedToken === undefined) {
    return false;
  }

  const expected = Buffer.from(expectedToken, 'utf8');
  const received = Buffer.from(receivedToken, 'utf8');
  if (received.length !== expected.length) {
    timingSafeEqual(expected, expected);
    return false;
  }

  return timingSafeEqual(received, expected);
}

export function hasSupportedJsonContentType(
  contentType: string | undefined,
): boolean {
  if (contentType === undefined) {
    return false;
  }

  return /^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?$/iu.test(
    contentType.trim(),
  );
}

export function hasSupportedContentEncoding(
  contentEncoding: string | undefined,
): boolean {
  return (
    contentEncoding === undefined ||
    contentEncoding.trim().toLowerCase() === 'identity'
  );
}
