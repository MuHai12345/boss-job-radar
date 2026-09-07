import type { DeterministicJobAnalysis, AnalysisEvidence } from '../analysis/deterministic-job-analysis-types.js';
import { jobOpportunitySourceStateKey } from '../opportunity/job-opportunity-assessment.js';
import { INTERVIEW_QUESTIONS, OPPORTUNITY_RISKS, type JobOpportunityAssessment } from '../opportunity/job-opportunity-assessment-types.js';
import type { JobStatusAssessment } from '../status/job-status-assessment.js';
import {
  STRUCTURED_LLM_OUTPUT_SCHEMA_VERSION, STRUCTURED_LLM_PROMPT_VERSION,
  type StructuredLlmJobInputSnapshot,
} from './structured-llm-analysis-types.js';

interface ObservationFacts {
  readonly id: number;
  readonly jobId: number;
  readonly title: string | null;
  readonly experienceText: string | null;
  readonly educationText: string | null;
  readonly locationText: string | null;
  readonly tags: readonly string[];
  readonly fullJdText: string | null;
}

function evidence(items: readonly AnalysisEvidence[]): AnalysisEvidence[] {
  return items.map(({ code, source, section, excerpt }) => ({ code, source, section, excerpt }));
}

/** Explicit projection: never spread an observation or a provider-supplied object. */
export function buildStructuredLlmJobInputSnapshot(
  jobId: number,
  latest: ObservationFacts,
  jd: ObservationFacts,
  deterministic: DeterministicJobAnalysis,
  status: JobStatusAssessment,
  opportunity: JobOpportunityAssessment,
): StructuredLlmJobInputSnapshot {
  if (!Number.isSafeInteger(jobId) || jobId <= 0
    || latest.jobId !== jobId || jd.jobId !== jobId
    || deterministic.jobId !== jobId || status.jobId !== jobId || opportunity.jobId !== jobId
    || deterministic.source.latestObservationId !== latest.id
    || deterministic.source.jdObservationId !== jd.id
    || status.latestObservationId !== latest.id
    || opportunity.source.latestObservationId !== latest.id
    || opportunity.source.jdObservationId !== jd.id
    || opportunity.source.deterministicRulesVersion !== deterministic.rulesVersion
    || opportunity.source.statusRulesVersion !== status.rulesVersion
    || opportunity.source.recruiterActivityObservationId !== status.recruiterActivityObservationId
    || opportunity.source.publishedObservationId !== status.publishedObservationId
    || opportunity.source.latestLinkCheckId !== status.latestLinkCheckId
    || opportunity.source.localObservationRecencyBand !== status.localObservation.recencyBand
    || typeof jd.fullJdText !== 'string' || jd.fullJdText.trim() === '') {
    throw new Error('Invalid structured LLM source');
  }
  return {
    jobId, latestObservationId: latest.id, jdObservationId: jd.id,
    deterministicRulesVersion: deterministic.rulesVersion,
    statusRulesVersion: status.rulesVersion, opportunityRulesVersion: opportunity.rulesVersion,
    opportunitySourceStateKey: jobOpportunitySourceStateKey(opportunity.source),
    title: latest.title, experienceText: latest.experienceText, educationText: latest.educationText,
    locationText: latest.locationText, tags: [...latest.tags], fullJdText: jd.fullJdText,
    deterministic: {
      jobId, rulesVersion: deterministic.rulesVersion,
      source: { latestObservationId: latest.id, jdObservationId: jd.id },
      jobNature: { status: deterministic.jobNature.status, evidence: evidence(deterministic.jobNature.evidence) },
      experience: {
        status: deterministic.experience.status, hardMinimumYears: deterministic.experience.hardMinimumYears,
        header: {
          kind: deterministic.experience.header.kind, minYears: deterministic.experience.header.minYears,
          maxYears: deterministic.experience.header.maxYears,
        },
        jd: {
          status: deterministic.experience.jd.status,
          hardMinimumValues: [...deterministic.experience.jd.hardMinimumValues],
          hasPreference: deterministic.experience.jd.hasPreference,
          hasNoRequirement: deterministic.experience.jd.hasNoRequirement,
        },
        contradictions: [...deterministic.experience.contradictions],
        evidence: evidence(deterministic.experience.evidence),
      },
      warnings: [...deterministic.warnings],
    },
    status: {
      jobId, rulesVersion: status.rulesVersion, latestObservationId: latest.id,
      recruiterActivityObservationId: status.recruiterActivityObservationId,
      publishedObservationId: status.publishedObservationId, latestLinkCheckId: status.latestLinkCheckId,
      recruiterActivity: {
        band: status.recruiterActivity.band, sourceObservationId: status.recruiterActivity.sourceObservationId,
        observedAt: status.recruiterActivity.observedAt,
      },
      platformFreshness: {
        band: status.platformFreshness.band, sourceObservationId: status.platformFreshness.sourceObservationId,
        observedAt: status.platformFreshness.observedAt,
      },
      localObservation: {
        firstSeenAt: status.localObservation.firstSeenAt, lastSeenAt: status.localObservation.lastSeenAt,
        recencyBand: status.localObservation.recencyBand,
      },
      link: { status: status.link.status, observedAt: status.link.observedAt, markerCode: status.link.markerCode },
      warnings: [...status.warnings], assessedAt: status.assessedAt,
    },
    opportunity: {
      jobId, rulesVersion: opportunity.rulesVersion,
      source: {
        deterministicRulesVersion: opportunity.source.deterministicRulesVersion,
        statusRulesVersion: opportunity.source.statusRulesVersion,
        latestObservationId: latest.id, jdObservationId: jd.id,
        recruiterActivityObservationId: opportunity.source.recruiterActivityObservationId,
        publishedObservationId: opportunity.source.publishedObservationId,
        latestLinkCheckId: opportunity.source.latestLinkCheckId,
        localObservationRecencyBand: opportunity.source.localObservationRecencyBand,
      },
      growthValue: {
        band: opportunity.growthValue.band, skillFamilies: [...opportunity.growthValue.skillFamilies],
        advancedFamilies: [...opportunity.growthValue.advancedFamilies], evidence: evidence(opportunity.growthValue.evidence),
      },
      careerSwitchValue: { status: opportunity.careerSwitchValue.status, reasonCodes: [...opportunity.careerSwitchValue.reasonCodes] },
      risks: opportunity.risks.map(({ code }) => {
        const entry = OPPORTUNITY_RISKS.find((risk) => risk.code === code);
        if (entry === undefined) throw new Error('Invalid structured LLM source');
        return { ...entry };
      }),
      priority: { tier: opportunity.priority.tier, reasonCodes: [...opportunity.priority.reasonCodes] },
      interviewQuestions: opportunity.interviewQuestions.map(({ code }) => {
        const entry = INTERVIEW_QUESTIONS.find((question) => question.code === code);
        if (entry === undefined) throw new Error('Invalid structured LLM source');
        return { ...entry };
      }),
      warnings: [...opportunity.warnings], assessedAt: opportunity.assessedAt,
    },
  };
}

