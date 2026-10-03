# anchors/

Bitcoin-anchored timestamps of this repository, made with `npm run anchor`
(see "Proving when" in the [README](../README.md#proving-when-bitcoin-anchored-timestamps)).

- `<id>.json`: the manifest that was timestamped (commit, tree hash, author and licence, optional ledger head)
- `<id>.json.ots`: its OpenTimestamps proof; after `npm run anchor -- upgrade`, it contains the Bitcoin attestation
- `log.jsonl`: an append-only hash chain over the manifests

Never edit, reorder or delete these files. Check them with `npm run anchor -- verify`.
