// The token radar's model (radar-2): one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and every
// other genuine pre-token protocol in the snapshot: the complete pre-token universe, nothing left
// out. A protocol is pre-token when its record carries no token (no market cap, no CoinGecko id, no
// symbol). A pre-token protocol is genuine when the house's own watchlist rule would keep it: not a
// wrapped, staked or bridged product of a token that already trades, not a versioned pool, not an
// exchange's product. The snapshot's live-token protocols are kept apart and shown with the market's
// own values, never mixed into the ranked board.
//
// Implied value follows only from the snapshot's own figures, in three parts:
//
//   1. Calibration. The base multiple is not a guess: it is the median market-cap-to-TVL ratio of
//      the snapshot's own live-token protocols in the same category, shrunk toward the overall
//      median when a category has few live protocols, and clamped to [0.05, 1.00]. A category with
//      no live protocol takes the overall median. Each category's median is winsorized to
//      [0.02, 2.00] before shrinkage, so one thin category's outlier cannot set the multiple.
//      The market prices Dexs differently from Lending, and the model lets the snapshot say so.
//   2. Growth, log-dampened. A week's TVL change is evidence, not a promise: a +120% spike must not
//      double a value, and a -60% bleed must not erase one. growthMult = 1 + 0.5 * ln(1 + g/100),
//      clamped to [0.50, 1.60], with g the 7-day change clamped to [-60, +120].
//   3. Maturity, log-curved. Survival is mostly proven in the first year; later years add slowly.
//      maturityMult = 0.55 + 0.45 * ln(1 + age) / ln(1 + 1095), age in days capped at 1095.
//      A protocol with no listing date takes 180 days of credit, not a full year.
//   4. Breadth. Each chain past the first adds 3%, up to five extra chains: another market is
//      worth a little, never much.
//
//   implied = max(1, round(tvl_usd x multiple x growthMult x maturityMult x chainsMult))
//
// No protocol name is ever special-cased: the same function scores every row, and the dashboard
// recomputes every row from the same figures, so the page's code and the board's data agree.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  growth_mult_floor: number;
  growth_mult_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  chain_step: number;
  chain_max_extra: number;
  shrink_k: number;
  median_floor: number;
  median_cap: number;
  multiple_floor: number;
  multiple_cap: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  growth_mult_floor: 0.5,
  growth_mult_cap: 1.6,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 1095,
  unknown_age_days: 180,
  chain_step: 0.03,
  chain_max_extra: 5,
  shrink_k: 5,
  median_floor: 0.02,
  median_cap: 2.0,
  multiple_floor: 0.05,
  multiple_cap: 1.0,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One row of the calibration table: a category's live-token comps and the multiple they imply. */
export interface CalibrationRow {
  category: string;
  live_n: number;
  median_mcap_tvl: number | null;
  multiple: number;
}

/** The calibration: the overall median and one row per category the board ranks. */
export interface Calibration {
  overall_median: number;
  live_n: number;
  rows: CalibrationRow[];
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  on_watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    multiple: number;
    multiple_live_n: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chains_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  implied_value_usd: number;
  multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chains_multiplier: number;
  on_watchlist: boolean;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  mcap_tvl: number | null;
  change_7d: number | null;
}

/** A pre-token protocol the board sets aside, with the rule that set it aside. */
export interface ExcludedRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  reason: string;
}

/** Everything the dashboard needs: the board, the live set, the set-aside set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  excluded_size: number;
  calibration: Calibration;
  rows: RadarRow[];
  live: LiveRow[];
  excluded: ExcludedRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty list of numbers; null when there is nothing to take the median of. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The median market-cap-to-TVL ratio the snapshot's own live-token protocols imply, by category. */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): Calibration {
  const live = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const overall = median(live.map((p) => p.mcap_usd! / p.tvl_usd)) ?? 0.25;
  const byCategory = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? 'Other';
    const list = byCategory.get(key) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    byCategory.set(key, list);
  }
  // Every category the board ranks gets a row, including ones with no live protocol at all.
  const ranked = new Set<string>();
  for (const p of snapshot.protocols) if (isGenuinePreToken(p)) ranked.add(p.category ?? 'Other');
  const rows: CalibrationRow[] = [...ranked].sort().map((category) => {
    const comps = byCategory.get(category) ?? [];
    const med = median(comps);
    // Winsorize first: a thin category's median of 400x is a data quirk, not a price.
    const winsorized = med === null ? null : Math.min(model.median_cap, Math.max(model.median_floor, med));
    const shrunk = winsorized === null ? overall : (comps.length * winsorized + model.shrink_k * overall) / (comps.length + model.shrink_k);
    const multiple = Math.min(model.multiple_cap, Math.max(model.multiple_floor, shrunk));
    return { category, live_n: comps.length, median_mcap_tvl: med === null ? null : round4(med), multiple: round4(multiple) };
  });
  return { overall_median: round4(overall), live_n: live.length, rows };
}

