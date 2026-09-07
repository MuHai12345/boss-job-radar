import type { DeterministicJobAnalysis } from '../analysis/deterministic-job-analysis-types.js';
import type { JobStatusAssessment } from '../status/job-status-assessment.js';
import { isIsoTimestamp } from '../../shared/job-link-check-types.js';
import {
  ADVANCED_FAMILIES, CAREER_REASON_CODES, INTERVIEW_QUESTIONS,
  JOB_OPPORTUNITY_RULES_VERSION, OPPORTUNITY_RISKS, OPPORTUNITY_WARNINGS, SKILL_FAMILIES,
  type CareerReasonCode, type JobOpportunityAssessment, type PriorityReasonCode,
} from './job-opportunity-assessment-types.js';

/** Explicit tuple order is part of v1 persistence; assessment timestamps are not semantic keys. */
export function jobOpportunitySourceStateKey(source: JobOpportunityAssessment['source']): string {
  return JSON.stringify([
    source.deterministicRulesVersion, source.statusRulesVersion,
    source.latestObservationId, source.jdObservationId, source.recruiterActivityObservationId,
    source.publishedObservationId, source.latestLinkCheckId, source.localObservationRecencyBand,
  ]);
}

function careerSwitchValue(analysis: DeterministicJobAnalysis): JobOpportunityAssessment['careerSwitchValue'] {
  const nature = analysis.jobNature.status;
  const { status, hardMinimumYears: years } = analysis.experience;
  const reasons: CareerReasonCode[] = [];
  if (nature === 'likely_non_ecommerce_ops') reasons.push('likely_non_ecommerce_ops');
  if (years !== null && years >= 3) reasons.push('hard_minimum_3_plus');
  if (reasons.length) return { status: 'hard_mismatch', reasonCodes: reasons };
  const entryFriendly = status === 'no_requirement' || status === 'preference_only';
  const stretch = status === 'hard_minimum' && (years === 1 || years === 2);
  if (nature === 'genuine_ecommerce_ops') {
    if (entryFriendly) return { status: 'suitable', reasonCodes: ['genuine_ops_entry_friendly'] };
    if (stretch) return { status: 'worth_trying', reasonCodes: ['genuine_ops_1_to_2_year_stretch'] };
    if (status === 'contradictory') return { status: 'worth_trying', reasonCodes: ['genuine_ops_experience_needs_clarification'] };
  }
  if (nature === 'mixed_ecommerce_ops' && (entryFriendly || stretch || status === 'contradictory')) {
    return { status: 'worth_trying', reasonCodes: ['mixed_ops_entry_feasible'] };
  }
  if (nature === 'insufficient_evidence') reasons.push('insufficient_job_nature');
  if (status === 'insufficient_evidence' || (status === 'hard_minimum' && !stretch)) reasons.push('insufficient_experience_evidence');
  return { status: 'unclear', reasonCodes: CAREER_REASON_CODES.filter((code) => reasons.includes(code)) };
}

