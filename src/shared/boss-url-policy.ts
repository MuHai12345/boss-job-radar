const supportedHttpProtocols = new Set(['http:', 'https:']);

export function isBossHostname(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase();
  return (
    normalizedHostname === 'zhipin.com' ||
    normalizedHostname.endsWith('.zhipin.com')
  );
}

export function isSupportedHttpProtocol(protocol: string): boolean {
  return supportedHttpProtocols.has(protocol.toLowerCase());
}

export function isAllowedBossUrl(url: URL): boolean {
  return (
    isSupportedHttpProtocol(url.protocol) && isBossHostname(url.hostname)
  );
}

/** The verified parser's canonical detail identity; never retains query/hash. */
export function canonicalBossJobUrl(input: string, baseUrl?: string): string | null {
  try {
    const url = new URL(input, baseUrl);
    if (!isAllowedBossUrl(url) || url.username !== '' || url.password !== ''
      || !/^\/job_detail\/[^/]+\.html$/.test(url.pathname)) return null;
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}