export function structuredLlmSourceStateKey(snapshot: StructuredLlmJobInputSnapshot): string {
  return JSON.stringify([
    STRUCTURED_LLM_PROMPT_VERSION, STRUCTURED_LLM_OUTPUT_SCHEMA_VERSION,
    snapshot.jobId, snapshot.deterministicRulesVersion, snapshot.statusRulesVersion,
    snapshot.opportunityRulesVersion, snapshot.latestObservationId, snapshot.jdObservationId,
    snapshot.opportunitySourceStateKey,
  ]);
}

export function collectAllowedStructuredEvidenceCodes(snapshot: StructuredLlmJobInputSnapshot): {
  readonly deterministic: readonly string[];
  readonly status: readonly string[];
  readonly opportunity: readonly string[];
} {
  const { deterministic: d, status: s, opportunity: o } = snapshot;
  return {
    deterministic: [...new Set([
      ...d.jobNature.evidence.map((item) => item.code), ...d.experience.evidence.map((item) => item.code),
      `jobNature.status.${d.jobNature.status}`, `experience.status.${d.experience.status}`,
      ...d.experience.contradictions.map((code) => `contradiction.${code}`),
      ...d.warnings.map((code) => `warning.${code}`),
    ])].sort(),
    status: [
      `recruiterActivity.band.${s.recruiterActivity.band}`, `platformFreshness.band.${s.platformFreshness.band}`,
      `localObservation.recencyBand.${s.localObservation.recencyBand}`, `link.status.${s.link.status}`,
      ...s.warnings.map((code) => `warning.${code}`),
    ].sort(),
    opportunity: [...new Set([
      `growthValue.band.${o.growthValue.band}`, `careerSwitchValue.status.${o.careerSwitchValue.status}`,
      `priority.tier.${o.priority.tier}`,
      ...o.careerSwitchValue.reasonCodes.map((code) => `careerSwitchValue.reason.${code}`),
      ...o.risks.map(({ code }) => `risk.${code}`),
      ...o.priority.reasonCodes.map((code) => `priority.reason.${code}`),
      ...o.interviewQuestions.map(({ code }) => `interviewQuestion.${code}`),
      ...o.warnings.map((code) => `warning.${code}`),
    ])].sort(),
  };
}
