import { describe, expect, it } from 'vitest';

import { analyzeDeterministicJob } from '../src/domain/analysis/deterministic-job-analysis';
import { normalizeHeaderExperience } from '../src/domain/analysis/experience-rules';
import { parseJdSections } from '../src/domain/analysis/jd-sections';
import { parseStoredDeterministicAnalysis } from '../src/domain/analysis/deterministic-job-analysis-validation';

function analyze(fullJdText: string | null, experienceText: string | null = null) {
  return analyzeDeterministicJob({
    jobId: 1, latestObservationId: 9,
    jdObservationId: fullJdText === null ? null : 8,
    title: '高级电商运营助理', tags: ['店铺运营'], experienceText, fullJdText,
  });
}

describe('deterministic nature v1', () => {
  it.each([
    ['负责天猫店铺商品上下架、标题关键词优化、活动报名，\n分析流量、转化率和 GMV。', 'genuine_ecommerce_ops'],
    ['通过电话开发客户，完成销售业绩目标，\n维护客户关系并负责招商。', 'likely_non_ecommerce_ops'],
    ['负责店铺商品维护、活动报名，\n同时承担售前客服接待和订单处理。', 'mixed_ecommerce_ops'],
    ['协助运营完成日常工作。', 'insufficient_evidence'],
    ['本岗位无需电话销售，\n主要负责天猫商品上下架、详情优化和活动报名。', 'genuine_ecommerce_ops'],
    ['岗位职责：\n负责商品维护、活动报名。\n任职要求：\n有在线客服接待经验优先。', 'genuine_ecommerce_ops'],
    ['岗位职责：\n负责商品维护、活动报名。\n负责在线客服接待。', 'mixed_ecommerce_ops'],
    ['我们有客服团队，欢迎认真负责的同事加入公司。', 'insufficient_evidence'],
    ['任职要求：\n熟悉商品维护、活动报名、电话销售、客户开发。', 'insufficient_evidence'],
    ['岗位职责：\n仓库', 'insufficient_evidence'],
    [null, 'insufficient_evidence'],
  ])('classifies %s as %s', (jd, status) => {
    expect(analyze(jd).jobNature.status).toBe(status);
  });

  it.each(['无需电话销售', '不需要电销', '不涉及销售', '无需开发客户', '不需要客服', '无需直播', '无需负责电话销售'])('respects explicit negation: %s', (negated) => {
    const result = analyze(`岗位职责：\n${negated}。\n负责商品维护、活动报名、详情优化。`);
    expect(result.jobNature.status).toBe('genuine_ecommerce_ops');
    expect(result.jobNature.evidence.filter((item) => item.code.startsWith('diversion.'))).toEqual([]);
  });

  it('parses headings and inline content while retaining original substrings', () => {
    expect(parseJdSections('介绍\n【岗位职责】\n  商品维护\n任职要求：至少1年\n我们希望\n有经验优先')).toEqual([
      { text: '介绍', section: 'unknown' },
      { text: '  商品维护', section: 'responsibilities' },
      { text: '至少1年', section: 'requirements' },
      { text: '有经验优先', section: 'requirements' },
    ]);
  });

  it('retains bounded verbatim excerpts and source IDs without mutating inputs', () => {
    const fullJdText = `岗位职责：\n${'原始描述'.repeat(50)}负责商品维护、活动报名。\n任职要求：\n工作2年以上。`;
    const result = analyze(fullJdText, '1年以内');
    expect(result.source).toEqual({ latestObservationId: 9, jdObservationId: 8 });
    expect(result.warnings).toContain('jd_from_older_observation');
    const evidence = [...result.jobNature.evidence, ...result.experience.evidence];
    expect(evidence.length).toBeGreaterThan(3);
    for (const item of evidence) {
      const original = { full_jd: fullJdText, title: '高级电商运营助理', tags: '店铺运营', header_experience: '1年以内' }[item.source];
      expect(original).toContain(item.excerpt);
      expect(item.excerpt.length).toBeLessThanOrEqual(160);
      expect(item.excerpt.length).toBeGreaterThan(0);
      expect(item.code.length).toBeGreaterThan(0);
    }
    expect(parseStoredDeterministicAnalysis(JSON.stringify(result))).toEqual(result);
  });
});

