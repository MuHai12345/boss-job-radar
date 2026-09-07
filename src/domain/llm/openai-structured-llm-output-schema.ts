import {
  AMBIGUITY_CODES, RESPONSIBILITY_KINDS, STRUCTURED_LLM_OUTPUT_SCHEMA_VERSION,
} from './structured-llm-analysis-types.js';

function text(maxLength: number) {
  return { type: 'string', minLength: 1, maxLength } as const;
}

const evidence = {
  anyOf: [
    {
      type: 'object', additionalProperties: false,
      required: ['source', 'excerpt'],
      properties: {
        source: { type: 'string', enum: ['full_jd'] },
        excerpt: text(160),
      },
    },
    {
      type: 'object', additionalProperties: false,
      required: ['source', 'code'],
      properties: {
        source: { type: 'string', enum: ['deterministic', 'status', 'opportunity'] },
        // The repository validates membership in the current snapshot's code set.
        code: { type: 'string' },
      },
    },
  ],
} as const;

function references(minItems: number, maxItems: number) {
  return { type: 'array', minItems, maxItems, items: evidence } as const;
}

const interpretation = {
  type: 'object', additionalProperties: false,
  required: ['summary', 'supports', 'concerns'],
  properties: {
    summary: text(500), supports: references(0, 6), concerns: references(0, 6),
  },
} as const;

// Structural constraints only. The existing product validator remains responsible
// for visible text, UTF-16 limits, uniqueness, and source-dependent grounding.
export const OPENAI_STRUCTURED_LLM_OUTPUT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: [
    'schemaVersion', 'roleSummary', 'responsibilityFindings', 'careerSwitchInterpretation',
    'growthInterpretation', 'riskInterpretation', 'ambiguities', 'interviewQuestions', 'confidence',
  ],
  properties: {
    schemaVersion: { type: 'string', enum: [STRUCTURED_LLM_OUTPUT_SCHEMA_VERSION] },
    roleSummary: text(600),
    responsibilityFindings: {
      type: 'array', minItems: 0, maxItems: 12,
      items: {
        type: 'object', additionalProperties: false,
        required: ['kind', 'statement', 'evidence'],
        properties: {
          kind: { type: 'string', enum: [...RESPONSIBILITY_KINDS] },
          statement: text(240), evidence: references(1, 3),
        },
      },
    },
    careerSwitchInterpretation: interpretation,
    growthInterpretation: interpretation,
    riskInterpretation: interpretation,
    ambiguities: {
      type: 'array', minItems: 0, maxItems: 8,
      items: {
        type: 'object', additionalProperties: false,
        required: ['code', 'question', 'reason'],
        properties: {
          code: { type: 'string', enum: [...AMBIGUITY_CODES] },
          question: text(240), reason: text(240),
        },
      },
    },
    interviewQuestions: {
      type: 'array', minItems: 0, maxItems: 6,
      items: {
        type: 'object', additionalProperties: false,
        required: ['question', 'reason', 'groundedBy'],
        properties: {
          question: text(240), reason: text(240), groundedBy: references(1, 4),
        },
      },
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
} as const;
