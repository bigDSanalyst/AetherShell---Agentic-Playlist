// Jupyter / Colab notebooks in (as sources) and out (with a signature check).
import type { Express, Request, Response } from 'express';
import { verifyProvenance } from '../provenance';
import { fetchNotebook, notebookSource, parseNotebook, resolveNotebookUrl } from '../notebook';
import { buildNotebook } from '../notebookExport';
import { recordIngest, sendError, signingKeys } from '../core';

export function registerNotebooksRoutes(app: Express) {
  // A Jupyter / Colab notebook as a source, next to videos: an uploaded .ipynb
  // ({ content, filename }) or a link ({ url }: Colab, Google Drive shared as
  // "Anyone with the link", or GitHub). Nothing in it is run. Recorded in the
  // ledger and archive as source "notebook", so it can be combined and signed.
  app.post('/api/notebooks/import', async (req: Request, res: Response) => {
    try {
      const { content, filename, url } = req.body || {};
      let json: unknown;
      let origin: { via: string; url?: string };
      if (typeof url === 'string' && url.trim()) {
        let resolved;
        try {
          resolved = resolveNotebookUrl(url);
        } catch (e: any) {
          return res.status(400).json({ error: e.message });
        }
        try {
          json = await fetchNotebook(resolved.fetchUrl);
        } catch (e: any) {
          return res.status(422).json({ error: `Could not get the notebook: ${e.message}` });
        }
        origin = { via: resolved.via, url: resolved.url };
      } else if (typeof content === 'string' && content) {
        try {
          json = JSON.parse(content);
        } catch {
          return res.status(400).json({ error: 'That file is not JSON, so not a notebook (.ipynb).' });
        }
        const name = typeof filename === 'string' ? filename.replace(/[^\w .()-]/g, '').slice(0, 120) : '';
        origin = { via: name ? `uploaded file "${name}"` : 'uploaded file' };
      } else {
        return res.status(400).json({ error: 'Send a notebook file (content) or a link (url).' });
      }
      const fallback = typeof filename === 'string' && filename ? filename : 'Notebook';
      const parsed = parseNotebook(json, fallback);
      if ('error' in parsed) return res.status(400).json({ error: `Not imported: ${parsed.error}` });
      const nb = notebookSource(parsed, origin);
      recordIngest(nb);
      res.json({
        success: true,
        source: 'notebook',
        leftOut: parsed.leftOut,
        playlist: { id: `notebook-${nb.youtubeId}`, title: nb.title, description: `Notebook (${parsed.cells} cells), ${origin.via}`, url: nb.url, videos: [nb] },
      });
    } catch (err: any) {
      sendError(res, err, 'Failed to import the notebook');
    }
  });

  // Work done here as a Colab / Jupyter notebook: the sources, the innershell
  // plan (with a Python check of its signature when it was signed) and a
  // knowledge synthesis. Reads only; nothing is stored.
  app.post('/api/notebooks/export', (req: Request, res: Response) => {
    try {
      const { title, sources, logic, boundVideo, knowledge } = req.body || {};
      const list = (Array.isArray(sources) ? sources : []).slice(0, 200).filter((s: any) => typeof s?.rawTranscript === 'string' && s.rawTranscript);
      if (!list.length && !logic && !knowledge) return res.status(400).json({ error: 'Nothing to export: no sources, plan or synthesis.' });
      if (list.reduce((n: number, s: any) => n + s.rawTranscript.length, 0) > 5_000_000) return res.status(413).json({ error: 'The sources are too large to export together (over 5 million characters).' });
      const labelOf = (s: any) =>
        s.isDemo ? 'demo (synthetic)' : `${s.transcriptSource || 'unknown'}${s.transcriptMethod?.model ? ` (${s.transcriptMethod.model})` : ''}${s.transcriptMethod?.via ? `, ${s.transcriptMethod.via}` : ''}`;
      let signed;
      const wm = boundVideo?.watermark;
      if (logic && wm?.manifest && typeof wm.signature === 'string' && typeof boundVideo?.rawTranscript === 'string') {
        const check = verifyProvenance(signingKeys, { directTranscript: boundVideo.rawTranscript, innershellLogic: logic, watermark: wm });
        signed = { manifest: wm.manifest, signature: wm.signature, transcript: boundVideo.rawTranscript, verifiedAtExport: check.watermarkSignatureStatus === 'VERIFIED' };
      }
      const nbTitle = typeof title === 'string' && title.trim() ? title.trim().slice(0, 150) : 'AetherShell export';
      const notebook = buildNotebook({
        title: nbTitle,
        sources: list.map((s: any) => ({
          title: String(s.title || 'Untitled').slice(0, 300),
          url: typeof s.url === 'string' && /^https:\/\//.test(s.url) ? s.url : undefined,
          kind: s.kind === 'notebook' ? 'notebook' : 'video',
          label: labelOf(s),
          rawTranscript: s.rawTranscript,
        })),
        logic: logic || undefined,
        signed,
        publicKey: { pem: signingKeys.publicKeyPem, fingerprint: signingKeys.fingerprint, ephemeral: signingKeys.ephemeral },
        knowledge: knowledge || undefined,
      });
      const filename = `${nbTitle.replace(/[^\w .()-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 80) || 'aethershell'}.ipynb`;
      res.json({ filename, notebook, signedCheck: signed ? (signed.verifiedAtExport ? 'verified' : 'not verified') : 'not signed' });
    } catch (err: any) {
      sendError(res, err, 'Failed to build the notebook');
    }
  });
}
