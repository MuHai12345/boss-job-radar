import type { JdSection } from './deterministic-job-analysis-types.js';

export interface JdLine {
  readonly text: string;
  readonly section: JdSection;
}

const HEADINGS = [
  { section: 'responsibilities', names: ['岗位职责', '工作职责', '职位职责', '工作内容', '岗位描述', '职位描述'] },
  { section: 'requirements', names: ['任职要求', '岗位要求', '职位要求', '任职资格', '任职条件', '我们希望', '岗位需求'] },
] as const;

export function parseJdSections(text: string): JdLine[] {
  let section: JdSection = 'unknown';
  const result: JdLine[] = [];
  for (const line of text.split(/\r\n|\n|\r/)) {
    // Only standalone headings or headings followed by explicit punctuation.
    const heading = HEADINGS.flatMap((group) => group.names.map((name) => ({
      section: group.section,
      match: new RegExp(`^\\s*(?:[一二三四五六七八九十\\d]+[、.．)）]\\s*)?[【\\[]?${name}(?:[】\\]]\\s*[:：]?\\s*|\\s*[:：]\\s*|\\s*$)`).exec(line),
    }))).find((candidate) => candidate.match !== null);
    if (heading?.match) {
      section = heading.section;
      const remainder = line.slice(heading.match[0].length);
      if (remainder.trim()) result.push({ text: remainder, section });
    } else if (line.trim()) {
      result.push({ text: line, section });
    }
  }
  return result;
}

export function excerptAt(text: string, index = 0): string {
  const start = Math.max(0, index - 35);
  return text.slice(start, start + 160);
}

export function isNegated(text: string, index: number): boolean {
  return /(?:不|无需|不需要|不涉及)(?:负责|承担|从事|进行)?\s*$/.test(text.slice(0, index));
}
