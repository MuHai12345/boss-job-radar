import { describe, expect, it, vi } from 'vitest';

import {
  createEmptySalaryCharacterMapping,
  decodeSalaryWithMapping,
  learnSalaryCharacterMapping,
} from '../src/domain/salary/salary-character-mapping';

const puaA = '\uE101';
const puaB = '\uE102';
const puaC = '\u{F0103}';
const puaD = '\u{100104}';

describe('salary character mapping', () => {
  it.each([false, true])('validates the entire structure before reporting a conflict (existing=%s)', (existing) => {
    const state = existing
      ? learnSalaryCharacterMapping(createEmptySalaryCharacterMapping(), `${puaA}K`, '6K').state
      : createEmptySalaryCharacterMapping();
    const result = learnSalaryCharacterMapping(state, `${puaA}-${puaA}K`, '8-9M');
    expect(result).toMatchObject({ status: 'rejected', reason: 'non_pua_mismatch', state });
    expect(state.status).toBe('active');
  });
  it('returns plain text unchanged when no PUA character exists', () => {
    expect(
      decodeSalaryWithMapping('6-9K', createEmptySalaryCharacterMapping()),
    ).toEqual({
      rawText: '6-9K',
      decodedText: '6-9K',
      status: 'plain_text',
      unresolvedCharacters: [],
    });
  });

  it('learns aligned synthetic PUA-to-digit evidence and decodes it', () => {
    const initial = createEmptySalaryCharacterMapping();
    const learned = learnSalaryCharacterMapping(initial, `${puaA}-${puaB}K`, '6-9K');

    expect(learned.status).toBe('learned');
    expect(learned.state).toEqual({
      status: 'active',
      characters: { [puaA]: '6', [puaB]: '9' },
    });
    expect(initial).toEqual({ status: 'active', characters: {} });
    expect(decodeSalaryWithMapping(`${puaA}-${puaB}K`, learned.state)).toEqual({
      rawText: `${puaA}-${puaB}K`,
      decodedText: '6-9K',
      status: 'verified_mapping',
      unresolvedCharacters: [],
    });
  });

  it('does not emit a partially decoded salary when mapping is incomplete', () => {
    const learned = learnSalaryCharacterMapping(
      createEmptySalaryCharacterMapping(),
      `${puaA}K`,
      '6K',
    );

    expect(decodeSalaryWithMapping(`${puaA}-${puaB}K`, learned.state)).toEqual({
      rawText: `${puaA}-${puaB}K`,
      decodedText: null,
      status: 'incomplete_mapping',
      unresolvedCharacters: [puaB],
    });
  });

  it('marks conflicting evidence and blocks every later decode', () => {
    const first = learnSalaryCharacterMapping(
      createEmptySalaryCharacterMapping(),
      `${puaA}K`,
      '6K',
    );
    const conflict = learnSalaryCharacterMapping(first.state, `${puaA}K`, '8K');

    expect(conflict.status).toBe('mapping_conflict');
    expect(conflict.state.status).toBe('conflicted');
    expect(decodeSalaryWithMapping(`${puaA}K`, conflict.state)).toMatchObject({
      decodedText: null,
      status: 'mapping_conflict',
    });
    expect(decodeSalaryWithMapping('6-9K', conflict.state)).toMatchObject({
      decodedText: null,
      status: 'mapping_conflict',
    });
  });

  it.each([
    [`${puaA}-K`, '6+K', 'non_pua_mismatch'],
    [`${puaA}-${puaB}K`, '6-10K', 'unaligned_structure'],
    [`${puaA}K`, '六K', 'pua_not_aligned_to_digit'],
    [`${puaA}-${puaB}K·${puaC}${puaD}薪`, '6-9K+13薪', 'non_pua_mismatch'],
  ] as const)('rejects unverifiable evidence %s / %s', (raw, verified, reason) => {
    const result = learnSalaryCharacterMapping(
      createEmptySalaryCharacterMapping(),
      raw,
      verified,
    );

    expect(result).toMatchObject({ status: 'rejected', reason });
    expect(result.state).toEqual({ status: 'active', characters: {} });
  });

  it('learns multiple BMP and supplementary PUA characters with exact punctuation alignment', () => {
    const raw = `${puaA}-${puaB}K·${puaC}${puaD}薪`;
    const result = learnSalaryCharacterMapping(
      createEmptySalaryCharacterMapping(),
      raw,
      '6-9K·13薪',
    );

    expect(result.status).toBe('learned');
    expect(result.state).toEqual({
      status: 'active',
      characters: {
        [puaA]: '6',
        [puaB]: '9',
        [puaC]: '1',
        [puaD]: '3',
      },
    });
    expect(decodeSalaryWithMapping(raw, result.state).decodedText).toBe(
      '6-9K·13薪',
    );
  });

  it('reports empty input as invalid without mutating mapping state', () => {
    const state = createEmptySalaryCharacterMapping();
    const before = JSON.stringify(state);

    expect(decodeSalaryWithMapping('', state)).toEqual({
      rawText: '',
      decodedText: null,
      status: 'invalid_input',
      unresolvedCharacters: [],
    });
    expect(learnSalaryCharacterMapping(state, '', '')).toMatchObject({
      status: 'rejected',
      reason: 'invalid_input',
    });
    expect(JSON.stringify(state)).toBe(before);
  });

  it('learns and decodes without browser state, DOM, storage, or network access', () => {
    const forbiddenAccess = new Proxy(
      {},
      {
        get: () => {
          throw new Error('browser state must not be accessed');
        },
      },
    );
    const fetchSpy = vi.fn(() => {
      throw new Error('network must not be accessed');
    });
    vi.stubGlobal('document', forbiddenAccess);
    vi.stubGlobal('localStorage', forbiddenAccess);
    vi.stubGlobal('sessionStorage', forbiddenAccess);
    vi.stubGlobal('indexedDB', forbiddenAccess);
    vi.stubGlobal('caches', forbiddenAccess);
    vi.stubGlobal('fetch', fetchSpy);

    try {
      const learned = learnSalaryCharacterMapping(
        createEmptySalaryCharacterMapping(),
        `${puaA}-${puaB}K`,
        '6-9K',
      );

      expect(decodeSalaryWithMapping(`${puaA}-${puaB}K`, learned.state)).toMatchObject({
        decodedText: '6-9K',
        status: 'verified_mapping',
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
