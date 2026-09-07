import { describe, expect, it } from 'vitest';

import {
  DETERMINISTIC_RULES_VERSION,
  type AnalysisEvidence,
  type DeterministicJobAnalysis,
  type ExperienceStatus,
  type JobNatureStatus,
} from '../src/domain/analysis/deterministic-job-analysis-types';
import {
  assessJobOpportunity,
  jobOpportunitySourceStateKey,
} from '../src/domain/opportunity/job-opportunity-assessment';
import { parseStoredJobOpportunityAssessment } from '../src/domain/opportunity/job-opportunity-assessment-validation';
import {
  JOB_STATUS_RULES_VERSION,
  type JobStatusAssessment,
  type PlatformFreshnessBand,
  type RecruiterActivityBand,
  type RecencyBand,
} from '../src/domain/status/job-status-assessment';

const ASSESSED_AT = '2026-09-07T12:00:00.000Z';

function duty(family: string): AnalysisEvidence {
  return {
    code: `ecommerce_core.${family}`,
    source: 'full_jd',
    section: 'responsibilities',
    excerpt: `负责 ${family}`,
  };
}

function analysis(overrides: {
  nature?: JobNatureStatus;
  experience?: ExperienceStatus;
  years?: number | null;
  families?: string[];
  warnings?: DeterministicJobAnalysis['warnings'];
} = {}): DeterministicJobAnalysis {
  const experience = overrides.experience ?? 'no_requirement';
  const years = overrides.years ?? null;
  const evidence = (overrides.families ?? ['merchandise', 'store', 'campaign', 'data']).map(duty);
  return {
    jobId: 1,
    rulesVersion: DETERMINISTIC_RULES_VERSION,
    source: { latestObservationId: 10, jdObservationId: 9 },
    jobNature: {
      status: overrides.nature ?? 'genuine_ecommerce_ops',
      evidence,
    },
    experience: {
      status: experience,
      hardMinimumYears: years,
      header: { kind: 'unknown', minYears: null, maxYears: null },
      jd: {
        status: experience,
        hardMinimumValues: years === null ? [] : [years],
        hasPreference: experience === 'preference_only',
        hasNoRequirement: experience === 'no_requirement',
      },
      contradictions: experience === 'contradictory'
        ? ['header_unlimited_vs_jd_hard_minimum']
        : [],
      evidence: [],
    },
    warnings: overrides.warnings ?? [],
  };
}

function status(overrides: {
  recruiter?: RecruiterActivityBand;
  platform?: PlatformFreshnessBand;
  local?: RecencyBand;
  link?: JobStatusAssessment['link']['status'];
  warnings?: string[];
} = {}): JobStatusAssessment {
  const link = overrides.link ?? 'available';
  return {
    jobId: 1,
    rulesVersion: JOB_STATUS_RULES_VERSION,
    latestObservationId: 10,
    recruiterActivityObservationId: 10,
    publishedObservationId: 10,
    latestLinkCheckId: link === 'unchecked' ? null : 5,
    recruiterActivity: {
      rawText: '刚刚活跃',
      band: overrides.recruiter ?? 'online_or_just_now',
      sourceObservationId: 10,
      observedAt: '2026-09-07T10:00:00.000Z',
    },
    platformFreshness: {
      rawText: '今日发布',
      band: overrides.platform ?? 'today',
      sourceObservationId: 10,
      observedAt: '2026-09-07T10:00:00.000Z',
    },
    localObservation: {
      firstSeenAt: '2026-09-07T09:00:00.000Z',
      lastSeenAt: '2026-09-07T10:00:00.000Z',
      recencyBand: overrides.local ?? 'today',
    },
    link: {
      status: link,
      observedAt: link === 'unchecked' ? null : '2026-09-07T10:00:00.000Z',
      markerCode: link === 'explicitly_unavailable' ? 'job_closed' : null,
    },
    warnings: overrides.warnings ?? [],
    assessedAt: ASSESSED_AT,
  };
}

