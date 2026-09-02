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
