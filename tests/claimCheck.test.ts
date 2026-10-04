import test from 'node:test';
import assert from 'node:assert/strict';
import { checkChatAnswer } from '../server/claimCheck';

const lecture = {
  title: 'Lecture',
  segments: [
    { start: '00:00', end: '00:30', speaker: 'S', text: 'Quantum mechanics has a hole in it, a structural one in the middle of the theory.' },
    { start: '07:50', end: '08:06', speaker: 'S', text: 'This is called the Copenhagen interpretation, associated with Niels Bohr, describing outcomes of measurements.' },
    { start: '16:33', end: '16:43', speaker: 'S', text: 'I call it gravitationally induced objective reduction, shortened to objective reduction.' },
    { start: '35:05', end: '35:10', speaker: 'S', text: 'Microtubules within neurons might sustain quantum superpositions, a proposal called orchestrated reduction.' },
  ],
};
const talk = { title: 'Talk', segments: [{ start: '00:00', end: '00:20', speaker: 'S', text: 'Navier Stokes equations can blow up into singularities with infinite velocity.' }] };

test('a citation whose words are said at that time is confirmed', () => {
  const c = checkChatAnswer('The Copenhagen interpretation, associated with Niels Bohr, describes measurement outcomes [Video 1 @ 07:50].', [lecture]);
  assert.equal(c.citations[0].status, 'supported');
  assert.equal(c.summary.supported, 1);
});

test('a citation at the wrong time is reported with where it is actually said', () => {
  const c = checkChatAnswer('The speaker rejects the Copenhagen interpretation of Niels Bohr about measurement outcomes [Video 1 @ 13:34].', [lecture]);
  assert.equal(c.citations[0].status, 'elsewhere');
  assert.equal(c.citations[0].foundAt, '07:50');
});

test('grouped citations, other videos, impossible ones and unsupported claims', () => {
  const c = checkChatAnswer(
    'Singularities with infinite velocity appear in Navier Stokes equations [Video 1 @ 00:00; Video 2 @ 00:00]. ' +
      'Dark matter halos determine galaxy rotation curves completely [Video 1 @ 16:33]. Something else [Video 3 @ 01:00]. Late claim about objective reduction [Video 1 @ 59:00].',
    [lecture, talk]
  );
  const st = c.citations.map((x) => `${x.video}@${x.cited}:${x.status}`);
  assert.deepEqual(st, ['1@00:00:unsupported', '2@00:00:supported', '1@16:33:unsupported', '3@01:00:no-such-video', '1@59:00:bad-time']);
  assert.equal(c.summary.invalid, 2);
});

test('uncited sentences from outside the corpus, and maths, are marked', () => {
  const c = checkChatAnswer(
    'Gravitationally induced objective reduction is the speaker\'s proposal for quantum collapse in the theory.\n' +
      'The Riemann hypothesis concerns zeros of the zeta function along the critical line in analytic number theory.\n' +
      'The threshold is $\\Theta = G \\rho L^2 / \\hbar c$ for every quantum system in the theory.',
    [lecture]
  );
  const out = c.uncited.map((u) => u.outsideCorpus);
  assert.deepEqual(out, [false, true, true]);
  assert.equal(c.summary.outsideCorpus, 2);
});
