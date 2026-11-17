import test from 'node:test';
import assert from 'node:assert/strict';
import { qualifyErpEvidence, publicCompanyDomain } from '../packages/agents/src/erp-evidence.ts';

const now = new Date('2026-11-17T12:00:00Z');
const base = {
  companyName: 'Example Steel Fabrication Ltd',
  website: 'https://www.example-steel.com/',
  sourceUrl: 'https://www.example-steel.com/careers/inventory-control',
  title: 'Example Steel Fabrication — Inventory Coordinator',
  excerpt: 'Our sheet metal fabrication plant uses Excel for daily stock reconciliation.',
  publishedAt: '2026-10-10',
};

test('classifies sourced first-party Excel inventory pain conservatively', () => {
  const result = qualifyErpEvidence(base, now);
  assert.equal(result?.type, 'operational_pain');
  assert.equal(result?.verification, 'search_excerpt');
  assert.equal(result?.publishedAt, '2026-10-10T00:00:00.000Z');
});

test('recognises first-party ERP selection in metal processing', () => {
  const result = qualifyErpEvidence({
    ...base, title: 'Steel fabricator evaluating ERP software',
    excerpt: 'Our machining team is evaluating ERP software to unify material and job tracking.',
  }, now);
  assert.equal(result?.type, 'software_selection');
});

test('rejects a job board pretending to be the manufacturer website', () => {
  assert.equal(qualifyErpEvidence({ ...base, sourceUrl: 'https://www.linkedin.com/jobs/view/123' }, now), null);
});

test('rejects unrelated pages even when hosted by the manufacturer', () => {
  assert.equal(qualifyErpEvidence({
    ...base, title: 'Our services', excerpt: 'Custom steel sheet fabrication, CNC cutting and welding',
  }, now), null);
});

test('rejects software complaints with no metal-industry context', () => {
  assert.equal(qualifyErpEvidence({
    ...base, title: 'Accountancy office recruitment',
    excerpt: 'We use Excel for payroll and invoicing.',
  }, now), null);
});

test('rejects stale dated pain reports', () => {
  assert.equal(qualifyErpEvidence({ ...base, publishedAt: '2021-05-01' }, now), null);
});

test('does not mistake unparseable dates for verified freshness', () => {
  const result = qualifyErpEvidence({ ...base, publishedAt: 'recently' }, now);
  assert.equal(result?.publishedAt, undefined);
  assert.ok((result?.score ?? 100) < 65);
});

test('blocks unsafe and directory domains', () => {
  for (const url of [
    'https://linkedin.com/jobs',
    'http://127.0.0.1/',
    'http://localhost:5000/',
    'https://jobs.indeed.com/',
    'ftp://example-steel.com/',
    'http://admin:secret@example-steel.com',
  ]) {
    assert.equal(publicCompanyDomain(url), null, url);
  }
});

test('requires evidence and company website to have the same domain', () => {
  assert.equal(qualifyErpEvidence({
    ...base, sourceUrl: 'https://another-metal-company.com/jobs/operations',
  }, now), null);
});
