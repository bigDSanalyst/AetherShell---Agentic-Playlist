# Contributing to AetherShell

Thanks for helping. This project's whole point is that its claims can be
checked, so contributions are held to that too.

## Before you open a pull request

```bash
npm install
npm run lint     # tsc --noEmit
npm test         # node:test via tsx, tests/*.test.ts
npm run build    # vite build
```

CI runs the same three on every pull request. Add or update tests for what
you change; a behaviour without a test is a claim, not a fact.

To check a running deployment (keys, charter, ledger, quota), run
`npm run doctor`. Report what it says rather than what you expect.

## The rules the code depends on

These are in [CLAUDE.md](CLAUDE.md); a change that breaks one will not be merged.

1. **Nothing is invented to fill a gap.** Transcripts are never invented. A
   machine transcription of the video's actual audio is allowed only when
   labelled with method and model, never presented as captions. No default
   scores or "APPROVED"/"VERIFIED" fallbacks. Missing data is shown as
   missing. A check that cannot run fails closed.
2. **Only the owner changes the guards.** Guard settings live in the
   owner-signed charter (`server/charter.ts`). Do not read them from the
   environment, add a bypass, or relax a fail-closed branch. To suggest a
   different setting, explain it in an issue or run
   `npm run owner -- propose --charter <file> --set key=value` against a
   server to see what it would change; signing is the owner's decision.
3. **Model output is untrusted data.** Never `eval` it in the page; code runs
   only in `src/utils/sandbox.ts`. Prompts mark inputs as data.
4. **The run ledger is evidence.** Never edit, reorder or "clean up"
   `data/ledger.jsonl`. If it fails verification, move it aside.
5. **Demo data stays labelled** `[DEMO]`. Presets list real video ids only.

## Things that are easy to get wrong

- `server/witness.ts` must not import `server/provenance.ts`: it is the
  independent second implementation. A test enforces this.
- Learning (`server/learning.ts`) may shape the next synthesis but never reads
  or changes the charter.
- Never commit keys. `.env`, the owner private key, and the server signing key
  stay out of the repository. The owner key never goes on a server.
- `anchors/` is a hash-chained record of Bitcoin-anchored timestamps. Never
  edit, reorder or delete its files; add to it only with `npm run anchor`.
- Do not hand-edit lockfiles; regenerate them with `npm install` / `bun install`.

## Licence of contributions

AetherShell is licensed under AGPL-3.0-only. By contributing, you agree that your
contribution is licensed under the same terms.

## Where things are

See the table at the end of [CLAUDE.md](CLAUDE.md) and the diagram in the
[README](README.md#how-it-fits-together).
