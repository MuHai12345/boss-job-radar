export function refreshSalaryDecodingSafely(refresh: () => void): void {
  try { refresh(); } catch {
    console.warn('Salary decoding refresh failed.');
  }
}
