import { Window } from 'happy-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runJobLinkStatusProbe } from '../src/page-extraction/job-link-status-probe';

const JOB_URL = 'https://www.zhipin.com/job_detail/probe-example.html';

function installDom(bodyHtml: string, pageUrl = JOB_URL): Window {
  const window = new Window();
  window.location.href = pageUrl;
  window.document.body.innerHTML = bodyHtml;
  Object.defineProperty(window.Element.prototype, 'getClientRects', {
    configurable: true,
    value: () => [{ width: 10, height: 10 }],
  });
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('Node', window.Node);
  vi.stubGlobal('NodeFilter', window.NodeFilter);
  vi.stubGlobal('getComputedStyle', window.getComputedStyle.bind(window));
  return window;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('job link status DOM probe', () => {
  it('recognizes an exact visible approved unavailable marker', () => {
    installDom('<main><div>职位已关闭。</div></main>');
    expect(runJobLinkStatusProbe(JOB_URL)).toMatchObject({
      pageMatches: true,
      challenge: false,
      markerCode: 'job_closed',
    });
  });

  it('recognizes an approved marker split across inline descendants', () => {
    installDom('<main><div><span>职位已</span><span>下线</span></div></main>');
    expect(runJobLinkStatusProbe(JOB_URL)).toMatchObject({
      challenge: false,
      markerCode: 'job_offline',
    });
  });

  it('does not classify marker words mentioned inside normal JD prose', () => {
    installDom('<main><p>岗位职责包括处理“职位已关闭”相关咨询，但当前岗位仍在招聘。</p></main>');
    expect(runJobLinkStatusProbe(JOB_URL)).toMatchObject({
      challenge: false,
      markerCode: null,
    });
  });

  it('ignores unavailable text in a hidden subtree', () => {
    installDom('<main><div hidden>职位已关闭</div><p>正常岗位详情</p></main>');
    expect(runJobLinkStatusProbe(JOB_URL)).toMatchObject({
      challenge: false,
      markerCode: null,
    });
  });

  it.each([
    '<main><div>请完成安全验证</div></main>',
    '<main><div>登录后查看岗位</div></main>',
    '<main><iframe src="about:blank"></iframe></main>',
  ])('fails closed when challenge or opaque embedded content is visible', (html) => {
    installDom(html);
    expect(runJobLinkStatusProbe(JOB_URL)).toMatchObject({
      pageMatches: true,
      challenge: true,
      markerCode: null,
    });
  });

  it('fails closed when the inspected document no longer matches the expected job URL', () => {
    installDom('<main><p>正常内容</p></main>', 'https://www.zhipin.com/job_detail/other.html');
    expect(runJobLinkStatusProbe(JOB_URL)).toMatchObject({
      pageMatches: false,
      challenge: true,
      markerCode: null,
    });
  });

  it('does not turn an overlong content block into an outage marker', () => {
    installDom(`<main><p>${'普通岗位描述'.repeat(40)}职位已删除</p></main>`);
    expect(runJobLinkStatusProbe(JOB_URL)).toMatchObject({
      challenge: false,
      markerCode: null,
    });
  });
});
