export type PageKind = 'boss' | 'non_boss' | 'unknown';

export type PageClassificationReason =
  | 'zhipin_hostname'
  | 'different_hostname'
  | 'missing_url'
  | 'invalid_url'
  | 'unsupported_protocol';

export interface PageClassification {
  kind: PageKind;
  reason: PageClassificationReason;
  hostname?: string;
  protocol?: string;
}

const SUPPORTED_PROTOCOLS = new Set(['http:', 'https:']);

export function classifyPageUrl(
  input: string | null | undefined,
): PageClassification {
  if (typeof input !== 'string' || input.trim() === '') {
    return { kind: 'unknown', reason: 'missing_url' };
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(input);
  } catch {
    return { kind: 'unknown', reason: 'invalid_url' };
  }

  if (!SUPPORTED_PROTOCOLS.has(parsedUrl.protocol)) {
    return {
      kind: 'non_boss',
      reason: 'unsupported_protocol',
      protocol: parsedUrl.protocol,
    };
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const isBossHostname =
    hostname === 'zhipin.com' || hostname.endsWith('.zhipin.com');

  return isBossHostname
    ? { kind: 'boss', reason: 'zhipin_hostname', hostname }
    : { kind: 'non_boss', reason: 'different_hostname', hostname };
}
