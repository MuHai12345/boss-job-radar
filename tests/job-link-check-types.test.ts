import { describe, expect, it } from 'vitest';

import {
  canonicalCheckableJobUrl,
  isIsoTimestamp,
  validateJobLinkCheckRequest,
} from '../src/shared/job-link-check-types';

describe('job link check request validation', () => {
  it('accepts only canonical HTTPS BOSS job detail URLs', () => {
    expect(canonicalCheckableJobUrl('https://www.zhipin.com/job_detail/example.html')).toBe('https://www.zhipin.com/job_detail/example.html');
    expect(canonicalCheckableJobUrl('https://www.zhipin.com/job_detail/example.html?ka=search_list_jname_1_blank')).toBe('https://www.zhipin.com/job_detail/example.html');
    expect(canonicalCheckableJobUrl('http://www.zhipin.com/job_detail/example.html')).toBeNull();
    expect(canonicalCheckableJobUrl('https://m.zhipin.com/job_detail/example.html')).toBeNull();
    expect(canonicalCheckableJobUrl('https://www.zhipin.com/web/geek/jobs')).toBeNull();
  });

  it('accepts exact ISO timestamps and rejects normalized-but-not-exact variants', () => {
    expect(isIsoTimestamp('2026-09-07T10:00:00.000Z')).toBe(true);
    expect(isIsoTimestamp('2026-09-07T10:00:00Z')).toBe(false);
    expect(isIsoTimestamp('2026-09-07T18:00:00.000+08:00')).toBe(false);
    expect(isIsoTimestamp('not-a-time')).toBe(false);
  });

  it('requires marker codes only for explicitly unavailable checks', () => {
    expect(validateJobLinkCheckRequest({
      jobUrl: 'https://www.zhipin.com/job_detail/example.html',
      observedAt: '2026-09-07T10:00:00.000Z',
      status: 'available',
      markerCode: null,
    })).not.toBeNull();
    expect(validateJobLinkCheckRequest({
      jobUrl: 'https://www.zhipin.com/job_detail/example.html',
      observedAt: '2026-09-07T10:00:00.000Z',
      status: 'unknown',
      markerCode: null,
    })).not.toBeNull();
    expect(validateJobLinkCheckRequest({
      jobUrl: 'https://www.zhipin.com/job_detail/example.html',
      observedAt: '2026-09-07T10:00:00.000Z',
      status: 'explicitly_unavailable',
      markerCode: 'job_closed',
    })).not.toBeNull();
    expect(validateJobLinkCheckRequest({
      jobUrl: 'https://www.zhipin.com/job_detail/example.html',
      observedAt: '2026-09-07T10:00:00.000Z',
      status: 'explicitly_unavailable',
      markerCode: null,
    })).toBeNull();
    expect(validateJobLinkCheckRequest({
      jobUrl: 'https://www.zhipin.com/job_detail/example.html',
      observedAt: '2026-09-07T10:00:00.000Z',
      status: 'available',
      markerCode: 'job_closed',
    })).toBeNull();
  });

  it('fails closed on extra keys, invalid statuses and invalid marker codes', () => {
    const base = {
      jobUrl: 'https://www.zhipin.com/job_detail/example.html',
      observedAt: '2026-09-07T10:00:00.000Z',
      status: 'available',
      markerCode: null,
    };
    expect(validateJobLinkCheckRequest({ ...base, extra: true })).toBeNull();
    expect(validateJobLinkCheckRequest({ ...base, status: 'unchecked' })).toBeNull();
    expect(validateJobLinkCheckRequest({ ...base, status: 'explicitly_unavailable', markerCode: 'other' })).toBeNull();
  });
});