describe('deterministic job opportunity assessment v1', () => {
  it('returns S for a strong, entry-friendly, available and current opportunity', () => {
    const result = assessJobOpportunity(analysis(), status(), ASSESSED_AT);

    expect(result.growthValue).toMatchObject({
      band: 'strong',
      skillFamilies: ['merchandise', 'store', 'campaign', 'data'],
      advancedFamilies: ['campaign', 'data'],
    });
    expect(result.careerSwitchValue).toEqual({
      status: 'suitable',
      reasonCodes: ['genuine_ops_entry_friendly'],
    });
    expect(result.priority).toEqual({
      tier: 'S',
      reasonCodes: ['strong_entry_current_opportunity'],
    });
    expect(result.risks).toEqual([]);
  });

  it('keeps a one-to-two-year hard minimum worth trying and never upgrades it to hard mismatch', () => {
    const result = assessJobOpportunity(
      analysis({ experience: 'hard_minimum', years: 2 }),
      status(),
      ASSESSED_AT,
    );

    expect(result.careerSwitchValue.status).toBe('worth_trying');
    expect(result.careerSwitchValue.reasonCodes).toEqual(['genuine_ops_1_to_2_year_stretch']);
    expect(result.risks.map((risk) => risk.code)).toContain('hard_experience_1_to_2');
    expect(result.priority.tier).toBe('A');
  });

  it('treats three-plus years as a hard mismatch but does not silently turn it into C', () => {
    const result = assessJobOpportunity(
      analysis({ experience: 'hard_minimum', years: 3 }),
      status(),
      ASSESSED_AT,
    );

    expect(result.careerSwitchValue).toEqual({
      status: 'hard_mismatch',
      reasonCodes: ['hard_minimum_3_plus'],
    });
    expect(result.risks.map((risk) => risk.code)).toContain('hard_experience_3_plus');
    expect(result.priority.tier).toBe('B');
  });

  it('forces likely non-ecommerce operations to limited growth, hard mismatch and C', () => {
    const result = assessJobOpportunity(
      analysis({ nature: 'likely_non_ecommerce_ops', families: [] }),
      status(),
      ASSESSED_AT,
    );

    expect(result.growthValue.band).toBe('limited');
    expect(result.careerSwitchValue.status).toBe('hard_mismatch');
    expect(result.priority.tier).toBe('C');
    expect(result.risks[0]?.code).toBe('likely_non_ecommerce_ops');
    expect(result.interviewQuestions.map((item) => item.code)).toContain('non_ops_share');
  });

  it('keeps mixed roles visible as worth trying but B priority', () => {
    const result = assessJobOpportunity(
      analysis({ nature: 'mixed_ecommerce_ops' }),
      status(),
      ASSESSED_AT,
    );

    expect(result.careerSwitchValue.status).toBe('worth_trying');
    expect(result.priority.tier).toBe('B');
    expect(result.risks.map((risk) => risk.code)).toContain('mixed_role');
  });

  it('uses REVIEW for insufficient analysis instead of guessing low quality', () => {
    const result = assessJobOpportunity(
      analysis({ nature: 'insufficient_evidence', experience: 'insufficient_evidence', families: [] }),
      status(),
      ASSESSED_AT,
    );

    expect(result.growthValue.band).toBe('unknown');
    expect(result.careerSwitchValue.status).toBe('unclear');
    expect(result.priority.tier).toBe('REVIEW');
    expect(result.risks.map((risk) => risk.code)).toContain('analysis_information_gap');
  });

  it('makes an explicitly unavailable link C while unknown and unchecked links remain non-C', () => {
    expect(assessJobOpportunity(analysis(), status({ link: 'explicitly_unavailable' }), ASSESSED_AT).priority.tier).toBe('C');

    const unknown = assessJobOpportunity(analysis(), status({ link: 'unknown' }), ASSESSED_AT);
    expect(unknown.priority.tier).not.toBe('C');
    expect(unknown.risks.map((risk) => risk.code)).toContain('link_unknown');

    const unchecked = assessJobOpportunity(analysis(), status({ link: 'unchecked' }), ASSESSED_AT);
    expect(unchecked.priority.tier).not.toBe('C');
    expect(unchecked.risks.map((risk) => risk.code)).toContain('link_unchecked');
  });

  it('downgrades stale recruiter or platform evidence to B', () => {
    expect(assessJobOpportunity(analysis(), status({ recruiter: 'within_half_year' }), ASSESSED_AT).priority.tier).toBe('B');
    expect(assessJobOpportunity(analysis(), status({ platform: 'older' }), ASSESSED_AT).priority.tier).toBe('B');
  });

  it('propagates only approved upstream warnings with stable prefixes', () => {
    const result = assessJobOpportunity(
      analysis({ warnings: ['jd_from_older_observation'] }),
      status({ warnings: ['recruiter_activity_from_older_observation', 'unrecognized_future_warning'] }),
      ASSESSED_AT,
    );

    expect(result.warnings).toEqual([
      'analysis.jd_from_older_observation',
      'status.recruiter_activity_from_older_observation',
    ]);
    expect(result.risks.map((risk) => risk.code)).toContain('older_source_evidence');
  });

  it('keeps interview questions in stable order, unique, and capped at six', () => {
    const result = assessJobOpportunity(
      analysis({ nature: 'mixed_ecommerce_ops', experience: 'contradictory', years: 2, families: ['merchandise', 'store'] }),
      status({ recruiter: 'within_half_year', link: 'unknown' }),
      ASSESSED_AT,
    );

    expect(result.interviewQuestions.map((item) => item.code)).toEqual([
      'role_scope',
      'non_ops_share',
      'experience_requirement',
      'growth_scope',
      'data_ownership',
      'hiring_status',
    ]);
  });

  it('changes source state only when semantic source state changes, including local recency bucket', () => {
    const first = assessJobOpportunity(analysis(), status({ local: 'today' }), ASSESSED_AT);
    const same = assessJobOpportunity(analysis(), status({ local: 'today' }), '2026-09-07T13:00:00.000Z');
    const later = assessJobOpportunity(analysis(), status({ local: 'within_3_days' }), '2026-09-09T13:00:00.000Z');

    expect(jobOpportunitySourceStateKey(first.source)).toBe(jobOpportunitySourceStateKey(same.source));
    expect(jobOpportunitySourceStateKey(first.source)).not.toBe(jobOpportunitySourceStateKey(later.source));
  });

  it('fails closed when stored assessment JSON is structurally invalid', () => {
    const result = assessJobOpportunity(analysis(), status(), ASSESSED_AT);
    const valid = JSON.stringify(result);
    expect(parseStoredJobOpportunityAssessment(valid)).toEqual(result);

    const tampered = JSON.stringify({
      ...result,
      priority: { ...result.priority, tier: 'INVALID' },
    });
    expect(() => parseStoredJobOpportunityAssessment(tampered)).toThrow(
      'Invalid stored job opportunity assessment',
    );
  });
});