export function assessJobOpportunity(
  analysis: DeterministicJobAnalysis,
  status: JobStatusAssessment,
  assessedAt: string,
): JobOpportunityAssessment {
  if (!isIsoTimestamp(assessedAt) || analysis.jobId !== status.jobId
    || analysis.source.latestObservationId !== status.latestObservationId) {
    throw new Error('Invalid job opportunity source');
  }
  const nature = analysis.jobNature.status;
  const experience = analysis.experience.status;
  const years = analysis.experience.hardMinimumYears;
  // Only upstream-confirmed positive JD responsibility evidence contributes.
  const evidence = analysis.jobNature.evidence.filter((item) => item.source === 'full_jd'
    && item.section !== 'requirements'
    && SKILL_FAMILIES.some((family) => item.code === `ecommerce_core.${family}`));
  const skillFamilies = SKILL_FAMILIES.filter((family) => evidence.some((item) => item.code === `ecommerce_core.${family}`));
  const advancedFamilies = ADVANCED_FAMILIES.filter((family) => skillFamilies.includes(family));
  const growthValue: JobOpportunityAssessment['growthValue'] = {
    band: skillFamilies.length >= 4 && advancedFamilies.length > 0 ? 'strong'
      : skillFamilies.length >= 2 ? 'moderate' : nature === 'likely_non_ecommerce_ops' ? 'limited' : 'unknown',
    skillFamilies, advancedFamilies, evidence,
  };
  const career = careerSwitchValue(analysis);
  const analysisGap = nature === 'insufficient_evidence' || experience === 'insufficient_evidence';
  const recruiterStale = status.recruiterActivity.band === 'within_half_year' || status.recruiterActivity.band === 'older';
  const platformStale = status.platformFreshness.band === 'older';
  const riskConditions: Record<typeof OPPORTUNITY_RISKS[number]['code'], boolean> = {
    explicitly_unavailable: status.link.status === 'explicitly_unavailable',
    likely_non_ecommerce_ops: nature === 'likely_non_ecommerce_ops',
    hard_experience_3_plus: years !== null && years >= 3,
    mixed_role: nature === 'mixed_ecommerce_ops',
    hard_experience_1_to_2: years === 1 || years === 2,
    experience_contradiction: experience === 'contradictory',
    recruiter_stale: recruiterStale,
    platform_stale: platformStale,
    link_unknown: status.link.status === 'unknown',
    link_unchecked: status.link.status === 'unchecked',
    analysis_information_gap: analysisGap,
    status_information_gap: status.recruiterActivity.band === 'unknown'
      || status.platformFreshness.band === 'unknown' || status.localObservation.recencyBand === 'unknown',
    older_source_evidence: status.warnings.includes('recruiter_activity_from_older_observation')
      || status.warnings.includes('published_from_older_observation'),
  };
  const risks = OPPORTUNITY_RISKS.filter((risk) => riskConditions[risk.code]).map((risk) => ({ ...risk }));
  const highRisk = risks.some((risk) => risk.severity === 'high');
  const mediumRisk = risks.some((risk) => risk.severity === 'medium');
  let priority: JobOpportunityAssessment['priority'];
  if (riskConditions.explicitly_unavailable || riskConditions.likely_non_ecommerce_ops) {
    const reasonCodes: PriorityReasonCode[] = [];
    if (riskConditions.explicitly_unavailable) reasonCodes.push('explicitly_unavailable');
    if (riskConditions.likely_non_ecommerce_ops) reasonCodes.push('likely_non_ecommerce_ops');
    priority = { tier: 'C', reasonCodes };
  } else if (career.status === 'unclear' || analysisGap) {
    const reasonCodes: PriorityReasonCode[] = [];
    if (career.status === 'unclear') reasonCodes.push('career_switch_unclear');
    if (analysisGap) reasonCodes.push('analysis_information_gap');
    priority = { tier: 'REVIEW', reasonCodes };
  } else if (career.status === 'hard_mismatch' || nature === 'mixed_ecommerce_ops' || recruiterStale || platformStale) {
    const reasonCodes: PriorityReasonCode[] = [];
    if (career.status === 'hard_mismatch') reasonCodes.push('career_switch_hard_mismatch');
    if (nature === 'mixed_ecommerce_ops') reasonCodes.push('mixed_role');
    if (recruiterStale) reasonCodes.push('recruiter_stale');
    if (platformStale) reasonCodes.push('platform_stale');
    priority = { tier: 'B', reasonCodes };
  } else if (career.status === 'suitable' && growthValue.band === 'strong' && status.link.status === 'available'
    && ['online_or_just_now', 'today', 'within_3_days', 'within_week'].includes(status.recruiterActivity.band)
    && status.platformFreshness.band !== 'unknown' && !platformStale && !highRisk && !mediumRisk) {
    priority = { tier: 'S', reasonCodes: ['strong_entry_current_opportunity'] };
  } else if (career.status === 'suitable' && (growthValue.band === 'moderate' || growthValue.band === 'strong') && !highRisk) {
    priority = { tier: 'A', reasonCodes: ['suitable_with_growth'] };
  } else if (career.status === 'worth_trying' && growthValue.band === 'strong' && !highRisk) {
    priority = { tier: 'A', reasonCodes: ['worth_trying_with_strong_growth'] };
  } else {
    priority = { tier: 'B', reasonCodes: ['default_priority'] };
  }
  const feasible = career.status === 'suitable' || career.status === 'worth_trying';
  const questionConditions: Record<typeof INTERVIEW_QUESTIONS[number]['code'], boolean> = {
    role_scope: feasible && (nature === 'genuine_ecommerce_ops' || nature === 'mixed_ecommerce_ops'),
    non_ops_share: nature === 'mixed_ecommerce_ops' || nature === 'likely_non_ecommerce_ops',
    experience_requirement: experience === 'hard_minimum' || experience === 'contradictory',
    growth_scope: growthValue.band !== 'strong',
    data_ownership: !skillFamilies.includes('data'),
    hiring_status: recruiterStale || platformStale || riskConditions.link_unknown || riskConditions.link_unchecked,
    onboarding_growth: feasible,
  };
  const upstreamWarnings = new Set([
    ...analysis.warnings.map((warning) => `analysis.${warning}`),
    ...status.warnings.map((warning) => `status.${warning}`),
  ]);
  return {
    jobId: analysis.jobId, rulesVersion: JOB_OPPORTUNITY_RULES_VERSION,
    source: {
      deterministicRulesVersion: analysis.rulesVersion, statusRulesVersion: status.rulesVersion,
      latestObservationId: analysis.source.latestObservationId, jdObservationId: analysis.source.jdObservationId,
      recruiterActivityObservationId: status.recruiterActivityObservationId,
      publishedObservationId: status.publishedObservationId, latestLinkCheckId: status.latestLinkCheckId,
      localObservationRecencyBand: status.localObservation.recencyBand,
    },
    growthValue, careerSwitchValue: career, risks, priority,
    interviewQuestions: INTERVIEW_QUESTIONS.filter((item) => questionConditions[item.code]).slice(0, 6).map((item) => ({ ...item })),
    warnings: OPPORTUNITY_WARNINGS.filter((warning) => upstreamWarnings.has(warning)),
    assessedAt,
  };
}
