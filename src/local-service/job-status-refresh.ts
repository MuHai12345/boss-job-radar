export function refreshJobStatusSafely(refresh: () => void): void {
  try { refresh(); } catch {
    console.warn('Job status assessment refresh failed.');
  }
}
