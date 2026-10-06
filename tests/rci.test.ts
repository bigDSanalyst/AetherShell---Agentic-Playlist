import test from 'node:test';
import assert from 'node:assert/strict';
import { CLAIM_FLOOR, critiquePrompt, findProblems, findingsSummary, improvePrompt, sanitizeCritique } from '../server/rci';

const T = 'Gravity is what fills the hole in quantum mechanics. Collapse happens without any observer at all, after a time set by the gravitational self-energy.';

const draft = {
  summary: 'Gravity fills the hole in quantum mechanics.',
  workflowSteps: [
    { action: 'COLLAPSE', description: 'Collapse happens without any observer.' },
    { action: 'INVENT', description: 'Blockchain tokens reward validators with dividends.' },
  ],
  criticalGuardRequirements: [],
  invariants: [
    { id: 'INV-01', name: 'no observer', transcriptEvidence: 'Collapse happens without any observer at all' },
    { id: 'INV-02', name: 'made up', transcriptEvidence: 'Consciousness causes collapse' },
    { id: 'INV-03', name: 'unquoted', transcriptEvidence: '' },
  ],
};

test('findProblems lists exactly the computed problems, with where and why', () => {
  const f = findProblems(draft, T);
  assert.deepEqual(
    f.map((x) => [x.id, x.kind, x.where]),
    [
      ['F1', 'quote-not-found', 'invariant INV-02'],
      ['F2', 'no-quote', 'invariant INV-03'],
      ['F3', 'weakly-grounded', 'step 2'],
    ]
  );
  assert.match(f[2].detail, /^0% of its content words are in the transcript; not found: blockchain, tokens, reward/);
  assert.equal(findingsSummary(f), '1 quote-not-found, 1 no-quote, 1 weakly-grounded');
});

test('a grounded draft has no problems; punctuation and case do not matter for quotes', () => {
  const ok = { summary: 'gravity fills the hole', workflowSteps: [], invariants: [{ id: 'I', transcriptEvidence: 'COLLAPSE happens, without any observer!' }] };
  assert.deepEqual(findProblems(ok, T), []);
  assert.equal(findingsSummary([]), 'none');
});

test('the claim floor is a writing aid below which a claim is listed, not the guard threshold', () => {
  assert.equal(CLAIM_FLOOR, 0.5);
  // 2 of 4 content words found: exactly at the floor, not listed
  assert.deepEqual(findProblems({ summary: 'gravity collapse zebra quokka' }, T), []);
  assert.equal(findProblems({ summary: 'gravity zebra quokka wombat' }, T).length, 1);
});

test('sanitizeCritique keeps only computed problems, checks cited quotes, and marks skipped ones', () => {
  const f = findProblems(draft, T);
  const c = sanitizeCritique(
    {
      critiques: [
        { id: 'F1', verdict: 'requote', reason: 'wrong quote', transcriptQuote: 'collapse happens without any observer at all' },
        { id: 'F3', verdict: 'remove', reason: 'not in the talk', transcriptQuote: 'validators earn dividends' },
        { id: 'F9', verdict: 'remove', reason: 'not a computed problem' },
        { id: 'F1', verdict: 'keep', reason: 'duplicate id ignored' },
      ],
    },
    f,
    T
  );
  assert.deepEqual(
    c.map((x) => [x.id, x.verdict, x.quoteFound]),
    [
      ['F1', 'requote', true],
      ['F2', 'keep', false],
      ['F3', 'remove', false],
    ]
  );
  assert.equal(c[1].reason, 'the critique did not address this problem');
  assert.equal(sanitizeCritique({ critiques: [{ id: 'F1', verdict: 'delete everything' }] }, f, T)[0].verdict, 'keep');
});

test('prompts mark inputs as data; the fix step only receives verified quotes and never the guard thresholds', () => {
  const f = findProblems(draft, T);
  const cp = critiquePrompt('HEADER', draft, f);
  assert.match(cp, /COMPUTED PROBLEMS \(data/);
  assert.match(cp, /"id":"F3"/);
  const c = sanitizeCritique(
    { critiques: [{ id: 'F3', verdict: 'rewrite', reason: 'r', transcriptQuote: 'an invented quote about tokens' }] },
    f,
    T
  );
  const ip = improvePrompt('HEADER', draft, c, '{schema}');
  assert.match(ip, /CRITIQUE TO APPLY \(data\)/);
  assert.doesNotMatch(ip, /an invented quote about tokens/);
  assert.doesNotMatch(cp + ip, /threshold|minWordOverlap|epsilon/i);
});
