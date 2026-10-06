// The transcript archive: library, export/import, combining kept sources into a set.
import type { Express, Request, Response } from 'express';
import path from 'path';
import { collectionId } from '../corpus';
import { isSourceId } from '../notebook';
import { bareVideo, runLedger, transcriptArchive } from '../core';

export function registerTranscriptsRoutes(app: Express) {
  // Every transcript this server has kept, to pick from and combine.
  app.get('/api/transcripts/library', (_req: Request, res: Response) => {
    res.json({ videos: transcriptArchive.list(), path: transcriptArchive.path, problems: transcriptArchive.loadProblems });
  });

  // The whole archive as one file, to keep somewhere that survives this server
  // (the phone's Downloads, Google Drive) and restore after a fresh start.
  app.get('/api/transcripts/export', (_req: Request, res: Response) => {
    const file = transcriptArchive.exportFile();
    res.setHeader('Content-Disposition', `attachment; filename="aethershell-transcripts-${file.exportedAt.slice(0, 10)}.json"`);
    res.json(file);
  });

  // Restore an archive file. Entries are checked against their hashes; each
  // restored one is recorded in the ledger as imported, so its source label is
  // signed as stated by the file ("(imported)"), not as observed here.
  app.post('/api/transcripts/import', (req: Request, res: Response) => {
    const result = transcriptArchive.importFile(req.body);
    for (const e of result.added) {
      try {
        runLedger.append('ingest', {
          videoId: e.videoId,
          transcriptSha256: e.transcriptSha256,
          source: e.source,
          model: e.model,
          via: e.via,
          imported: true,
        });
      } catch (err: any) {
        console.warn(`[ledger] could not record import of ${e.videoId}: ${err.message}`);
      }
    }
    const status = result.rejected.length && !result.added.length && !result.alreadyHere ? 400 : 200;
    res.status(status).json({
      added: result.added.map((e) => ({ videoId: e.videoId, title: e.title })),
      alreadyHere: result.alreadyHere,
      keptLocal: result.keptLocal,
      rejected: result.rejected,
    });
  });

  // Several archived videos as one set for the knowledge engine and innershell.
  // The same videos always give the same id.
  app.post('/api/transcripts/collection', (req: Request, res: Response) => {
    const ids: string[] = Array.isArray(req.body?.videoIds) ? req.body.videoIds.map(String).filter((id: string) => isSourceId(id)) : [];
    const unique = [...new Set(ids)].slice(0, 200);
    if (!unique.length) return res.status(400).json({ error: 'videoIds: one or more YouTube video or notebook ids are required' });
    const missing = unique.filter((id) => !transcriptArchive.get(id));
    const videos = unique.filter((id) => !missing.includes(id)).map((id) => transcriptArchive.restore(bareVideo(id), transcriptArchive.get(id)!));
    if (!videos.length) return res.status(404).json({ error: 'None of these videos is in the archive.', missing });
    const title = typeof req.body?.title === 'string' && req.body.title.trim() ? req.body.title.trim().slice(0, 200) : `Collection of ${videos.length} video(s)`;
    res.json({
      playlist: {
        id: collectionId(videos.map((v) => v.youtubeId)),
        title,
        description: `Combined from the transcript archive: ${videos.map((v) => v.title).join(' · ').slice(0, 1000)}`,
        url: '',
        videos,
      },
      missing,
    });
  });
}
