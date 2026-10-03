# Working in AetherShell

Express + Vite/React app. The server (`server.ts`, `server/`) fetches YouTube
captions, calls Gemini, signs transcript+logic with Ed25519, runs the Guard
Shell, and keeps an append-only run ledger. The browser (`src/`) is the UI.

## First rule: compute, do not narrate

Before answering any question about whether this deployment works, run:

    npm run doctor            # or: npm run doctor -- --json

and report what it says. It checks the Gemini key, the signing key, network
exposure, the YouTube key, the run ledger's hash chain, and guard-failure
drift. If doctor did not say it, you have not verified it; say so.

## Commands

    npm install
    npm run lint              # tsc --noEmit
    npm test                  # node:test via tsx, tests/*.test.ts
    npm run build             # vite build
    npm run dev               # http://127.0.0.1:3000

Run lint and tests before every commit.

## Rules this codebase depends on

1. **Nothing is invented to fill a gap.** No generated transcripts, no
   default scores, no "APPROVED"/"VERIFIED" fallbacks. Missing data is shown
   as missing ("not run", "unknown"). A check that could not run fails closed.
2. **Only the owner changes the guards.** Guard settings live in the
   owner-signed charter (`server/charter.ts`); never read them from the
   environment, hardcode a bypass, or relax a fail-closed branch. You cannot
   sign a charter (the owner key is not on the server). If a guard setting
   looks wrong, propose the change with its reasoning
   (`npm run owner -- propose`) and leave the decision to the owner.
   Concerns the system raises (`server/exchange.ts`) are proposals with
   evidence; answering them is the owner's, never yours.
3. **Model output is untrusted data.** It is never `eval`ed in the page; code
   runs only in `src/utils/sandbox.ts`. Prompts mark inputs as data.
4. **The run ledger is evidence.** `data/ledger.jsonl` (or
   `AETHERSHELL_LEDGER_PATH`) is append-only and hash-chained. Never edit,
   reorder or "clean up" entries. If it fails verification, report it; move
   it aside to start a new chain rather than editing it.
5. **Demo data is labelled.** `server/demoPlaylists.ts` DEMO playlists are
   synthetic and must stay marked `[DEMO]`. Presets list real video ids only.

## Where things are

| Area | Files |
| --- | --- |
| Signing, hashes, guard provenance checks | `server/provenance.ts` |
| Guard Beta's independent verifier (must not import provenance.ts) | `server/witness.ts` |
| Guard charter (owner-signed settings) | `server/charter.ts`, `scripts/owner.ts` |
| Owner ⇄ system exchange (concerns, answers, overrides) | `server/exchange.ts`, `src/components/ExchangePanel.tsx` |
| Run ledger, Merkle head/proofs | `server/runLedger.ts` |
| Drift monitor (e-process) | `server/eprocess.ts` |
| Deployment self-check | `server/doctor.ts`, `scripts/doctor.ts` |
| YouTube captions / playlists | `server/youtube.ts` |
| GitHub guard URL validation | `server/github.ts` |
| Browser sandbox for untrusted code | `src/utils/sandbox.ts` |
| Playlist JSON export | `src/utils/playlistExport.ts` |