/** The multiple one category's rows are scored with, from the calibration. */
export function multipleFor(category: string | null, calibration: Calibration, model: ModelConstants = MODEL): number {
  const row = calibration.rows.find((r) => r.category === (category ?? 'Other'));
  if (row !== undefined) return row.multiple;
  return Math.min(model.multiple_cap, Math.max(model.multiple_floor, calibration.overall_median));
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The multipliers and the implied value one protocol gets under `model` and `calibration`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  calibration: Calibration,
  model: ModelConstants = MODEL,
): { implied: number; multiple: number; multipleLiveN: number; growthPct: number; growthMult: number; maturityMult: number; chainsMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const multiple = multipleFor(protocol.category, calibration, model);
  const calRow = calibration.rows.find((r) => r.category === (protocol.category ?? 'Other'));
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = Math.min(model.growth_mult_cap, Math.max(model.growth_mult_floor, 1 + model.growth_weight * Math.log(1 + growthPct / 100)));
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor +
    (Math.log(1 + Math.min(Math.max(ageForModel, 0), model.maturity_days)) / Math.log(1 + model.maturity_days)) * model.maturity_range;
  const chainsMult = 1 + model.chain_step * Math.min(Math.max(protocol.chains.length - 1, 0), model.chain_max_extra);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * growthMult * maturityMult * chainsMult));
  return { implied, multiple, multipleLiveN: calRow === undefined ? 0 : calRow.live_n, growthPct, growthMult, maturityMult, chainsMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** Categories the house's watchlist rule reads as a wrapped, staked or bridged product. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
/** A name carrying one of these whole words is a wrapped or staked product, not a launch of its own. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** A name beginning with an exchange's name is that exchange's product. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Why a pre-token protocol is not a genuine launch candidate, or null when it is one. */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (!isPreToken(p)) return 'token already trades';
  if (p.category === 'CEX') return 'centralised exchange product';
  if (p.category !== null && ['Bridge', 'Canonical Bridge'].includes(p.category)) return 'bridge product of a token that trades';
  if (p.category !== null && ['Liquid Staking', 'Liquid Restaking', 'Restaked BTC'].includes(p.category)) return 'staked product of a token that trades';
  if (VERSIONED.test(p.name)) return 'versioned pool of another protocol';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped or staked product of a token that trades';
  if (EXCHANGE_PREFIX.test(p.name)) return "an exchange's product, not a launch of its own";
  return null;
}

/** Whether a protocol is one the board may rank: pre-token and genuine, by the house's own rule. */
export function isGenuinePreToken(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !PRODUCT_CATEGORIES.has(p.category ?? '') && !VERSIONED.test(p.name) && !WRAPPED_WORD.test(p.name) && !EXCHANGE_PREFIX.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const calibration = calibrate(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other genuine pre-token protocol in the snapshot, not a capped top slice.
  // A chosen protocol stays chosen; the board is the complete pre-token universe.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isGenuinePreToken(p)) chosen.set(p.slug, p);
  }

  const watchlist = new Set(snapshot.watchlist);
  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, calibration, model);
    return { p, v };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    on_watchlist: watchlist.has(s.p.slug),
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      multiple: s.v.multiple,
      multiple_live_n: s.v.multipleLiveN,
      growth_pct: s.v.growthPct,
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.maturityMult),
      chains_multiplier: round4(s.v.chainsMult),
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      mcap_tvl: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
      change_7d: p.change_7d,
    }));
}

