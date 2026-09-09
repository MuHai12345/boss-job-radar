import {
  AMBIGUITY_CODES, RESPONSIBILITY_KINDS, STRUCTURED_LLM_OUTPUT_SCHEMA_VERSION,
  type StructuredLlmAnalysisOutput, type StructuredLlmEvidenceReference,
  type StructuredLlmInterpretation, type StructuredLlmJobInputSnapshot,
} from './structured-llm-analysis-types.js';
import { collectAllowedStructuredEvidenceCodes } from './structured-llm-input.js';

export type StructuredLlmOutputValidationReason =
  | 'unexpected_object_shape'
  | 'schema_version_mismatch'
  | 'invalid_text_type'
  | 'blank_or_invisible_text'
  | 'text_too_long'
  | 'enum_value_not_allowed'
  | 'invalid_array_shape_or_bounds'
  | 'invalid_evidence_shape'
  | 'full_jd_excerpt_not_exact'
  | 'structured_evidence_code_not_allowed'
  | 'duplicate_evidence_reference'
  | 'duplicate_responsibility_statement'
  | 'duplicate_ambiguity_question'
  | 'duplicate_interview_question'
  | 'other_validation_failure';

// Identity-based recognition never reads properties or invokes traps on unknown errors.
const validationReasons = new WeakMap<object, StructuredLlmOutputValidationReason>();

class StructuredLlmOutputValidationError extends Error {
  constructor(reason: StructuredLlmOutputValidationReason) {
    super('Invalid structured LLM analysis output');
    validationReasons.set(this, reason);
  }
}

export function getStructuredLlmOutputValidationReason(error: unknown): StructuredLlmOutputValidationReason | undefined {
  return error !== null && typeof error === 'object' ? validationReasons.get(error) : undefined;
}

function invalid(reason: StructuredLlmOutputValidationReason): never {
  throw new StructuredLlmOutputValidationError(reason);
}

/** Only JSON data properties are accepted; accessors and special prototypes are not read. */
export function structuredLlmExactObject(
  value: unknown, keys: readonly string[],
  reason: StructuredLlmOutputValidationReason = 'unexpected_object_shape',
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid(reason);
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid(reason);
  const actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length || actual.some((key) => typeof key !== 'string' || !keys.includes(key))) invalid(reason);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) invalid(reason);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string') invalid('invalid_text_type');
  if (value.length > maximum) invalid('text_too_long');
  if (value.trim().length === 0 || !/[^\s\p{Cc}\p{Cf}]/u.test(value)) invalid('blank_or_invisible_text');
  return value.trim();
}

function member<const T extends readonly string[]>(
  value: unknown, choices: T, reason: StructuredLlmOutputValidationReason = 'enum_value_not_allowed',
): T[number] {
  if (typeof value !== 'string' || !choices.includes(value)) invalid(reason);
  return value;
}

function array<T>(value: unknown, minimum: number, maximum: number, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum
    || Object.getPrototypeOf(value) !== Array.prototype
    || Reflect.ownKeys(value).length !== value.length + 1) invalid('invalid_array_shape_or_bounds');
  const result: T[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) invalid('invalid_array_shape_or_bounds');
    result.push(parse(descriptor.value));
  }
  return result;
}

function unique<T>(items: T[], key: (item: T) => string, reason: StructuredLlmOutputValidationReason): T[] {
  if (new Set(items.map(key)).size !== items.length) invalid(reason);
  return items;
}

