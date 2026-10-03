# AetherShell

Pull caption transcripts from YouTube, have Gemini derive an execution plan
("Innershell logic") from them, sign the transcript and the logic together,
and check the logic against the transcript before it is accepted
("Guard Shell").

## What is real and what is not

| Part | What it does |
| --- | --- |
| Ingestion | Fetches the video's **caption track** (`youtube-transcript-plus`). Playlists are listed with the YouTube Data API. A video without captions gets no transcript; nothing is generated. |
| Demo playlists | The two built-in playlists are **synthetic sample text** with placeholder video ids, labelled `[DEMO]` everywhere. |
| RCL/SSI | N real Gemini passes (1–5). Pass 1 drafts the logic; later passes revise it against the transcript. The per-pass numbers are **measured**: content-word overlap with the transcript and change from the previous pass. |
| Signing | Ed25519 signature (server-held key) over a manifest of SHA-256(transcript) and SHA-256(canonical logic JSON), made **before** DEFLATE compression. Public key at `GET /api/crypto/public-key`. |
| Guard Shell | Passes only if **all** hold: signature verifies and both hashes match; the compressed payload inflates to the exact watermarked text containing the exact transcript; lexical grounding meets the threshold; the Gemini review approves. If Gemini is unavailable the guard **fails closed**. Alpha measures word overlap, Beta word-pair overlap. |
| Lexical grounding | Overlap of vocabulary, not meaning. It catches invented terms; it cannot prove a paraphrase is faithful. That is what the LLM review is for, and that review is a model judgement. |
| Script sandbox | Model-written scripts and imported guard wrappers run in a sandboxed iframe (opaque origin, CSP `default-src 'none'`) inside a Worker with a 2 s timeout: no access to the page, cookies, storage or network. |
| GitHub guards | Only `raw.githubusercontent.com` is fetched (URL parsed and rebuilt, redirects refused). The guard's JS wrapper runs in the sandbox; the Gemini review runs on the server. Both must pass. |
| AetherTwin | Records guard outcomes you actually ran (starts empty). The counterfactual tool replays observed runs with a different grounding limit. It does not predict anything else. |

## Running locally

```bash
npm install
cp .env.example .env   # set GEMINI_API_KEY at least
npm run dev            # http://127.0.0.1:3000
```

* `npm test`: unit tests (signing/verification, tamper cases, URL validation, caption grouping, grounding).
* `npm run lint`: TypeScript check.
* `npm run build && NODE_ENV=production npm start`: production build.

## Deploying

Set `AETHERSHELL_SIGNING_KEY` (otherwise signatures do not survive a restart)
and `AETHERSHELL_ACCESS_TOKEN` (otherwise anyone who can reach the server can
spend your Gemini quota). The rate limiter is in-memory and per-instance. See
`.env.example` for every setting.