/** The pre-token protocols the board sets aside, each with the rule that set it aside. */
export function excludedRows(snapshot: Snapshot, board: BoardRow[]): ExcludedRow[] {
  const ranked = new Set(board.map((r) => r.slug));
  return snapshot.protocols
    .filter((p) => isPreToken(p) && !ranked.has(p.slug))
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, reason: exclusionReason(p) ?? 'not ranked' }))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What one ordinary transaction costs on a chain, in whole US dollars, approximate 2026 fees. */
export const GAS_USD: Record<string, number> = {
  Ethereum: 6.0,
  Solana: 0.01,
  Base: 0.05,
  Arbitrum: 0.1,
  Optimism: 0.05,
  Binance: 0.15,
  Avalanche: 0.1,
  Polygon: 0.02,
  Monad: 0.01,
  'Hyperliquid L1': 0.01,
  Berachain: 0.02,
  Plasma: 0.02,
  'Robinhood Chain': 0.05,
  Linea: 0.02,
  zkSync: 0.05,
  Scroll: 0.05,
  Blast: 0.05,
  Mantle: 0.02,
  Sei: 0.01,
  Sui: 0.01,
  Aptos: 0.01,
  Tron: 0.1,
  Fantom: 0.02,
  Gnosis: 0.01,
};
const GAS_DEFAULT = 0.5;

/** One transaction's gas on the protocol's main chain, as a dollar figure a farmer can budget. */
export function gasFor(chain: string): number {
  return GAS_USD[chain] ?? GAS_DEFAULT;
}