export function parseStructuredLlmAnalysisOutput(
  value: unknown, snapshot: StructuredLlmJobInputSnapshot,
): StructuredLlmAnalysisOutput {
  try {
    const allowed = collectAllowedStructuredEvidenceCodes(snapshot);
    function reference(item: unknown): StructuredLlmEvidenceReference {
      // Inspect the discriminator without invoking an accessor.
      if (item === null || typeof item !== 'object') invalid('invalid_evidence_shape');
      const discriminator = Object.getOwnPropertyDescriptor(item, 'source');
      if (!discriminator || !('value' in discriminator)) invalid('invalid_evidence_shape');
      if (discriminator.value === 'full_jd') {
        const entry = structuredLlmExactObject(item, ['source', 'excerpt'], 'invalid_evidence_shape');
        text(entry.excerpt, 160);
        if (typeof entry.excerpt !== 'string' || !snapshot.fullJdText.includes(entry.excerpt)) invalid('full_jd_excerpt_not_exact');
        // Keep the exact quote, including any original whitespace.
        return { source: 'full_jd', excerpt: entry.excerpt };
      }
      const entry = structuredLlmExactObject(item, ['source', 'code'], 'invalid_evidence_shape');
      const source = member(entry.source, ['deterministic', 'status', 'opportunity'] as const, 'invalid_evidence_shape');
      if (typeof entry.code !== 'string' || !allowed[source].includes(entry.code)) invalid('structured_evidence_code_not_allowed');
      return { source, code: entry.code };
    }
    function references(items: unknown, minimum: number, maximum: number): StructuredLlmEvidenceReference[] {
      return unique(array(items, minimum, maximum, reference), (item) =>
        JSON.stringify(item.source === 'full_jd' ? [item.source, item.excerpt] : [item.source, item.code]), 'duplicate_evidence_reference');
    }
    function interpretation(item: unknown): StructuredLlmInterpretation {
      const entry = structuredLlmExactObject(item, ['summary', 'supports', 'concerns']);
      return { summary: text(entry.summary, 500), supports: references(entry.supports, 0, 6), concerns: references(entry.concerns, 0, 6) };
    }
    const output = structuredLlmExactObject(value, [
      'schemaVersion', 'roleSummary', 'responsibilityFindings', 'careerSwitchInterpretation',
      'growthInterpretation', 'riskInterpretation', 'ambiguities', 'interviewQuestions', 'confidence',
    ]);
    if (output.schemaVersion !== STRUCTURED_LLM_OUTPUT_SCHEMA_VERSION) invalid('schema_version_mismatch');
    return {
      schemaVersion: STRUCTURED_LLM_OUTPUT_SCHEMA_VERSION,
      roleSummary: text(output.roleSummary, 600),
      responsibilityFindings: unique(array(output.responsibilityFindings, 0, 12, (item) => {
        const entry = structuredLlmExactObject(item, ['kind', 'statement', 'evidence']);
        return { kind: member(entry.kind, RESPONSIBILITY_KINDS), statement: text(entry.statement, 240), evidence: references(entry.evidence, 1, 3) };
      }), (item) => item.statement, 'duplicate_responsibility_statement'),
      careerSwitchInterpretation: interpretation(output.careerSwitchInterpretation),
      growthInterpretation: interpretation(output.growthInterpretation),
      riskInterpretation: interpretation(output.riskInterpretation),
      ambiguities: unique(array(output.ambiguities, 0, 8, (item) => {
        const entry = structuredLlmExactObject(item, ['code', 'question', 'reason']);
        return { code: member(entry.code, AMBIGUITY_CODES), question: text(entry.question, 240), reason: text(entry.reason, 240) };
      }), (item) => item.question, 'duplicate_ambiguity_question'),
      interviewQuestions: unique(array(output.interviewQuestions, 0, 6, (item) => {
        const entry = structuredLlmExactObject(item, ['question', 'reason', 'groundedBy']);
        return { question: text(entry.question, 240), reason: text(entry.reason, 240), groundedBy: references(entry.groundedBy, 1, 4) };
      }), (item) => item.question, 'duplicate_interview_question'),
      confidence: member(output.confidence, ['high', 'medium', 'low'] as const),
    };
  } catch (error) {
    // Never expose raw output, getters/proxy errors, source text, or provider errors.
    return invalid(getStructuredLlmOutputValidationReason(error) ?? 'other_validation_failure');
  }
}

export const validateStructuredLlmAnalysisOutput = parseStructuredLlmAnalysisOutput;
