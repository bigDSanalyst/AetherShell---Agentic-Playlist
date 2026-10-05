import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { loadSigningKeys, watermarkAndCompress } from '../server/provenance';
import { isSourceId, notebookId, notebookSource, parseNotebook, resolveNotebookUrl, fetchNotebook } from '../server/notebook';
import { buildNotebook, verificationCode } from '../server/notebookExport';
import { checkChatAnswer } from '../server/claimCheck';

const nb = {
  nbformat: 4,
  metadata: { colab: { name: 'Objective reduction.ipynb' } },
  cells: [
    { cell_type: 'markdown', source: ['# Penrose objective reduction\n', 'Collapse time tau = hbar / E_G.'] },
    { cell_type: 'code', source: 'hbar = 1.054e-34\nprint(hbar)', outputs: [{ output_type: 'stream', text: ['1.054e-34\n'] }] },
    { cell_type: 'code', source: 'plot()', outputs: [{ output_type: 'display_data', data: { 'image/png': 'AAAA', 'text/plain': '<Figure>' } }, { output_type: 'display_data', data: { 'text/html': '<script>x</script>' } }] },
    { cell_type: 'code', source: '1/0', outputs: [{ output_type: 'error', ename: 'ZeroDivisionError', evalue: 'division by zero', traceback: ['\u001b[31m...'] }] },
    { cell_type: 'markdown', source: '' },
  ],
};

test('a notebook becomes one segment per cell, with outputs as text; nothing is run or rendered', () => {
  const p = parseNotebook(nb) as any;
  assert.equal(p.title, 'Objective reduction');
  assert.equal(p.segments.length, 4); // the empty cell is skipped
  assert.deepEqual(p.segments.map((s: any) => [s.start, s.speaker]), [['cell 1', 'markdown'], ['cell 2', 'code'], ['cell 3', 'code'], ['cell 4', 'code']]);
  assert.match(p.segments[1].text, /print\(hbar\)\n\[output\]\n1\.054e-34/);
  assert.match(p.segments[3].text, /ZeroDivisionError: division by zero/);
  assert.deepEqual(p.leftOut, { images: 1, html: 1 });
  assert.doesNotMatch(p.rawTranscript, /<script>/);
  const v = notebookSource(p, { via: 'uploaded file "x.ipynb"' });
  assert.equal(v.transcriptSource, 'notebook');
  assert.equal(v.kind, 'notebook');
  assert.match(v.youtubeId, /^nb-[0-9a-f]{16}$/);
  assert.equal(v.youtubeId, notebookId(p.rawTranscript)); // same text, same id
  assert.ok(isSourceId(v.youtubeId) && isSourceId('dQw4w9WgXcQ') && !isSourceId('nb-xyz') && !isSourceId('../etc'));
  assert.match((parseNotebook({ worksheets: [] }) as any).error, /version 3/);
  assert.match((parseNotebook({ hello: 1 }) as any).error, /not a notebook/);
});

test('notebook links resolve only to GitHub raw files or Google Drive downloads', () => {
  assert.deepEqual(resolveNotebookUrl('https://colab.research.google.com/drive/1AbCdEfGhIjKlMnOpQrStUvWxYz'), {
    fetchUrl: 'https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOpQrStUvWxYz',
    via: 'Google Drive (shared link)',
    url: 'https://colab.research.google.com/drive/1AbCdEfGhIjKlMnOpQrStUvWxYz',
  });
  assert.equal(
    resolveNotebookUrl('https://colab.research.google.com/github/owner/repo/blob/main/nbs/demo.ipynb').fetchUrl,
    'https://raw.githubusercontent.com/owner/repo/main/nbs/demo.ipynb'
  );
  assert.equal(resolveNotebookUrl('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrSt/view?usp=sharing').fetchUrl, 'https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOpQrSt');
  assert.throws(() => resolveNotebookUrl('https://github.com/owner/repo/blob/main/guard.ts'), /not a \.ipynb/);
  assert.throws(() => resolveNotebookUrl('https://evil.example/x.ipynb'), /Only Colab, Google Drive and GitHub/);
  assert.throws(() => resolveNotebookUrl('http://colab.research.google.com/drive/1AbCdEfGhIjKlMnOp'), /https/);
});

