export function refreshAnalysisSafely(refresh: () => void): void {
  try {
    refresh();
  } catch {
    // Intentionally exclude error objects, source facts, paths and stack traces.
    console.warn('Deterministic analysis refresh failed.');
  }
}
