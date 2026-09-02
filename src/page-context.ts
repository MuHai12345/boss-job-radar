import {
  isBossHostname,
  isSupportedHttpProtocol,
} from './shared/boss-url-policy';

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

  if (!isSupportedHttpProtocol(parsedUrl.protocol)) {
    return {
      kind: 'non_boss',
      reason: 'unsupported_protocol',
      protocol: parsedUrl.protocol,
    };
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  return isBossHostname(hostname)
    ? { kind: 'boss', reason: 'zhipin_hostname', hostname }
    : { kind: 'non_boss', reason: 'different_hostname', hostname };
}