test('fetching follows redirects only between Drive and GitHub hosts, and explains a private Drive file', async () => {
  const hops: string[] = [];
  const fake = (responses: Record<string, Response>) => (async (url: any) => {
    hops.push(String(url));
    return responses[String(url)];
  }) as any;
  const ok = await fetchNotebook(
    'https://drive.google.com/uc?export=download&id=X',
    fake({
      'https://drive.google.com/uc?export=download&id=X': new Response(null, { status: 303, headers: { location: 'https://drive.usercontent.google.com/download?id=X' } }),
      'https://drive.usercontent.google.com/download?id=X': new Response(JSON.stringify(nb)),
    })
  );
  assert.equal((ok as any).cells.length, 5);
  await assert.rejects(
    fetchNotebook('https://drive.google.com/uc?id=Y', fake({ 'https://drive.google.com/uc?id=Y': new Response(null, { status: 302, headers: { location: 'https://evil.example/' } }) })),
    /refused to follow a redirect to evil\.example/
  );
  await assert.rejects(
    fetchNotebook('https://drive.google.com/uc?id=Z', fake({ 'https://drive.google.com/uc?id=Z': new Response('<html><body>Sign in</body></html>') })),
    /not shared as "Anyone with the link"/
  );
});

test('chat citations to notebook cells are checked like timestamps', () => {
  const p = parseNotebook(nb) as any;
  const v = { title: 'nb', segments: p.segments };
  const c = checkChatAnswer('The collapse time is tau equals hbar over E_G [Video 1 @ cell 1]. The constant hbar is printed as 1.054e-34 [Video 1 @ cell 4].', [v]);
  assert.deepEqual(c.citations.map((x) => [x.cited, x.status, x.foundAt ?? '']), [['cell 1', 'supported', ''], ['cell 4', 'elsewhere', 'cell 2']]);
});

test('an exported notebook carries a Python check that verifies the signature, and fails when the text is changed', (t) => {
  const keys = loadSigningKeys({});
  const transcript = '[00:00 - 00:10] Speaker: Gravity is what fills the hole in quantum mechanics. Ünïcode “quotes” — and a\ttab.';
  const logic = { logicId: 'L-1', summary: 'Plan', workflowSteps: [{ step: 1, action: 'Verify claims', description: 'Check each claim "quoted".' }], executableScript: 'return 1 ```', score: 0.5, n: 3 };
  const { watermark } = watermarkAndCompress(keys, { rawTranscript: transcript, logic, transcriptSource: 'model-transcription:gemini-flash-lite-latest' });
  const signed = { manifest: watermark.manifest, signature: watermark.signature, transcript, verifiedAtExport: true };
  const book = buildNotebook({
    title: 'Test <export>',
    sources: [{ title: 'Lecture | one', url: 'https://www.youtube.com/watch?v=abcdefghijk', label: 'model-transcription', rawTranscript: transcript }],
    logic,
    signed,
    publicKey: { pem: keys.publicKeyPem, fingerprint: keys.fingerprint, ephemeral: true },
    knowledge: { title: 'K', coreThesis: '<b>x</b>', groundingCitations: [{ verbatimQuote: 'q', quoteVerified: false }] },
  });
  assert.equal(book.nbformat, 4);
  const text = JSON.stringify(book);
  assert.doesNotMatch(text, /<b>x<\/b>|# Test <export>/); // no raw HTML from model or titles
  assert.match(text, /NOT found in the sources/);
  assert.match(text, /def step_1_verify_claims/);
  // The model's script is text in markdown, never runnable: in code cells it appears
  // only inside the signed plan's data (a quoted string), not as a line of code.
  const codeLines = book.cells.filter((c: any) => c.cell_type === 'code').flatMap((c: any) => c.source.join('').split('\n'));
  assert.ok(!codeLines.some((l: string) => l.trim().startsWith('return 1')));
  assert.ok(book.cells.some((c: any) => c.cell_type === 'markdown' && c.source.join('').includes('~~~~javascript\nreturn 1 ```')));

  const py = spawnSync('python3', ['-c', 'import cryptography'], { encoding: 'utf8' });
  if (py.status !== 0) return t.skip('python3 with the cryptography package is not available here');
  const run = (code: string) => spawnSync('python3', ['-'], { input: code, encoding: 'utf8' });
  const good = run(verificationCode(signed, logic, keys.publicKeyPem));
  assert.equal(good.status, 0, good.stderr);
  assert.match(good.stdout, /PASS signature\nPASS transcript matches\nPASS plan matches\nSigned source: model-transcription:gemini-flash-lite-latest\nVERIFIED/);
  const changed = run(verificationCode({ ...signed, transcript: transcript + ' extra' }, logic, keys.publicKeyPem));
  assert.match(changed.stdout, /FAIL transcript matches[\s\S]*NOT VERIFIED/);
  const otherPlan = run(verificationCode(signed, { ...logic, summary: 'Changed' }, keys.publicKeyPem));
  assert.match(otherPlan.stdout, /FAIL plan matches[\s\S]*NOT VERIFIED/);
});
