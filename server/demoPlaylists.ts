// Built-in DEMO playlists. These transcripts are synthetic sample text written
// for demonstrating the pipeline; the YouTube ids are placeholders, not real
// videos. They are always labelled as demo data in API responses and the UI.

export interface DemoVideo {
  id: string;
  youtubeId: string;
  title: string;
  channel: string;
  duration: string;
  url: string;
  rawTranscript?: string;
  segments?: { id: string; start: string; end: string; speaker: string; text: string }[];
}

export interface DemoPlaylist {
  id: string;
  title: string;
  description: string;
  url: string;
  videos: DemoVideo[];
}

export const DEMO_PLAYLISTS: Record<string, DemoPlaylist> = {
  'agentic-cybernetics': {
    id: 'agentic-cybernetics',
    title: 'Agentic Innershells, RCL Loops & Phase Boundaries',
    description: 'Autonomous cognitive boundaries, recursive self-reflection, and structured state induction for persistent agentic runtimes.',
    url: 'https://www.youtube.com/playlist?list=PL_AGENTIC_CYBERNETICS_01',
    videos: [
      {
        id: 'vid-1',
        youtubeId: 'akKz2kLzP8c',
        title: '01. Recursive Cognitive Loops (RCL): Reflexive Decision Structures',
        channel: 'Cognitive Systems Lab',
        duration: '14:22',
        url: 'https://www.youtube.com/watch?v=akKz2kLzP8c',
        segments: [
          {
            id: 'seg-1-1',
            start: '00:00',
            end: '02:30',
            speaker: 'Dr. Aris Thorne',
            text: 'Welcome everyone. When building resilient agentic systems, single-pass forward inferences suffer fatal drift over multi-step workflows. Today we introduce RCL: Recursive Cognitive Loops.',
          },
          {
            id: 'seg-1-2',
            start: '02:30',
            end: '06:15',
            speaker: 'Dr. Aris Thorne',
            text: 'An RCL establishes a three-phase reflexive cycle: initial invariant extraction, topological context verification, and an iterative error gradient correction prior to emitting any executable tool command.',
          },
          {
            id: 'seg-1-3',
            start: '06:15',
            end: '10:45',
            speaker: 'Dr. Elena Rostova',
            text: 'Notice that without Structured State Induction (SSI), the recursive loop risks circular hallucination. SSI provides deterministic grounding by injecting verified environment vectors directly into the working memory lattice.',
          },
          {
            id: 'seg-1-4',
            start: '10:45',
            end: '14:22',
            speaker: 'Dr. Aris Thorne',
            text: 'Finally, all generated logic must undergo cryptographically verifiable binding to the source transcript before token compression occurs, so that the secondary guard shell can enforce invariant proofs.',
          },
        ],
      },
      {
        id: 'vid-2',
        youtubeId: 'b7Yw93Mn9qQ',
        title: '02. Structured State Induction (SSI) & Innershell Memory Lattices',
        channel: 'Agentic Architectures Group',
        duration: '18:50',
        url: 'https://www.youtube.com/watch?v=b7Yw93Mn9qQ',
        segments: [
          {
            id: 'seg-2-1',
            start: '00:00',
            end: '04:10',
            speaker: 'Prof. Marcus Vance',
            text: 'In this session we dissect the Innershell Body. The Innershell is the computational core where context-aware scripts run and persistent state survives between session boundaries.',
          },
          {
            id: 'seg-2-2',
            start: '04:10',
            end: '09:40',
            speaker: 'Prof. Marcus Vance',
            text: 'SSI operates as an active transformer pipeline: it encodes runtime memory, transcript assertions, and external API capabilities into a unified operational context matrix.',
          },
          {
            id: 'seg-2-3',
            start: '09:40',
            end: '14:30',
            speaker: 'Maya Lin, M.Sc.',
            text: 'When the innershell outputs action logic, this logic is strictly confined until passed through the Phase Boundary. The phase boundary tests for data degradation, context drop, and semantic divergence.',
          },
          {
            id: 'seg-2-4',
            start: '14:30',
            end: '18:50',
            speaker: 'Prof. Marcus Vance',
            text: 'Crucially, the logic pertained must be signed with the transcript watermark itself. The watermark holds the signature of the pertained logic before the watermarked transcript is compressed.',
          },
        ],
      },
      {
        id: 'vid-3',
        youtubeId: 'xcL98q1pVxM',
        title: '03. Phase Boundaries & The Second Agentic Guard Shell',
        channel: 'Autonomous Alignment Institute',
        duration: '16:05',
        url: 'https://www.youtube.com/watch?v=xcL98q1pVxM',
        segments: [
          {
            id: 'seg-3-1',
            start: '00:00',
            end: '03:45',
            speaker: 'Dr. Kaelen Cross',
            text: 'The Guard Shell acts as an independent adversarial auditor. It does not blindly trust the innershell output; it holds the uncompressed direct transcripts as uncompromised ground truth.',
          },
          {
            id: 'seg-3-2',
            start: '03:45',
            end: '08:20',
            speaker: 'Dr. Kaelen Cross',
            text: 'By inspecting the decompression certificate and matching the signed watermark hash against the logic payload, the Guard Shell detects any data degradation or silent drift before approving state changes.',
          },
          {
            id: 'seg-3-3',
            start: '08:20',
            end: '12:50',
            speaker: 'Sarah Jenkins',
            text: 'If the Guard Shell detects a discrepancy between the direct transcript and the signed logic output, it immediately initiates a critical feedback loop, locking the phase boundary and forcing the innershell to re-synthesize.',
          },
          {
            id: 'seg-3-4',
            start: '12:50',
            end: '16:05',
            speaker: 'Dr. Kaelen Cross',
            text: 'This dual-shell architecture creates a closed-loop cybernetic system where compression efficiency does not sacrifice formal verification or architectural alignment.',
          },
        ],
      },
    ],
  },
  'cryptographic-llm-shells': {
    id: 'cryptographic-llm-shells',
    title: 'Cryptographic Transcript Watermarking & Semantic Compression',
    description: 'HMAC-SHA256 signatures, zero-width steganography, and token dictionary compression for multi-modal agent environments.',
    url: 'https://www.youtube.com/playlist?list=PL_CRYPTO_LLM_02',
    videos: [
      {
        id: 'vid-c1',
        youtubeId: 'qW9Z1eRt8yU',
        title: '01. Zero-Width Steganography & Canonical Hashes in Transcripts',
        channel: 'InfoSec & AI Labs',
        duration: '11:40',
        url: 'https://www.youtube.com/watch?v=qW9Z1eRt8yU',
        segments: [
          {
            id: 'seg-c1-1',
            start: '00:00',
            end: '05:20',
            speaker: 'Soren Ward',
            text: 'Transcript watermarking requires both machine-readable cryptographic envelopes and invisible payload embedding so that downstream models cannot strip metadata during ingestion.',
          },
          {
            id: 'seg-c1-2',
            start: '05:20',
            end: '11:40',
            speaker: 'Soren Ward',
            text: 'We demonstrate HMAC-SHA256 digests mapped into four zero-width Unicode control codes: U+200B, U+200C, U+200D, and U+FEFF, preserving natural language appearance while guaranteeing provenance.',
          },
        ],
      },
      {
        id: 'vid-c2',
        youtubeId: 'mN3K8xL1vP0',
        title: '02. Lossless & Semantic Token Compression for Agent Context Windows',
        channel: 'Efficiency & Quantization Works',
        duration: '15:15',
        url: 'https://www.youtube.com/watch?v=mN3K8xL1vP0',
        segments: [
          {
            id: 'seg-c2-1',
            start: '00:00',
            end: '07:30',
            speaker: 'Dr. Talia Chen',
            text: 'Compressing long video playlists into compact memory buffers requires a dual strategy: token frequency condensation alongside semantic invariant retention.',
          },
          {
            id: 'seg-c2-2',
            start: '07:30',
            end: '15:15',
            speaker: 'Dr. Talia Chen',
            text: 'Remember our golden rule: Never compress the transcript before binding the pertained logic signature to its watermark. The signature must be irreversibly anchored in the pre-compressed state.',
          },
        ],
      },
    ],
  },
};

for (const pl of Object.values(DEMO_PLAYLISTS)) {
  pl.title = `[DEMO] ${pl.title}`;
  for (const v of pl.videos) {
    if (!v.rawTranscript && v.segments) {
      v.rawTranscript = v.segments.map((s) => `[${s.start} - ${s.end}] ${s.speaker}: ${s.text}`).join('\n\n');
    }
  }
}
