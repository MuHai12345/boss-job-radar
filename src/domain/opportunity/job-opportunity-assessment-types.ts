import type { AnalysisEvidence, DETERMINISTIC_RULES_VERSION } from '../analysis/deterministic-job-analysis-types.js';
import type { JOB_STATUS_RULES_VERSION, RecencyBand } from '../status/job-status-assessment.js';

export const JOB_OPPORTUNITY_RULES_VERSION = 'job-opportunity-assessment-v1';
export const SKILL_FAMILIES = ['merchandise', 'content', 'store', 'campaign', 'data', 'promotion'] as const;
export const ADVANCED_FAMILIES = ['campaign', 'data', 'promotion'] as const;
export type SkillFamily = typeof SKILL_FAMILIES[number];
export type AdvancedFamily = typeof ADVANCED_FAMILIES[number];
export type GrowthBand = 'strong' | 'moderate' | 'limited' | 'unknown';
export type CareerSwitchStatus = 'suitable' | 'worth_trying' | 'hard_mismatch' | 'unclear';
export type RiskSeverity = 'high' | 'medium' | 'info';
export type PriorityTier = 'S' | 'A' | 'B' | 'C' | 'REVIEW';

export const CAREER_REASON_CODES = [
  'genuine_ops_entry_friendly', 'genuine_ops_1_to_2_year_stretch',
  'genuine_ops_experience_needs_clarification', 'mixed_ops_entry_feasible',
  'likely_non_ecommerce_ops', 'hard_minimum_3_plus',
  'insufficient_job_nature', 'insufficient_experience_evidence',
] as const;
export type CareerReasonCode = typeof CAREER_REASON_CODES[number];

export const PRIORITY_REASON_CODES = [
  'explicitly_unavailable', 'likely_non_ecommerce_ops', 'career_switch_unclear',
  'analysis_information_gap', 'career_switch_hard_mismatch', 'mixed_role',
  'recruiter_stale', 'platform_stale', 'strong_entry_current_opportunity',
  'suitable_with_growth', 'worth_trying_with_strong_growth', 'default_priority',
] as const;
export type PriorityReasonCode = typeof PRIORITY_REASON_CODES[number];

export const OPPORTUNITY_WARNINGS = [
  'analysis.jd_from_older_observation', 'analysis.multiple_hard_minimum_values',
  'status.recruiter_activity_from_older_observation', 'status.published_from_older_observation',
  'status.local_observation_recency_unknown',
] as const;
export type OpportunityWarning = typeof OPPORTUNITY_WARNINGS[number];

// Fixed catalogs also constrain stored text: no raw payload can become a reason.
export const OPPORTUNITY_RISKS = [
  { code: 'explicitly_unavailable', severity: 'high', reason: '岗位链接明确不可用。' },
  { code: 'likely_non_ecommerce_ops', severity: 'high', reason: '已确认职责偏离目标电商运营方向。' },
  { code: 'hard_experience_3_plus', severity: 'high', reason: 'JD 明确要求至少 3 年经验。' },
  { code: 'mixed_role', severity: 'medium', reason: '运营与非目标职责混合，需要确认实际占比。' },
  { code: 'hard_experience_1_to_2', severity: 'medium', reason: 'JD 存在 1–2 年经验硬门槛。' },
  { code: 'experience_contradiction', severity: 'medium', reason: '经验条件存在矛盾，需要人工澄清。' },
  { code: 'recruiter_stale', severity: 'medium', reason: '平台记录的招聘者活跃度较低。' },
  { code: 'platform_stale', severity: 'medium', reason: '平台记录的岗位发布时间较早。' },
  { code: 'link_unknown', severity: 'info', reason: '岗位链接状态未知。' },
  { code: 'link_unchecked', severity: 'info', reason: '岗位链接尚未检查。' },
  { code: 'analysis_information_gap', severity: 'info', reason: '岗位性质或经验要求证据不足。' },
  { code: 'status_information_gap', severity: 'info', reason: '关键招聘状态信息未知。' },
  { code: 'older_source_evidence', severity: 'info', reason: '部分招聘状态证据来自较早观察。' },
] as const;
export type OpportunityRisk = typeof OPPORTUNITY_RISKS[number];

export const INTERVIEW_QUESTIONS = [
  { code: 'role_scope', question: '入职后前 3 个月主要负责哪些电商运营模块？哪些工作会由我独立负责？', reason: '确认实际职责与独立负责范围。' },
  { code: 'non_ops_share', question: '销售、客服、直播、仓储/发货、订单录入等非目标职责的实际工作占比分别是多少？', reason: '澄清非目标职责占比。' },
  { code: 'experience_requirement', question: 'JD 中的经验年限是硬门槛还是优先条件？是否接受转行候选人？', reason: '澄清经验条件与转行可行性。' },
  { code: 'growth_scope', question: '实际工作会接触商品、标题/关键词、主图详情、活动、数据、推广中的哪些模块？', reason: '补充运营成长范围信息。' },
  { code: 'data_ownership', question: '日常是否查看流量、点击率、转化率、客单价、GMV？是否参与数据复盘？', reason: '确认数据接触与复盘职责。' },
  { code: 'hiring_status', question: '岗位目前是否仍在招聘？HC 和预计到岗时间是什么？', reason: '确认当前招聘进度。' },
  { code: 'onboarding_growth', question: '新人带教方式是什么？通常多久可以独立负责店铺或具体运营模块？', reason: '了解带教安排与独立负责的条件。' },
] as const;
export type InterviewQuestion = typeof INTERVIEW_QUESTIONS[number];

export interface JobOpportunityAssessment {
  readonly jobId: number;
  readonly rulesVersion: typeof JOB_OPPORTUNITY_RULES_VERSION;
  readonly source: {
    readonly deterministicRulesVersion: typeof DETERMINISTIC_RULES_VERSION;
    readonly statusRulesVersion: typeof JOB_STATUS_RULES_VERSION;
    readonly latestObservationId: number;
    readonly jdObservationId: number | null;
    readonly recruiterActivityObservationId: number | null;
    readonly publishedObservationId: number | null;
    readonly latestLinkCheckId: number | null;
    readonly localObservationRecencyBand: RecencyBand;
  };
  readonly growthValue: {
    readonly band: GrowthBand;
    readonly skillFamilies: readonly SkillFamily[];
    readonly advancedFamilies: readonly AdvancedFamily[];
    readonly evidence: readonly AnalysisEvidence[];
  };
  readonly careerSwitchValue: {
    readonly status: CareerSwitchStatus;
    readonly reasonCodes: readonly CareerReasonCode[];
  };
  readonly risks: readonly OpportunityRisk[];
  readonly priority: {
    readonly tier: PriorityTier;
    readonly reasonCodes: readonly PriorityReasonCode[];
  };
  readonly interviewQuestions: readonly InterviewQuestion[];
  readonly warnings: readonly OpportunityWarning[];
  readonly assessedAt: string;
}
