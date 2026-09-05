import type { AnalysisEvidence, DeterministicAnalysisInput, DeterministicJobAnalysis } from './deterministic-job-analysis-types.js';
import { excerptAt, isNegated, type JdLine } from './jd-sections.js';

// These definitions and aggregation thresholds belong to deterministic-job-analysis-v1.
export const JOB_NATURE_RULES = [
  { kind: 'ecommerce_core', family: 'merchandise', phrases: ['商品上下架', '商品上架', '商品下架', '商品维护', 'SKU', 'SPU'] },
  { kind: 'ecommerce_core', family: 'content', phrases: ['标题关键词优化', '标题优化', '关键词优化', '搜索词', '主图', '详情页', '详情优化'] },
  { kind: 'ecommerce_core', family: 'store', phrases: ['店铺后台', '店铺运营', '店铺日常运营', '天猫运营', '淘宝运营', '京东运营', '平台运营'] },
  { kind: 'ecommerce_core', family: 'campaign', phrases: ['活动报名', '平台活动', '店铺活动', '大促'] },
  { kind: 'ecommerce_core', family: 'data', phrases: ['数据分析', '竞品分析', '流量', '点击率', '转化率', '客单价', 'GMV'] },
  { kind: 'ecommerce_core', family: 'promotion', phrases: ['推广计划', '店铺推广', '直通车', '万相台', '引力魔方', '京准通'] },
  { kind: 'diversion', family: 'sales', phrases: ['电话销售', '电销', '销售指标', '销售业绩', '开发客户', '客户开发', '陌生客户', '招商', '商务拓展'] },
  { kind: 'diversion', family: 'support', phrases: ['售前客服', '售后客服', '在线客服', '客服接待', '接待咨询'] },
  { kind: 'diversion', family: 'live', phrases: ['主播', '助播', '直播中控'] },
  { kind: 'diversion', family: 'fulfillment', phrases: ['仓库', '仓储', '打包', '拣货', '发货', '配货'] },
  { kind: 'diversion', family: 'order_entry', phrases: ['订单录入', '单据录入'] },
] as const;

export function analyzeJobNature(
  input: DeterministicAnalysisInput,
  lines: readonly JdLine[],
): DeterministicJobAnalysis['jobNature'] {
  const evidence: AnalysisEvidence[] = [];
  const coreFamilies = new Set<string>();
  const diversionFamilies = new Set<string>();
  const diversionPhrases = new Set<string>();
  const sources = [
    ...lines.map((line) => ({ ...line, source: 'full_jd' as const })),
    { text: input.title ?? '', section: 'unknown' as const, source: 'title' as const },
    ...input.tags.map((text) => ({ text, section: 'unknown' as const, source: 'tags' as const })),
  ];
  for (const item of sources) {
    // Requirements and latest-page labels remain contextual evidence, never duties.
    const isDuty = item.source === 'full_jd' && (
      item.section === 'responsibilities' || (item.section === 'unknown'
        && /负责|承担|通过|完成|维护|分析|协助|执行|进行|主要|日常/.test(item.text))
    );
    for (const rule of JOB_NATURE_RULES) {
      // Longest-first non-overlapping matches prevent one phrase counting twice.
      const matcher = new RegExp([...rule.phrases].sort((a, b) => b.length - a.length).join('|'), 'gi');
      for (const match of item.text.matchAll(matcher)) {
        const negated = isNegated(item.text, match.index);
        evidence.push({
          code: `${negated ? 'negated' : isDuty ? rule.kind : 'context'}.${rule.family}`,
          source: item.source, section: item.section,
          excerpt: excerptAt(item.text, match.index),
        });
        if (!isDuty || negated) continue;
        if (rule.kind === 'ecommerce_core') coreFamilies.add(rule.family);
        else {
          diversionFamilies.add(rule.family);
          diversionPhrases.add(match[0].toLowerCase());
        }
      }
    }
  }
  let status: DeterministicJobAnalysis['jobNature']['status'] = 'insufficient_evidence';
  if (input.jdObservationId !== null && (input.fullJdText?.trim().length ?? 0) >= 16) {
    if (coreFamilies.size >= 2) {
      status = diversionFamilies.size > 0 ? 'mixed_ecommerce_ops' : 'genuine_ecommerce_ops';
    } else if (coreFamilies.size === 0 && (
      diversionFamilies.size >= 2 || diversionPhrases.size >= 2
    )) {
      status = 'likely_non_ecommerce_ops';
    }
  }
  return { status, evidence };
}
