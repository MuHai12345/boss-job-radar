import type { AnalysisEvidence, DeterministicJobAnalysis, ExperienceContradiction, ExperienceStatus, JdExperience, NormalizedHeaderExperience } from './deterministic-job-analysis-types.js';
import { excerptAt, isNegated, type JdLine } from './jd-sections.js';

const YEAR = '(?:[1-9]\\d?|[一二两三四五六七八九十])';
const CHINESE_YEARS: Readonly<Record<string, number>> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const UNKNOWN_HEADER: NormalizedHeaderExperience = { kind: 'unknown', minYears: null, maxYears: null };

export function normalizeHeaderExperience(text: string | null): NormalizedHeaderExperience {
  const value = text?.trim() ?? '';
  if (value === '经验不限') return { kind: 'unlimited', minYears: null, maxYears: null };
  const range = /^(\d{1,2})\s*[-–~至]\s*(\d{1,2})年$/.exec(value);
  if (range && Number(range[1]) <= Number(range[2])) {
    return { kind: 'range', minYears: Number(range[1]), maxYears: Number(range[2]) };
  }
  const bound = /^(\d{1,2})年(以内|以下|以上)$/.exec(value);
  if (bound) {
    const years = Number(bound[1]);
    return bound[2] === '以上'
      ? { kind: 'minimum', minYears: years, maxYears: null }
      : { kind: 'up_to', minYears: null, maxYears: years };
  }
  return { ...UNKNOWN_HEADER };
}

export function jdExperienceStatus(jd: Pick<JdExperience, 'hardMinimumValues' | 'hasPreference' | 'hasNoRequirement'>): ExperienceStatus {
  if (jd.hardMinimumValues.length) return jd.hasNoRequirement ? 'contradictory' : 'hard_minimum';
  if (jd.hasPreference) return 'preference_only';
  if (jd.hasNoRequirement) return 'no_requirement';
  return 'insufficient_evidence';
}

export function experienceContradictions(header: NormalizedHeaderExperience, jd: JdExperience): ExperienceContradiction[] {
  const result: ExperienceContradiction[] = [];
  const minimum = jd.hardMinimumValues.length ? Math.max(...jd.hardMinimumValues) : null;
  if (minimum !== null) {
    if (header.kind === 'unlimited') result.push('header_unlimited_vs_jd_hard_minimum');
    if (header.maxYears !== null && header.maxYears < minimum) result.push('header_max_below_jd_minimum');
    if (jd.hasNoRequirement) result.push('jd_no_requirement_vs_hard_minimum');
  }
  if (header.minYears !== null && header.minYears > 0) {
    if (jd.hasNoRequirement) result.push('header_minimum_vs_jd_no_requirement');
    if (jd.status === 'preference_only') result.push('header_minimum_vs_jd_preference');
  }
  return result;
}

export function analyzeExperience(headerText: string | null, lines: readonly JdLine[]): DeterministicJobAnalysis['experience'] {
  const header = normalizeHeaderExperience(headerText);
  const evidence: AnalysisEvidence[] = [];
  if (headerText?.trim()) evidence.push({ code: `experience.header_${header.kind}`, source: 'header_experience', section: 'unknown', excerpt: excerptAt(headerText) });
  const values = new Set<number>();
  let hasPreference = false;
  let hasNoRequirement = false;
  for (const line of lines) {
    for (const text of line.text.split(/[，,。；;！？!?]|并且|而且|同时|但是|且|但/)) {
      const addEvidence = (code: string, index: number) => evidence.push({ code, source: 'full_jd', section: line.section, excerpt: excerptAt(text, index) });
      const preference = /(?:有|具有)?[^，,。；;\n]{0,20}经验(?:者)?\s*(?:优先|加分)/.exec(text);
      if (preference && !isNegated(text, preference.index)) {
        hasPreference = true;
        addEvidence('experience.jd_preference', preference.index);
      }
      const noRequirement = /经验不限|无经验可培养|无经验也可|接受无经验|接受应届生|应届生可|可接受应届/.exec(text);
      if (noRequirement && !isNegated(text, noRequirement.index)) {
        hasNoRequirement = true;
        addEvidence('experience.jd_no_requirement', noRequirement.index);
      }
      // A duty duration or company history is not a candidate experience threshold.
      if (line.section === 'responsibilities' || /公司成立|成立|历史|计划|合同|保修/.test(text)) continue;
      const matcher = new RegExp(`至少\\s*(${YEAR})\\s*年|(?<![\\d一二两三四五六七八九十百千万零〇])(${YEAR})\\s*年以上`, 'g');
      for (const match of text.matchAll(matcher)) {
        if (preference || isNegated(text, match.index)) continue;
        const token = match[1] ?? match[2]!;
        const years = CHINESE_YEARS[token] ?? Number(token);
        values.add(years);
        addEvidence('experience.jd_hard_minimum', match.index);
      }
    }
  }
  const jdFacts = { hardMinimumValues: [...values].sort((a, b) => a - b), hasPreference, hasNoRequirement };
  const jd: JdExperience = { ...jdFacts, status: jdExperienceStatus(jdFacts) };
  const contradictions = experienceContradictions(header, jd);
  return {
    status: contradictions.length ? 'contradictory' : jd.status,
    hardMinimumYears: values.size ? Math.max(...values) : null,
    header, jd, contradictions, evidence,
  };
}