/** A dollar figure with cents, trimmed: $6, $0.15, $0.01. */
export function fmtGas(n: number): string {
  return n >= 1 ? `$${Number(n.toFixed(2))}` : `$${n.toFixed(2)}`;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** A category's own plan: its main action, its weekly action, and the risk to check first. */
interface CategoryPlan {
  action: string;
  recurring: string;
  risk: string;
}

/** The plan template for a category, matched on the category's words, most specific first. */
export function planFor(category: string | null): CategoryPlan {
  const c = (category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return {
      action: 'Supply ${capital} of USDC to ${name} on ${chain} and leave it earning interest.',
      recurring: 'Top up the supply or run one small borrow-and-repay cycle each week, so the wallet stays active.',
      risk: 'Keep the loan health factor above 2 and never borrow more than half of what you supplied: one liquidation costs more than any airdrop.',
    };
  }
  if (c.includes('dex') || c.includes('liquidity manager') || c.includes('leveraged farm')) {
    return {
      action: "Provide ${capital} of liquidity to ${name}'s largest pool on ${chain} and keep the position open.",
      recurring: 'Check the pool range once a week and rebalance only when the price has left it.',
      risk: 'Impermanent loss is real: only pool pairs you would hold anyway, and check the pool fees cover it before you add more.',
    };
  }
  if (c.includes('yield aggregator') || c.includes('yield')) {
    return {
      action: "Deposit ${capital} into ${name}'s highest-TVL vault on ${chain} and hold the receipt.",
      recurring: 'Harvest the yield once a week and re-deposit it, so the balance compounds instead of sitting idle.',
      risk: 'Check what the yield is paid in: a vault paying only its own unlaunched points is a promise, not income.',
    };
  }
  if (c.includes('curator') || c.includes('allocator')) {
    return {
      action: 'Deposit ${capital} into a ${name} vault on ${chain} and hold the shares.',
      recurring: "Review the vault's current allocation once a week and move on if its strategy has drifted.",
      risk: "A curator's vault follows its manager's calls: read the current allocation before you deposit, not after.",
    };
  }
  if (c.includes('rwa')) {
    return {
      action: "Mint ${capital} of ${name}'s yield asset on ${chain} and hold it.",
      recurring: 'Check the backing report once a week, so a change in the underlying is never a surprise.',
      risk: 'RWA yield depends on off-chain backing: confirm the custodian and the latest attestation before you size up.',
    };
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis')) {
    return {
      action: 'Deposit ${capital} of USDC as margin on ${name} and open one small hedged position.',
      recurring: 'Roll the hedge once a week and close it before funding turns against you.',
      risk: 'Use at most 2x leverage and keep the liquidation price far from the market: a wipeout ends the farm.',
    };
  }
  if (c.includes('staking') || c.includes('restak')) {
    return {
      action: "Stake ${capital} of the chain's staking asset through ${name} and keep the receipt token.",
      recurring: 'Restake the staking rewards once a week, so the receipt balance keeps growing.',
      risk: 'Note the unstaking delay before you stake: a 7-day unlock means the position cannot exit fast.',
    };
  }
  if (c.includes('stable')) {
    return {
      action: 'Mint or deposit ${capital} of the stable asset through ${name} on ${chain}.',
      recurring: 'Check the peg and the backing once a week, and leave if either slips twice in a row.',
      risk: 'A stable asset is only as good as its backing: confirm the peg held through the last volatile week.',
    };
  }
  if (c.includes('prediction')) {
    return {
      action: 'Fund ${capital} and place one market position on ${name}.',
      recurring: 'Settle or roll the position once a week, and never let an expired market hold your funds.',
      risk: 'Prediction markets pay the majority: size the position as a ticket, not an investment.',
    };
  }
  if (c.includes('chain')) {
    return {
      action: "Bridge ${capital} to ${name}'s chain and use its native app once, end to end.",
      recurring: 'Make one on-chain action each week, such as a swap, a stake or a vote.',
      risk: "A new chain's apps are unaudited more often than not: keep the farmed amount small until one has been reviewed.",
    };
  }
  if (c.includes('insurance')) {
    return {
      action: 'Buy ${capital} of cover from ${name} on ${chain} and keep the policy.',
      recurring: "Check the policy's expiry and the claims queue once a week, so a claim is never late.",
      risk: 'Read what the cover excludes before you buy: the exclusions decide whether a claim pays.',
    };
  }
  if (c.includes('payment') || c.includes('card')) {
    return {
      action: 'Fund ${capital} through ${name} on ${chain} and make one real payment with it.',
      recurring: 'Use the card or rail once a week for a real purchase, so the activity is genuine.',
      risk: 'Keep only spending money on a payments app: it is a wallet, not a vault.',
    };
  }
  if (c.includes('index')) {
    return {
      action: "Buy ${capital} of ${name}'s index on ${chain} and hold it.",
      recurring: "Check the index's rebalance once a week, so a weights change is never a surprise.",
      risk: "An index follows its weights: know the top three holdings before you buy.",
    };
  }
  if (c.includes('farm')) {
    return {
      action: "Deposit ${capital} into ${name}'s farm on ${chain} and stake the receipt.",
      recurring: 'Harvest and re-stake once a week, so the rewards compound instead of sitting idle.',
      risk: 'Farm rewards fall as more capital arrives: check the current rate, not the launch rate.',
    };
  }
  return {
    action: 'Deposit ${capital} of USDC into ${name} on ${chain} and keep the position open.',
    recurring: 'Make one qualifying action each week, such as a deposit, a swap or a vote.',
    risk: "Start small and read the protocol's own docs before you size up: the docs say what counts.",
  };
}

/** Fill a plan template's ${name}, ${chain} and ${capital}. */
function fill(template: string, p: SnapshotProtocol, chain: string, capital: number): string {
  return template.replaceAll('${name}', p.name).replaceAll('${chain}', chain).replaceAll('${capital}', `$${capital}`);
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names: the category picks the action and the risk, the chain prices the gas, the TVL sizes the
 * capital, and the age sets the hold.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const gas = fmtGas(gasFor(chain));
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const plan = planFor(p.category);
  return [
    {
      text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.',
      cost: `about ${gas} of gas for the first transaction`,
      time: '5 minutes',
    },
    {
      text: fill(plan.action, p, chain, capital),
      cost: `$${capital} of capital and about ${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: plan.risk,
      cost: 'nothing but the reading',
      time: '10 minutes',
    },
    {
      text: plan.recurring,
      cost: `about ${gas} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.',
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    multiple: row.model.multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chains_multiplier: row.model.chains_multiplier,
    on_watchlist: row.on_watchlist,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const excluded = excludedRows(snapshot, board);
  const calibration = calibrate(snapshot, model);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    excluded_size: excluded.length,
    calibration,
    rows: board.map(radarRow),
    live,
    excluded,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside the gate's 100..4000`;
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'two rows share a slug';
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (!known.has(r.slug)) return `${r.slug} is not one of the snapshot's protocols`;
    if (/\s/.test(r.slug) || r.slug.length < 1 || r.slug.length > 128) return `${r.slug} is not a valid slug`;
    if (typeof r.name !== 'string' || r.name.length === 0) return `${r.slug} has no name`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
