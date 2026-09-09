import { describe, expect, it } from 'vitest';

import {
  DETERMINISTIC_RULES_VERSION,
  type AnalysisEvidence,
  type DeterministicJobAnalysis,
} from '../src/domain/analysis/deterministic-job-analysis-types';
import {
  getStructuredLlmOutputValidationReason,
  parseStructuredLlmAnalysisOutput,
  type StructuredLlmOutputValidationReason,
} from '../src/domain/llm/structured-llm-analysis-validation';
import {
  STRUCTURED_LLM_OUTPUT_SCHEMA_VERSION,
  type StructuredLlmAnalysisOutput,
} from '../src/domain/llm/structured-llm-analysis-types';
import { buildStructuredLlmJobInputSnapshot } from '../src/domain/llm/structured-llm-input';
import { assessJobOpportunity } from '../src/domain/opportunity/job-opportunity-assessment';
import { JOB_STATUS_RULES_VERSION, type JobStatusAssessment } from '../src/domain/status/job-status-assessment';

const AT = '2026-09-09T12:00:00.000Z';
const JD = [
  '岗位职责：',
  '负责商品上下架与商品维护',
  '负责店铺日常运营',
  '负责活动报名与大促执行',
  '负责数据分析与转化率复盘',
  '岗位要求：接受无经验和转行候选人',
].join('\n');

function evidence(family: string, excerpt: string): AnalysisEvidence {
  return {
    code: `ecommerce_core.${family}`,
    source: 'full_jd',
    section: 'responsibilities',
    excerpt,
  };
}

function deterministic(): DeterministicJobAnalysis {
  const items = [
    evidence('merchandise', '负责商品上下架与商品维护'),
    evidence('store', '负责店铺日常运营'),
    evidence('campaign', '负责活动报名与大促执行'),
    evidence('data', '负责数据分析与转化率复盘'),
  ];
  return {
    jobId: 1,
    rulesVersion: DETERMINISTIC_RULES_VERSION,
    source: { latestObservationId: 1, jdObservationId: 1 },
    jobNature: { status: 'genuine_ecommerce_ops', evidence: items },
    experience: {
      status: 'no_requirement',
      hardMinimumYears: null,
      header: { kind: 'unlimited', minYears: null, maxYears: null },
      jd: {
        status: 'no_requirement',
        hardMinimumValues: [],
        hasPreference: false,
        hasNoRequirement: true,
      },
      contradictions: [],
      evidence: [],
    },
    warnings: [],
  };
}

function status(): JobStatusAssessment {
  return {
    jobId: 1,
    rulesVersion: JOB_STATUS_RULES_VERSION,
    latestObservationId: 1,
    recruiterActivityObservationId: 1,
    publishedObservationId: 1,
    latestLinkCheckId: null,
    recruiterActivity: {
      rawText: '刚刚活跃', band: 'online_or_just_now', sourceObservationId: 1, observedAt: AT,
    },
    platformFreshness: {
      rawText: '今日发布', band: 'today', sourceObservationId: 1, observedAt: AT,
    },
    localObservation: { firstSeenAt: AT, lastSeenAt: AT, recencyBand: 'today' },
    link: { status: 'available', observedAt: AT, markerCode: null },
    warnings: [],
    assessedAt: AT,
  };
}

function snapshot() {
  const analysis = deterministic();
  const currentStatus = status();
  const opportunity = assessJobOpportunity(analysis, currentStatus, AT);
  const observation = {
    id: 1,
    jobId: 1,
    title: '电商运营助理',
    experienceText: '经验不限',
    educationText: '本科',
    locationText: '上海',
    tags: ['电商运营'],
    fullJdText: JD,
    companyName: 'PRIVATE_COMPANY_SENTINEL',
    jobUrl: 'PRIVATE_URL_SENTINEL',
    sourcePageUrl: 'PRIVATE_SOURCE_URL_SENTINEL',
    rawText: 'PRIVATE_RAW_SENTINEL',
  };
  return buildStructuredLlmJobInputSnapshot(
    1,
    observation,
    observation,
    analysis,
    currentStatus,
    opportunity,
  );
}

function validOutput(): StructuredLlmAnalysisOutput {
  return {
    schemaVersion: STRUCTURED_LLM_OUTPUT_SCHEMA_VERSION,
    roleSummary: '岗位核心是商品、店铺、活动和数据运营。',
    responsibilityFindings: [{
      kind: 'core_ops',
      statement: '包含商品维护职责。',
      evidence: [{ source: 'full_jd', excerpt: '负责商品上下架与商品维护' }],
    }],
    careerSwitchInterpretation: {
      summary: '上游确定性结论显示该岗位适合作为转行入口。',
      supports: [{ source: 'deterministic', code: 'jobNature.status.genuine_ecommerce_ops' }],
      concerns: [],
    },
    growthInterpretation: {
      summary: '职责覆盖多个运营能力族。',
      supports: [{ source: 'opportunity', code: 'growthValue.band.strong' }],
      concerns: [],
    },
    riskInterpretation: {
      summary: '当前未见高风险项。',
      supports: [{ source: 'status', code: 'link.status.available' }],
      concerns: [],
    },
    ambiguities: [],
    interviewQuestions: [],
    confidence: 'high',
  };
}

function reasonOf(value: unknown): StructuredLlmOutputValidationReason {
  try {
    parseStructuredLlmAnalysisOutput(value, snapshot());
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Invalid structured LLM analysis output');
    const reason = getStructuredLlmOutputValidationReason(error);
    expect(reason).toBeDefined();
    return reason!;
  }
  throw new Error('Expected validation failure');
}

describe('structured LLM fixed validation diagnostics', () => {
  it('preserves acceptance of a fully valid grounded output', () => {
    expect(parseStructuredLlmAnalysisOutput(validOutput(), snapshot())).toEqual(validOutput());
  });

  it('classifies fixed structural, text, enum, and array failures', () => {
    expect(reasonOf({ ...validOutput(), extra: true })).toBe('unexpected_object_shape');
    expect(reasonOf({ ...validOutput(), schemaVersion: 'wrong' })).toBe('schema_version_mismatch');
    expect(reasonOf({ ...validOutput(), roleSummary: 7 })).toBe('invalid_text_type');
    expect(reasonOf({ ...validOutput(), roleSummary: '   ' })).toBe('blank_or_invisible_text');
    expect(reasonOf({ ...validOutput(), roleSummary: 'x'.repeat(601) })).toBe('text_too_long');
    expect(reasonOf({ ...validOutput(), confidence: 'certain' })).toBe('enum_value_not_allowed');
    expect(reasonOf({ ...validOutput(), responsibilityFindings: null })).toBe('invalid_array_shape_or_bounds');
  });

  it('classifies fixed evidence-grounding failures without exposing dynamic evidence', () => {
    const output = validOutput();
    expect(reasonOf({
      ...output,
      responsibilityFindings: [{
        ...output.responsibilityFindings[0],
        evidence: [{ source: 'full_jd', code: 'PRIVATE_WRONG_SHAPE' }],
      }],
    })).toBe('invalid_evidence_shape');

    expect(reasonOf({
      ...output,
      responsibilityFindings: [{
        ...output.responsibilityFindings[0],
        evidence: [{ source: 'full_jd', excerpt: 'PRIVATE_PARAPHRASED_EXCERPT' }],
      }],
    })).toBe('full_jd_excerpt_not_exact');

    expect(reasonOf({
      ...output,
      riskInterpretation: {
        ...output.riskInterpretation,
        concerns: [{ source: 'opportunity', code: 'PRIVATE_INVENTED_CODE' }],
      },
    })).toBe('structured_evidence_code_not_allowed');

    expect(reasonOf({
      ...output,
      growthInterpretation: {
        ...output.growthInterpretation,
        supports: [
          { source: 'opportunity', code: 'growthValue.band.strong' },
          { source: 'opportunity', code: 'growthValue.band.strong' },
        ],
      },
    })).toBe('duplicate_evidence_reference');
  });

  it('classifies section-level duplicate failures', () => {
    const output = validOutput();
    expect(reasonOf({
      ...output,
      responsibilityFindings: [
        output.responsibilityFindings[0],
        {
          kind: 'core_ops',
          statement: output.responsibilityFindings[0]!.statement,
          evidence: [{ source: 'full_jd', excerpt: '负责店铺日常运营' }],
        },
      ],
    })).toBe('duplicate_responsibility_statement');

    expect(reasonOf({
      ...output,
      ambiguities: [
        { code: 'other', question: 'PRIVATE_DUPLICATE_QUESTION', reason: '原因一' },
        { code: 'other', question: 'PRIVATE_DUPLICATE_QUESTION', reason: '原因二' },
      ],
    })).toBe('duplicate_ambiguity_question');

    expect(reasonOf({
      ...output,
      interviewQuestions: [
        {
          question: 'PRIVATE_DUPLICATE_INTERVIEW',
          reason: '原因一',
          groundedBy: [{ source: 'full_jd', excerpt: '负责店铺日常运营' }],
        },
        {
          question: 'PRIVATE_DUPLICATE_INTERVIEW',
          reason: '原因二',
          groundedBy: [{ source: 'full_jd', excerpt: '负责活动报名与大促执行' }],
        },
      ],
    })).toBe('duplicate_interview_question');
  });

  it('maps an unknown validator-side throw to the fixed fallback without reflecting the private error', () => {
    const hostile = new Proxy({}, {
      getPrototypeOf() {
        throw new Error('PRIVATE_PROXY_FAILURE');
      },
    });

    try {
      parseStructuredLlmAnalysisOutput(hostile, snapshot());
      throw new Error('Expected validation failure');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Invalid structured LLM analysis output');
      expect(getStructuredLlmOutputValidationReason(error)).toBe('other_validation_failure');
      expect(String(error)).not.toContain('PRIVATE_PROXY_FAILURE');
    }
  });
});
