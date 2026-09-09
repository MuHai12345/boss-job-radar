import { beforeEach, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock('wxt/browser', () => ({ browser: { storage: { local: storage } } }));
import { emptySnapshot, loadSnapshot, messages, saveSnapshot } from '../entrypoints/sidepanel/snapshot';
beforeEach(() => { vi.clearAllMocks(); storage.set.mockResolvedValue(undefined); });
it('labels a persisted analysis failure as historical on every reload without making requests', async () => {
  storage.get.mockResolvedValue({ 'workspace.ui-snapshot.v1': { ...emptySnapshot(), error: 'analysis' } });
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  const state = await loadSnapshot();
  expect(state.error).toBe('historical_analysis');
  expect(messages[state.error!]).toContain('历史最近一次');
  expect(messages[state.error!]).toContain('本次打开尚未发起新的');
  expect(state.pending).toBeNull();
  await saveSnapshot(state);
  storage.get.mockResolvedValue(storage.set.mock.calls[0]![0]);
  expect((await loadSnapshot()).error).toBe('historical_analysis');
  expect(fetchSpy).not.toHaveBeenCalled();
  fetchSpy.mockRestore();
});
it('reload of pending analysis expresses uncertainty and no new attempt', async () => {
  storage.get.mockResolvedValue({ 'workspace.ui-snapshot.v1': { ...emptySnapshot(), pending: 'analyze' } });
  const state = await loadSnapshot();
  expect(state.error).toBe('historical_analysis_pending');
  expect(state.pending).toBeNull();
});
