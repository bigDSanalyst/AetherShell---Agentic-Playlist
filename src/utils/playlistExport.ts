import type { InnershellLogic, PlaylistData } from '../types';

// Same canonical form as server/provenance.ts canonicalJson: keys sorted
// recursively, undefined dropped from objects and nulled in arrays.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return '[' + value.map((v) => canonicalJson(v === undefined ? null : v)).join(',') + ']';
  const obj = value as Record<string, unknown>;
  return (
    '{' +
    Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k]))
      .join(',') +
    '}'
  );
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface SignerInfo {
  algorithm: string;
  publicKeyPem: string;
  fingerprint: string;
  ephemeral: boolean;
}

// One JSON document with every video's compressed transcript and the logic
// that was signed with it. Signatures are carried as-is; the logic hash is
// re-checked here so a mismatch is visible in the file itself.
export async function buildPlaylistExport(
  playlist: PlaylistData,
  opts: { currentLogic?: InnershellLogic | null; signer?: SignerInfo | null; signerError?: string | null } = {}
) {
  const videos = await Promise.all(
    playlist.videos.map(async (v, index) => {
      const wm = v.watermark;
      const signed = !!(wm?.manifest && wm.signature);
      const logic = v.boundLogic ?? null;
      let logicSha256Matches: boolean | null = null;
      if (signed && logic && wm?.manifest?.logicSha256) {
        logicSha256Matches = (await sha256Hex(canonicalJson(logic))) === wm.manifest.logicSha256;
      }
      return {
        index,
        id: v.id,
        youtubeId: v.youtubeId,
        title: v.title,
        channel: v.channel,
        duration: v.duration || null,
        uploadDate: v.uploadDate || null,
        url: v.url,
        transcriptSource: playlist.isDemo ? 'demo-synthetic' : v.transcriptSource || null,
        status: signed ? 'signed' : 'not_signed',
        watermark: signed
          ? {
              watermarkId: wm!.watermarkId,
              manifest: wm!.manifest,
              signature: wm!.signature,
              signatureAlgorithm: wm!.signatureAlgorithm,
              publicKeyFingerprint: wm!.publicKeyFingerprint ?? null,
            }
          : null,
        // compressedBase64 inflates (zlib) to the full watermarked transcript.
        compressedTranscript: v.compressedTranscript ?? null,
        synthesizedLogic: logic,
        checks: { logicSha256MatchesManifest: logicSha256Matches },
      };
    })
  );

  const signedCount = videos.filter((v) => v.status === 'signed').length;
  return {
    format: 'aethershell-playlist-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    playlist: {
      id: playlist.id,
      title: playlist.title,
      url: playlist.url,
      isDemo: !!playlist.isDemo,
      videoCount: playlist.videos.length,
    },
    signer: opts.signer ?? null,
    signerError: opts.signerError ?? null,
    summary: {
      videos: videos.length,
      signed: signedCount,
      notSigned: videos.length - signedCount,
      withCompressedTranscript: videos.filter((v) => v.compressedTranscript).length,
      logicHashMismatches: videos.filter((v) => v.checks.logicSha256MatchesManifest === false).length,
    },
    // Logic currently in the Innershell; it is only bound to a video once signed.
    currentInnershellLogic: opts.currentLogic ?? null,
    verification:
      'For each signed video: SHA-256 of canonical JSON (sorted keys) of synthesizedLogic must equal manifest.logicSha256; ' +
      'inflating compressedTranscript.compressedBase64 gives the watermarked text, which contains the transcript whose SHA-256 is manifest.transcriptSha256; ' +
      'the Ed25519 signature (base64) is over canonical JSON of manifest and verifies with signer.publicKeyPem.',
    videos,
  };
}
