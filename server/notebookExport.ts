import { canonicalJson, normalizeTranscript } from './provenance';

// Builds a Google Colab / Jupyter notebook (.ipynb) from work done here: the
// sources (transcripts and notebooks), the innershell plan, a knowledge
// synthesis, and, when the plan was signed, a cell that checks the signature
// in Python.
//
// Model-written material is labelled as such. The model's script is included as
// text, never as a runnable cell; the only code cells are the provenance check
// and a scaffold built from the plan's step list (function names and
// docstrings, no model-written code). Text from models or transcripts goes into
// markdown with "<" escaped, so it cannot become HTML in the notebook.

export interface ExportSource {
  title: string;
  url?: string;
  kind?: string;
  label: string; // where the text came from, as shown in the app
  rawTranscript: string;
}

export interface ExportInput {
  title: string;
  sources: ExportSource[];
  logic?: any; // the innershell plan
  signed?: {
    manifest: any;
    signature: string;
    transcript: string; // the bound transcript, as signed
    verifiedAtExport: boolean;
  };
  publicKey: { pem: string; fingerprint: string; ephemeral: boolean };
  knowledge?: any;
  exportedAt?: Date;
}

const md = (s: unknown) => String(s ?? '').replace(/</g, '&lt;');
// A JSON string literal is a valid Python string literal for well-formed text.
const py = (s: string) => JSON.stringify(s);
const lines = (text: string) => {
  const parts = text.split('\n');
  return parts.map((l, i) => (i < parts.length - 1 ? `${l}\n` : l));
};
const mdCell = (text: string) => ({ cell_type: 'markdown', metadata: {}, source: lines(text) });
const codeCell = (text: string) => ({ cell_type: 'code', metadata: {}, execution_count: null, outputs: [], source: lines(text) });

function fence(code: string, lang: string): string {
  const f = code.includes('```') ? '~~~~' : '```';
  return `${f}${lang}\n${code}\n${f}`;
}

function slug(s: string, n: number): string {
  const base = String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return `step_${n}${base ? `_${base}` : ''}`;
}

export function verificationCode(signed: NonNullable<ExportInput['signed']>, logic: any, pem: string): string {
  return [
    '# AetherShell provenance check: does the signature hold, and are the',
    '# transcript and plan below exactly what was signed? Needs only the',
    '# `cryptography` package (preinstalled on Colab).',
    'import base64, hashlib, json',
    'from cryptography.hazmat.primitives.serialization import load_pem_public_key',
    '',
    `PUBLIC_KEY_PEM = ${py(pem)}`,
    `MANIFEST_JSON = ${py(canonicalJson(signed.manifest))}  # exactly as signed`,
    `SIGNATURE_B64 = ${py(signed.signature)}`,
    `LOGIC_JSON = ${py(canonicalJson(logic))}  # exactly as hashed`,
    `TRANSCRIPT = ${py(normalizeTranscript(signed.transcript))}  # exactly as hashed`,
    '',
    'def sha256(s):',
    '    return hashlib.sha256(s.encode("utf-8")).hexdigest()',
    '',
    'manifest = json.loads(MANIFEST_JSON)',
    'results = {}',
    'try:',
    '    load_pem_public_key(PUBLIC_KEY_PEM.encode()).verify(base64.b64decode(SIGNATURE_B64), MANIFEST_JSON.encode("utf-8"))',
    '    results["signature"] = True',
    'except Exception:',
    '    results["signature"] = False',
    'results["transcript matches"] = sha256(TRANSCRIPT) == manifest["transcriptSha256"]',
    'results["plan matches"] = sha256(LOGIC_JSON) == manifest["logicSha256"]',
    'for name, ok in results.items():',
    '    print(("PASS " if ok else "FAIL ") + name)',
    'print("Signed source:", manifest.get("transcriptSource", "not recorded"))',
    'print("VERIFIED" if all(results.values()) else "NOT VERIFIED")',
  ].join('\n');
}

