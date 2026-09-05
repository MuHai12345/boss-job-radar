export type SalaryCharacterMappingStatus = 'active' | 'conflicted';

export interface SalaryCharacterMappingState {
  status: SalaryCharacterMappingStatus;
  characters: Readonly<Record<string, string>>;
}

export type SalaryMappingEvidenceRejectionReason =
  | 'invalid_input'
  | 'no_private_use_character'
  | 'unaligned_structure'
  | 'non_pua_mismatch'
  | 'pua_not_aligned_to_digit';

export type SalaryMappingLearningResult =
  | {
      status: 'learned';
      state: SalaryCharacterMappingState;
      learnedCharacters: string[];
    }
  | {
      status: 'rejected';
      state: SalaryCharacterMappingState;
      reason: SalaryMappingEvidenceRejectionReason;
    }
  | {
      status: 'mapping_conflict' | 'state_conflicted';
      state: SalaryCharacterMappingState;
    };

export type SalaryDecodeStatus =
  | 'plain_text'
  | 'verified_mapping'
  | 'incomplete_mapping'
  | 'mapping_conflict'
  | 'invalid_input';

export interface SalaryDecodeResult {
  rawText: string;
  decodedText: string | null;
  status: SalaryDecodeStatus;
  unresolvedCharacters: string[];
}

export function createEmptySalaryCharacterMapping(): SalaryCharacterMappingState {
  return { status: 'active', characters: {} };
}

function isPrivateUseCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0);
  return (
    codePoint !== undefined &&
    ((codePoint >= 0xe000 && codePoint <= 0xf8ff) ||
      (codePoint >= 0xf0000 && codePoint <= 0xffffd) ||
      (codePoint >= 0x100000 && codePoint <= 0x10fffd))
  );
}

function rejected(
  state: SalaryCharacterMappingState,
  reason: SalaryMappingEvidenceRejectionReason,
): SalaryMappingLearningResult {
  return { status: 'rejected', state, reason };
}

export function learnSalaryCharacterMapping(
  currentState: SalaryCharacterMappingState,
  rawListSalary: string,
  verifiedDetailSalary: string,
): SalaryMappingLearningResult {
  if (currentState.status === 'conflicted') {
    return { status: 'state_conflicted', state: currentState };
  }
  if (rawListSalary.length === 0 || verifiedDetailSalary.length === 0) {
    return rejected(currentState, 'invalid_input');
  }

  const rawCharacters = Array.from(rawListSalary);
  const verifiedCharacters = Array.from(verifiedDetailSalary);
  if (rawCharacters.length !== verifiedCharacters.length) {
    return rejected(currentState, 'unaligned_structure');
  }

  const evidence: Record<string, string> = {};
  let hasConflict = false;
  for (let index = 0; index < rawCharacters.length; index += 1) {
    const rawCharacter = rawCharacters[index] as string;
    const verifiedCharacter = verifiedCharacters[index] as string;
    if (!isPrivateUseCharacter(rawCharacter)) {
      if (rawCharacter !== verifiedCharacter) {
        return rejected(currentState, 'non_pua_mismatch');
      }
      continue;
    }
    if (!/^[0-9]$/.test(verifiedCharacter)) {
      return rejected(currentState, 'pua_not_aligned_to_digit');
    }
    if (
      (evidence[rawCharacter] !== undefined &&
        evidence[rawCharacter] !== verifiedCharacter) ||
      (currentState.characters[rawCharacter] !== undefined &&
        currentState.characters[rawCharacter] !== verifiedCharacter)
    ) {
      // Finish structural validation before allowing evidence to poison a run.
      hasConflict = true;
    }
    evidence[rawCharacter] = verifiedCharacter;
  }

  const learnedCharacters = Object.keys(evidence);
  if (learnedCharacters.length === 0) {
    return rejected(currentState, 'no_private_use_character');
  }
  if (hasConflict) {
    return {
      status: 'mapping_conflict',
      state: { status: 'conflicted', characters: { ...currentState.characters } },
    };
  }
  return {
    status: 'learned',
    state: {
      status: 'active',
      characters: { ...currentState.characters, ...evidence },
    },
    learnedCharacters,
  };
}

export function decodeSalaryWithMapping(
  rawSalary: string,
  mappingState: SalaryCharacterMappingState,
): SalaryDecodeResult {
  if (rawSalary.length === 0) {
    return {
      rawText: rawSalary,
      decodedText: null,
      status: 'invalid_input',
      unresolvedCharacters: [],
    };
  }
  if (mappingState.status === 'conflicted') {
    return {
      rawText: rawSalary,
      decodedText: null,
      status: 'mapping_conflict',
      unresolvedCharacters: [],
    };
  }

  const rawCharacters = Array.from(rawSalary);
  const privateUseCharacters = rawCharacters.filter(isPrivateUseCharacter);
  if (privateUseCharacters.length === 0) {
    return {
      rawText: rawSalary,
      decodedText: rawSalary,
      status: 'plain_text',
      unresolvedCharacters: [],
    };
  }

  const unresolvedCharacters = Array.from(
    new Set(
      privateUseCharacters.filter(
        (character) => mappingState.characters[character] === undefined,
      ),
    ),
  );
  if (unresolvedCharacters.length > 0) {
    return {
      rawText: rawSalary,
      decodedText: null,
      status: 'incomplete_mapping',
      unresolvedCharacters,
    };
  }

  return {
    rawText: rawSalary,
    decodedText: rawCharacters
      .map((character) => mappingState.characters[character] ?? character)
      .join(''),
    status: 'verified_mapping',
    unresolvedCharacters: [],
  };
}
