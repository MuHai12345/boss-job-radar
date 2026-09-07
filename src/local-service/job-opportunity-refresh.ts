export function refreshJobOpportunitySafely(refresh: () => void): void {
  try { refresh(); } catch {
    console.warn('Job opportunity assessment refresh failed.');
  }
}