export function buildNotebook(input: ExportInput) {
  const at = (input.exportedAt ?? new Date()).toISOString();
  const cells: any[] = [];
  const L = input.logic;

  cells.push(
    mdCell(
      [
        `# ${md(input.title)}`,
        '',
        `Exported from AetherShell on ${at}.`,
        '',
        '**What is in here.** The sources below, ' +
          [L ? 'the innershell plan' : '', input.knowledge ? 'a knowledge synthesis' : ''].filter(Boolean).join(' and ') +
          (input.signed ? ', and a cell that checks the plan\'s signature.' : '.'),
        '',
        '**Model-written.** The plan, the synthesis and the script were written by language models from the sources. ' +
          'They were checked by AetherShell\'s guards as recorded there, but they are not proven true. ' +
          'Review any code before you run it.',
      ].join('\n')
    )
  );

  cells.push(
    mdCell(
      [
        '## Sources',
        '',
        '| # | Source | Kind | Where the text came from |',
        '| --- | --- | --- | --- |',
        ...input.sources.map(
          (s, i) =>
            `| ${i + 1} | ${s.url ? `[${md(s.title).replace(/[[\]|]/g, ' ')}](${encodeURI(s.url)})` : md(s.title).replace(/\|/g, ' ')} | ${md(s.kind || 'video')} | ${md(s.label).replace(/\|/g, ' ')} |`
        ),
        '',
        'Citations like `[Video N @ mm:ss]` or `[Video N @ cell K]` refer to these numbers.',
      ].join('\n')
    )
  );
  cells.push(
    codeCell(
      [
        '# The sources as data, to work with here (title, kind, label, text).',
        'import json',
        `SOURCES = json.loads(${py(JSON.stringify(input.sources.map((s) => ({ title: s.title, url: s.url ?? '', kind: s.kind || 'video', label: s.label, text: s.rawTranscript }))))})`,
        'print(len(SOURCES), "sources;", sum(len(s["text"]) for s in SOURCES), "characters")',
      ].join('\n')
    )
  );

  if (input.signed && L) {
    cells.push(
      mdCell(
        [
          '## Provenance check',
          '',
          `The plan was signed together with source text (watermark \`${md(input.signed.manifest?.watermarkId)}\`, signed source \`${md(input.signed.manifest?.transcriptSource ?? 'not recorded')}\`). ` +
            `AetherShell checked the signature when exporting: **${input.signed.verifiedAtExport ? 'it verified' : 'it did NOT verify'}**.`,
          '',
          `Run the next cell to check it again here. The public key is included; to know it is the right one, compare its fingerprint \`${md(input.publicKey.fingerprint)}\` with the one the instance owner publishes (\`GET /api/crypto/public-key\`).` +
            (input.publicKey.ephemeral ? ' (That instance used a temporary key, so its own server will not recognise this signature after a restart; this check still works.)' : ''),
        ].join('\n')
      )
    );
    cells.push(codeCell(verificationCode(input.signed, L, input.publicKey.pem)));
  }

  if (L) {
    const steps: any[] = Array.isArray(L.workflowSteps) ? L.workflowSteps : [];
    cells.push(
      mdCell(
        [
          '## The plan (model-written)',
          '',
          md(L.summary),
          '',
          ...(steps.length ? ['### Steps', '', ...steps.map((s, i) => `${i + 1}. **${md(s?.action)}**: ${md(s?.description)}`), ''] : []),
          ...(Array.isArray(L.criticalGuardRequirements) && L.criticalGuardRequirements.length
            ? ['### Requirements the guards check', '', ...L.criticalGuardRequirements.map((r: any) => `- ${md(r)}`)]
            : []),
        ].join('\n')
      )
    );
    if (steps.length) {
      const names = steps.map((s, i) => slug(s?.action, i + 1));
      cells.push(
        codeCell(
          [
            '# Scaffold from the plan\'s steps: names and docstrings come from the plan',
            '# (model-written text); the bodies are yours to write. No model-written code.',
            ...steps.flatMap((s, i) => ['', `def ${names[i]}():`, `    ${py(String(s?.description ?? ''))}`, `    raise NotImplementedError(${py(`step ${i + 1}: ${String(s?.action ?? '')}`)})`]),
            '',
            'def run_plan():',
            `    for step in (${names.join(', ')}${names.length === 1 ? ',' : ''}):`,
            '        print("running", step.__name__)',
            '        step()',
          ].join('\n')
        )
      );
    }
    if (typeof L.executableScript === 'string' && L.executableScript.trim()) {
      cells.push(
        mdCell(
          [
            '### The model\'s script (JavaScript, not run here)',
            '',
            'AetherShell runs this only inside a browser sandbox. It is included as text for reference; port it to Python yourself if you want it here, and review it first.',
            '',
            fence(L.executableScript, 'javascript'),
          ].join('\n')
        )
      );
    }
  }

  const K = input.knowledge;
  if (K) {
    const list = (title: string, xs: any) => (Array.isArray(xs) && xs.length ? [`### ${title}`, '', ...xs.map((x: any) => `- ${md(typeof x === 'string' ? x : JSON.stringify(x))}`), ''] : []);
    cells.push(
      mdCell(
        [
          `## Knowledge synthesis (model-written): ${md(K.title)}`,
          '',
          K.coreThesis ? `**Core thesis.** ${md(K.coreThesis)}` : '',
          '',
          ...list('Axioms', K.subjugatedAxioms),
          ...(Array.isArray(K.emergentConcepts) && K.emergentConcepts.length
            ? ['### Concepts', '', ...K.emergentConcepts.map((c: any) => `- **${md(c?.name)}**: ${md(c?.definition)} ${md((c?.citations || []).join(' '))}`), '']
            : []),
          ...list('Directives', K.actionableDirectives),
          ...list('Tensions and contradictions', K.dialecticsAndContradictions),
          ...(Array.isArray(K.groundingCitations) && K.groundingCitations.length
            ? [
                '### Quotes',
                '',
                ...K.groundingCitations.map(
                  (c: any) => `- ${c?.quoteVerified ? '✓ found word for word in the sources' : '✗ NOT found in the sources'}: "${md(c?.verbatimQuote)}" (${md(c?.videoTitle)} @ ${md(c?.timestamp)})`
                ),
              ]
            : []),
        ].join('\n')
      )
    );
  }

  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      colab: { name: `${input.title}.ipynb`.slice(0, 120) },
      kernelspec: { name: 'python3', display_name: 'Python 3', language: 'python' },
      language_info: { name: 'python' },
      aethershell: {
        exportedAt: at,
        watermarkId: input.signed?.manifest?.watermarkId ?? null,
        publicKeyFingerprint: input.publicKey.fingerprint,
        sources: input.sources.map((s) => s.title),
      },
    },
    cells: cells.map((c, i) => ({ ...c, id: `aether-${i + 1}` })),
  };
}