describe('experience rules v1', () => {
  it.each([
    ['经验不限', 'unlimited', null, null],
    ['1年以内', 'up_to', null, 1],
    ['1-3年', 'range', 1, 3],
    ['3-5年', 'range', 3, 5],
    ['1年以上', 'minimum', 1, null],
    ['2年以上', 'minimum', 2, null],
    [null, 'unknown', null, null],
    ['5-1年', 'unknown', null, null],
  ])('normalizes header %s', (header, kind, minYears, maxYears) => {
    expect(normalizeHeaderExperience(header)).toEqual({ kind, minYears, maxYears });
  });

  it.each([
    ['至少1年', 1], ['至少 2 年', 2], ['1年以上', 1], ['2年以上', 2],
    ['具有3年以上相关经验', 3], ['工作2年以上', 2], ['要求1年以上相关经验', 1],
    ['需要2年以上经验', 2], ['两年以上', 2], ['至少一年', 1], ['十年以上', 10],
  ])('extracts hard minimum %s', (jd, years) => {
    expect(analyze(`任职要求：\n${jd}`).experience).toMatchObject({ status: 'hard_minimum', hardMinimumYears: years });
  });

  it.each(['有经验优先', '有经验者优先', '有相关经验优先', '1年经验优先', '具有电商经验优先', '相关从业经验者优先', '有天猫/淘宝/京东经验优先', '经验加分', '两年以上经验优先'])('keeps preference soft: %s', (jd) => {
    expect(analyze(jd).experience).toMatchObject({ status: 'preference_only', hardMinimumYears: null, jd: { status: 'preference_only' } });
  });

  it.each(['经验不限', '无经验可培养', '无经验也可', '接受无经验', '接受应届生', '应届生可', '可接受应届'])('extracts no requirement: %s', (jd) => {
    expect(analyze(jd).experience).toMatchObject({ status: 'no_requirement', hardMinimumYears: null });
  });

  it.each([
    ['经验不限', '1年以上', 'header_unlimited_vs_jd_hard_minimum'],
    ['1年以内', '工作2年以上', 'header_max_below_jd_minimum'],
    ['1-3年', '至少5年', 'header_max_below_jd_minimum'],
    ['3-5年', '接受无经验', 'header_minimum_vs_jd_no_requirement'],
    ['1-3年', '1年经验优先', 'header_minimum_vs_jd_preference'],
  ])('records contradiction %s / %s', (header, jd, code) => {
    const result = analyze(jd, header).experience;
    expect(result.status).toBe('contradictory');
    expect(result.contradictions).toContain(code);
    if (jd.includes('优先')) expect(result.hardMinimumYears).toBeNull();
  });

  it('keeps distinct minimum evidence, takes maximum and flags internal contradiction', () => {
    const result = analyze('任职要求：\n至少1年\n3年以上\n接受无经验');
    expect(result.experience).toMatchObject({ status: 'contradictory', hardMinimumYears: 3 });
    expect(result.experience.jd.hardMinimumValues).toEqual([1, 3]);
    expect(result.experience.evidence.filter((e) => e.code === 'experience.jd_hard_minimum')).toHaveLength(2);
    expect(result.warnings).toContain('multiple_hard_minimum_values');
  });

  it.each([null, '负责商品维护和活动报名。'])('does not infer JD requirements from header or title: %s', (jd) => {
    const result = analyze(jd, '3-5年');
    expect(result.experience).toMatchObject({ status: 'insufficient_evidence', hardMinimumYears: null, header: { kind: 'range', minYears: 3, maxYears: 5 }, jd: { status: 'insufficient_evidence' } });
  });

  it.each(['公司成立至少十年', '岗位职责：\n负责制定至少2年以上的推广计划', '任职要求：\n不需要2年以上经验'])('avoids unrelated or negated duration: %s', (jd) => {
    expect(analyze(jd).experience.hardMinimumYears).toBeNull();
  });

  it.each(['一百年以上经验', '三十年以上经验', '123年以上经验', '至少三十年经验'])('does not partially parse unsupported year tokens: %s', (jd) => {
    expect(analyze(jd).experience.hardMinimumYears).toBeNull();
  });

  it('preserves a hard requirement next to a separate soft preference', () => {
    const result = analyze('要求至少1年运营经验且3年以上管理经验优先').experience;
    expect(result).toMatchObject({ status: 'hard_minimum', hardMinimumYears: 1, jd: { hasPreference: true, hardMinimumValues: [1] } });
  });
});

describe('stored analysis validation', () => {
  it.each(['{', '{}', 'null', '[]', '"text"'])('fails closed on %s', (json) => {
    expect(() => parseStoredDeterministicAnalysis(json)).toThrow('Invalid stored deterministic analysis');
  });

  it.each([
    (v: Record<string, unknown>) => { v.jobId = -1; },
    (v: Record<string, unknown>) => { v.rulesVersion = 'unknown-version'; },
    (v: Record<string, unknown>) => { v.source = { latestObservationId: 9 }; },
    (v: Record<string, unknown>) => { v.jobNature = { status: 'genuine_ecommerce_ops', evidence: [{}] }; },
    (v: Record<string, unknown>) => { v.experience = { status: 'hard_minimum', hardMinimumYears: '2' }; },
    (v: Record<string, unknown>) => { v.warnings = [1]; },
  ])('rejects invalid nested structure', (mutate) => {
    const value: Record<string, unknown> = { ...analyze('工作2年以上') };
    mutate(value);
    expect(() => parseStoredDeterministicAnalysis(JSON.stringify(value))).toThrow('Invalid stored deterministic analysis');
  });
});
