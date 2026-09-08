import { messages, type JobSummary, type UiSnapshot } from './snapshot';

export const linkCheckMessages = {
  available: '当前岗位链接可正常打开。',
  explicitly_unavailable: '当前页面明确显示该岗位已失效。',
  unknown: '当前页面无法可靠判断岗位链接状态。',
} as const;

const linkCheckLabels = {
  available: '岗位链接有效',
  explicitly_unavailable: '岗位已失效',
  unknown: '状态未知',
} as const;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text: string, className = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}

export function find<T extends HTMLElement = HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error('Workspace element is missing.');
  return node;
}

function link(url: string, label = '打开对应岗位'): HTMLAnchorElement {
  const node = element('a', label);
  node.href = url;
  node.target = '_blank';
  node.rel = 'noreferrer noopener';
  return node;
}

function timestamp(value: string): HTMLTimeElement {
  const node = element('time', new Date(value).toLocaleString('zh-CN', { hour12: false }));
  node.dateTime = value;
  return node;
}

function fields(job: JobSummary): HTMLDListElement {
  const list = document.createElement('dl');
  const values = [
    ['公司', job.companyName], ['薪资', job.salaryText], ['地点', job.locationText],
    ['经验', job.experienceText], ['学历', job.educationText],
    ['职位描述', job.hasFullDescription ? '已读取，完整内容仅随保存发送到本地服务' : '未读取到完整内容'],
  ];
  for (const [name, value] of values) {
    list.append(element('dt', name ?? ''), element('dd', value ?? '未知'));
  }
  return list;
}

function tags(values: string[], className = 'tags'): HTMLDivElement {
  const list = element('div', '', className);
  for (const value of values) list.append(element('span', value));
  return list;
}

export function renderSnapshot(state: UiSnapshot): void {
  const current = find('[data-job-summary]');
  const first = state.jobs[0];
  current.replaceChildren();
  if (first) {
    current.append(element('h3', first.title ?? '岗位名称未知'), element('p', first.companyName ?? '公司信息未知', 'company'),
      element('p', first.salaryText ?? '薪资未知', 'salary'),
      tags([first.locationText ?? '地点未知', first.experienceText ?? '经验未知', first.educationText ?? '学历未知'], 'metadata'),
      link(first.jobUrl));
  } else {
    current.append(element('h3', '从一个岗位开始'), element('p', '打开 BOSS 岗位页面，主动刷新或解析，结果会保留在这里。', 'muted'));
    if (state.lastJobUrl) current.append(link(state.lastJobUrl, '打开最近识别的岗位'));
  }
  const results = find('[data-results]');
  results.replaceChildren();
  if (!first) results.append(element('p', '尚无解析结果。切换页面不会清空已取得的结果。', 'muted'));
  else {
    if (state.pageType === 'search_results') results.append(element('p', `已解析 ${state.parsedCount} 个岗位，保留前 ${state.jobs.length} 个可展示摘要。`, 'muted small'));
    for (const job of state.jobs) {
      const card = element('article', '', 'result-job');
      card.append(element('h3', job.title ?? '岗位名称未知'), fields(job), tags(job.tags), link(job.jobUrl));
      results.append(card);
    }
    if (state.parsedAt) results.append(element('p', '解析时间', 'muted small'), timestamp(state.parsedAt));
  }
  find('[data-snapshot-details]').hidden = state.jobs.length === 0;
  // Only the same minimized display model is exposed, never extraction payloads.
  find('[data-snapshot-json]').textContent = JSON.stringify(state.jobs, null, 2);

  const analysis = find('[data-analysis]');
  analysis.replaceChildren();
  if (state.analysis) {
    analysis.append(element('p', '✓ 最近一次分析已完成', 'success-label'),
      element('p', `本地分析记录 #${state.analysis.id}`, 'small'), timestamp(state.analysis.at),
      element('p', '分析结果已保存到本地服务。当前接口仅返回记录编号，工作台暂不展示分析正文。', 'muted small'),
      link(state.analysis.jobUrl, '查看这次分析对应的岗位'));
  } else analysis.append(element('p', '尚无已确认的分析记录。', 'muted'));

  const history = find('[data-history]');
  history.replaceChildren();
  const entries: { label: string; at: string; url: string | null }[] = [];
  if (state.parsedAt) entries.push({ label: '最近解析 · 展示摘要已生成', at: state.parsedAt, url: first?.jobUrl ?? null });
  if (state.saved) entries.push({ label: `最近保存 · ${state.saved.count} 条岗位记录`, at: state.saved.at, url: state.saved.jobUrl });
  if (state.linkCheck) entries.push({ label: `最近检查 · ${linkCheckLabels[state.linkCheck.status]} ${linkCheckMessages[state.linkCheck.status]}`, at: state.linkCheck.at, url: state.linkCheck.jobUrl });
  if (state.analysis) entries.push({ label: '最近分析 · 已保存到本地服务', at: state.analysis.at, url: state.analysis.jobUrl });
  entries.sort((left, right) => right.at.localeCompare(left.at));
  for (const entry of entries) {
    const item = element('div', '', 'history-item');
    item.append(element('p', entry.label, 'small'), timestamp(entry.at));
    if (entry.url) item.append(element('br', ''), link(entry.url));
    history.append(item);
  }
  if (!entries.length) history.append(element('p', '你的最近一次解析、保存、链接检查和分析进度将在这里保留。', 'muted'));
  if (state.lastOperationAt) history.append(element('p', '最近操作', 'muted small'), timestamp(state.lastOperationAt));
}

export function renderStatus(state: UiSnapshot, options: {
  supported: boolean; canAnalyze: boolean; busy: boolean; ready: boolean; notice: string;
}): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-action]')) {
    const action = button.dataset.action;
    button.disabled = !options.ready || options.busy || !options.supported || ((action === 'analyze' || action === 'link_check') && !options.canAnalyze);
    const labels: Record<string, string> = { refresh: '↻ 刷新当前页信息', parse: '解析当前岗位', save: '保存到本地', link_check: '检查岗位链接状态', analyze: '✦ AI 分析当前岗位' };
    button.textContent = options.busy && state.pending === action ? '正在处理…' : labels[action ?? ''] ?? '';
  }
  find('.actions').setAttribute('aria-busy', String(options.busy));
  const status = find('[data-action-status]');
  status.textContent = state.error ? messages[state.error] : options.notice;
  status.dataset.error = String(state.error !== null);
  find('[data-context]').textContent = state.viewingPrevious ? '查看上次结果' : '已同步当前页';
  find('[data-page-status]').textContent = !options.supported
    ? messages.page
    : state.viewingPrevious
      ? '当前页面支持读取。正在查看保留结果，点击刷新可同步当前页。'
      : '已同步当前页。页面内容更新后，可主动点击刷新。';
  if (options.supported && !options.canAnalyze) {
    find('[data-page-status]').textContent += ' AI 分析和链接检查支持 BOSS 岗位详情页，发送前会去除页面参数。';
  }
}
