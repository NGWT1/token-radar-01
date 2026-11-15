# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/NGWT1/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/NGWT1/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: the complete pre-token protocol universe from a sealed DefiLlama snapshot, ranked by an implied value the snapshot's own live-token prices calibrate, with a concrete farm plan for each protocol. The board covers all 40 watchlist protocols and every other genuine pre-token protocol in the snapshot (198 rows), sets the wrapped, staked and bridged products aside with their reasons, and shows the live-token protocols separately with their market caps.

The model (radar-2) scores every row with one function of the snapshot figures: TVL times a category multiple calibrated on the snapshot's live-token median market-cap-to-TVL ratios (shrunk toward the overall median for thin categories), times a log-dampened seven-day growth factor, times a log-curved maturity factor for how long the protocol has run with no token, times a small multi-chain premium. No protocol name is special-cased. The dashboard recomputes every row from the same figures, shows the calibration table, and offers a sandbox that re-ranks the board under other constants.

## Run it

```sh
node main.ts
```

The grader runs it with the sealed snapshot mounted at `/input` and an empty `/output`. To run it locally against the kit's snapshot:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
```

It writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` to the output directory. Node 22.18 or later, standard library only, no network.

## Layout

- `main.ts` — the entrypoint: reads the snapshot, writes the board, the dashboard data and the dossier.
- `lib/model.ts` — the model: calibration, implied value, board, farm plans, snapshot parsing.
- `vendor/makefun-board.ts` — make.fun's dossier library, as the kit ships it.
- `dashboard/` — the static page (no network): the board, filters, per-protocol detail, the model and its sandbox.
- `screenshots/` — the board, a protocol's detail view and a filtered view.

---

Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards
