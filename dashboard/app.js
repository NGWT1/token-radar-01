// Token Radar's dashboard (radar-2). It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a filterable table, a per-protocol detail drawer with the model's own
// inputs and the protocol's farm plan, and a sandbox that re-ranks the board under other constants.
// No network: every byte it shows is in data.js.
//
// The page recomputes every row's implied value from the snapshot figures (impliedOf, below), with
// the same arithmetic main.ts runs, so the page's code and the board's data are visibly the same
// model. The multiple each row carries is not a guess: main.ts calibrates it from the snapshot's own
// live-token protocols (the median market-cap-to-TVL ratio of the row's category, shrunk toward the
// overall median when the category has few live protocols, clamped to [0.05, 1.00]), and the model
// panel below the board shows that calibration table whole.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = {
    q: '', category: 'all', chain: 'all', watchlistOnly: false, tab: 'pre-token',
    sort: 'implied', dir: -1, selected: null,
    sandbox: { growth_weight: DATA.model.growth_weight, maturity_floor: DATA.model.maturity_floor, chain_step: DATA.model.chain_step }
  };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(2) + 'x';
  }
  function fmtGas(n) {
    return n >= 1 ? '$' + Number(n.toFixed(2)) : '$' + n.toFixed(2);
  }

  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same
  // arithmetic. Growth is log-dampened, maturity is log-curved, breadth adds 3% a chain.
  // `model` is DATA.model, or the sandbox's constants when the reader has moved a slider.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = Math.min(model.growth_mult_cap, Math.max(model.growth_mult_floor, 1 + model.growth_weight * Math.log(1 + growth / 100)));
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.log(1 + Math.min(Math.max(age, 0), model.maturity_days)) / Math.log(1 + model.maturity_days)) * model.maturity_range;
    var chainsMult = 1 + model.chain_step * Math.min(Math.max((row.chains || []).length - 1, 0), model.chain_max_extra);
    return Math.max(1, Math.round(row.tvl_usd * row.multiple * growthMult * maturity * chainsMult));
  }
  function sandboxModel() {
    var m = {};
    Object.keys(DATA.model).forEach(function (k) { m[k] = DATA.model[k]; });
    m.growth_weight = state.sandbox.growth_weight;
    m.maturity_floor = state.sandbox.maturity_floor;
    m.chain_step = state.sandbox.chain_step;
    return m;
  }
  function sandboxActive() {
    return state.sandbox.growth_weight !== DATA.model.growth_weight ||
      state.sandbox.maturity_floor !== DATA.model.maturity_floor ||
      state.sandbox.chain_step !== DATA.model.chain_step;
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: the category picks the
  // action and the risk, the chain prices the gas, the TVL sizes the capital, the age sets the
  // hold. No name is special-cased. These templates mirror lib/model.ts word for word.
  var GAS_USD = {
    Ethereum: 6.0, Solana: 0.01, Base: 0.05, Arbitrum: 0.1, Optimism: 0.05, Binance: 0.15,
    Avalanche: 0.1, Polygon: 0.02, Monad: 0.01, 'Hyperliquid L1': 0.01, Berachain: 0.02,
    Plasma: 0.02, 'Robinhood Chain': 0.05, Linea: 0.02, zkSync: 0.05, Scroll: 0.05,
    Blast: 0.05, Mantle: 0.02, Sei: 0.01, Sui: 0.01, Aptos: 0.01, Tron: 0.1, Fantom: 0.02,
    Gnosis: 0.01
  };
  function gasFor(chain) { return GAS_USD[chain] === undefined ? 0.5 : GAS_USD[chain]; }
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function planFor(category) {
    var c = (category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return {
      action: 'Supply ${capital} of USDC to ${name} on ${chain} and leave it earning interest.',
      recurring: 'Top up the supply or run one small borrow-and-repay cycle each week, so the wallet stays active.',
      risk: 'Keep the loan health factor above 2 and never borrow more than half of what you supplied: one liquidation costs more than any airdrop.'
    };
    if (c.indexOf('dex') >= 0 || c.indexOf('liquidity manager') >= 0 || c.indexOf('leveraged farm') >= 0) return {
      action: "Provide ${capital} of liquidity to ${name}'s largest pool on ${chain} and keep the position open.",
      recurring: 'Check the pool range once a week and rebalance only when the price has left it.',
      risk: 'Impermanent loss is real: only pool pairs you would hold anyway, and check the pool fees cover it before you add more.'
    };
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('yield') >= 0) return {
      action: "Deposit ${capital} into ${name}'s highest-TVL vault on ${chain} and hold the receipt.",
      recurring: 'Harvest the yield once a week and re-deposit it, so the balance compounds instead of sitting idle.',
      risk: 'Check what the yield is paid in: a vault paying only its own unlaunched points is a promise, not income.'
    };
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return {
      action: 'Deposit ${capital} into a ${name} vault on ${chain} and hold the shares.',
      recurring: "Review the vault's current allocation once a week and move on if its strategy has drifted.",
      risk: "A curator's vault follows its manager's calls: read the current allocation before you deposit, not after."
    };
    if (c.indexOf('rwa') >= 0) return {
      action: "Mint ${capital} of ${name}'s yield asset on ${chain} and hold it.",
      recurring: 'Check the backing report once a week, so a change in the underlying is never a surprise.',
      risk: 'RWA yield depends on off-chain backing: confirm the custodian and the latest attestation before you size up.'
    };
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis') >= 0) return {
      action: 'Deposit ${capital} of USDC as margin on ${name} and open one small hedged position.',
      recurring: 'Roll the hedge once a week and close it before funding turns against you.',
      risk: 'Use at most 2x leverage and keep the liquidation price far from the market: a wipeout ends the farm.'
    };
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return {
      action: "Stake ${capital} of the chain's staking asset through ${name} and keep the receipt token.",
      recurring: 'Restake the staking rewards once a week, so the receipt balance keeps growing.',
      risk: 'Note the unstaking delay before you stake: a 7-day unlock means the position cannot exit fast.'
    };
    if (c.indexOf('stable') >= 0) return {
      action: 'Mint or deposit ${capital} of the stable asset through ${name} on ${chain}.',
      recurring: 'Check the peg and the backing once a week, and leave if either slips twice in a row.',
      risk: 'A stable asset is only as good as its backing: confirm the peg held through the last volatile week.'
    };
    if (c.indexOf('prediction') >= 0) return {
      action: 'Fund ${capital} and place one market position on ${name}.',
      recurring: 'Settle or roll the position once a week, and never let an expired market hold your funds.',
      risk: 'Prediction markets pay the majority: size the position as a ticket, not an investment.'
    };
    if (c.indexOf('chain') >= 0) return {
      action: "Bridge ${capital} to ${name}'s chain and use its native app once, end to end.",
      recurring: 'Make one on-chain action each week, such as a swap, a stake or a vote.',
      risk: "A new chain's apps are unaudited more often than not: keep the farmed amount small until one has been reviewed."
    };
    if (c.indexOf('insurance') >= 0) return {
      action: 'Buy ${capital} of cover from ${name} on ${chain} and keep the policy.',
      recurring: "Check the policy's expiry and the claims queue once a week, so a claim is never late.",
      risk: 'Read what the cover excludes before you buy: the exclusions decide whether a claim pays.'
    };
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return {
      action: 'Fund ${capital} through ${name} on ${chain} and make one real payment with it.',
      recurring: 'Use the card or rail once a week for a real purchase, so the activity is genuine.',
      risk: 'Keep only spending money on a payments app: it is a wallet, not a vault.'
    };
    if (c.indexOf('index') >= 0) return {
      action: "Buy ${capital} of ${name}'s index on ${chain} and hold it.",
      recurring: "Check the index's rebalance once a week, so a weights change is never a surprise.",
      risk: 'An index follows its weights: know the top three holdings before you buy.'
    };
    if (c.indexOf('farm') >= 0) return {
      action: "Deposit ${capital} into ${name}'s farm on ${chain} and stake the receipt.",
      recurring: 'Harvest and re-stake once a week, so the rewards compound instead of sitting idle.',
      risk: 'Farm rewards fall as more capital arrives: check the current rate, not the launch rate.'
    };
    return {
      action: 'Deposit ${capital} of USDC into ${name} on ${chain} and keep the position open.',
      recurring: 'Make one qualifying action each week, such as a deposit, a swap or a vote.',
      risk: "Start small and read the protocol's own docs before you size up: the docs say what counts."
    };
  }
  function fill(template, p, chain, capital) {
    return template.split('${name}').join(p.name).split('${chain}').join(chain).split('${capital}').join('$' + capital);
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var gas = fmtGas(gasFor(chain));
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var plan = planFor(p.category);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'about ' + gas + ' of gas for the first transaction', time: '5 minutes' },
      { text: fill(plan.action, p, chain, capital), cost: '$' + capital + ' of capital and about ' + gas + ' of gas', time: '15 minutes to set up' },
      { text: plan.risk, cost: 'nothing but the reading', time: '10 minutes' },
      { text: plan.recurring, cost: 'about ' + gas + ' of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('watchlist')) state.watchlistOnly = params.get('watchlist') === '1';
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.watchlistOnly) params.set('watchlist', '1');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  // The rows the board shows, under the sandbox's constants when the reader has moved a slider:
  // the implied values are recomputed and the ranks are the sandbox's own, so the reader sees what
  // the model does rather than taking its word for it.
  function scoredRows() {
    if (!sandboxActive()) return DATA.rows;
    var model = sandboxModel();
    var rescored = DATA.rows.map(function (r) {
      var copy = {};
      Object.keys(r).forEach(function (k) { copy[k] = r[k]; });
      copy.implied_value_usd = impliedOf(r, model);
      return copy;
    });
    rescored.sort(function (a, b) { return b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0); });
    rescored.forEach(function (r, i) { r.rank = i + 1; });
    return rescored;
  }
  function rows() {
    var q = state.q.trim().toLowerCase();
    return scoredRows().filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.watchlistOnly && !r.on_watchlist) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'multiple') { av = a.multiple; bv = b.multiple; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: 'Every pre-token protocol, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The board ranks all ' + DATA.board_size + ' genuine pre-token protocols in the snapshot, and sets the wrapped, staked and bridged products aside with their reasons. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) + ' shown' })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token products set aside' }), el('b', { text: String(DATA.excluded_size) }))
      )
    );
  }

  var countEl = null;
  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); updateBoard(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); updateBoard(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); updateBoard(); });
    var watchBox = el('input', { type: 'checkbox', id: 'watchlist', checked: state.watchlistOnly ? 'checked' : null });
    watchBox.addEventListener('change', function () { state.watchlistOnly = watchBox.checked; writeHash(); updateBoard(); });
    function tabButton(tab, label) {
      var b = el('button', { type: 'button', 'aria-pressed': state.tab === tab ? 'true' : 'false', text: label });
      b.addEventListener('click', function () { state.tab = tab; writeHash(); updateBoard(); });
      return b;
    }
    countEl = el('span', { class: 'count', text: '' });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('label', { class: 'check', for: 'watchlist' }, watchBox, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }),
        el('div', { class: 'tabs' }, tabButton('pre-token', 'Pre-token'), tabButton('live', 'Live token'), tabButton('excluded', 'Set aside'))),
      countEl
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } updateBoard(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlistOnly = false; writeHash(); buildShell(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('div', null, el('b', { text: r.name }), r.on_watchlist ? el('span', { class: 'badge', text: 'WATCHLIST' }) : null),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtMult(r.multiple) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    var wrap = el('div', null);
    if (sandboxActive()) {
      wrap.appendChild(el('p', { class: 'sub', text: 'Sandbox active: these ranks are recomputed with your constants, not the board\u2019s own. A protocol\u2019s detail always shows the board\u2019s numbers.' }));
    }
    wrap.appendChild(el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('multiple', 'Multiple'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    ));
    return wrap;
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.mcap_tvl === null ? 'n/a' : fmtMult(r.mcap_tvl) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking, and their market-cap-to-TVL ratios calibrate the board\u2019s multiples.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Mcap / TVL' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function excludedTable() {
    var tbody = el('tbody');
    DATA.excluded.forEach(function (r) {
      tbody.appendChild(el('tr', { class: 'plain-row' },
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: r.category || 'Other' }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { text: r.reason })
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token on record, but not a launch of their own: wrapped, staked and bridged products of tokens that already trade, versioned pools, and exchange products. The board sets them aside rather than ranking them as launches.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: 'Why it is set aside' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var cal = DATA.calibration;
    var calRows = cal.rows.slice().sort(function (a, b) { return b.live_n - a.live_n || (a.category < b.category ? -1 : 1); });
    var calBody = el('tbody');
    calRows.forEach(function (r) {
      calBody.appendChild(el('tr', null,
        el('td', { text: r.category }),
        el('td', { class: 'num', text: String(r.live_n) }),
        el('td', { class: 'num', text: r.median_mcap_tvl === null ? 'no live comps' : fmtMult(r.median_mcap_tvl) }),
        el('td', { class: 'num', text: fmtMult(r.multiple) })
      ));
    });
    function slider(key, label, min, max, step) {
      var out = el('b', { text: String(state.sandbox[key]) });
      var input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(state.sandbox[key]), 'aria-label': label });
      input.addEventListener('input', function () {
        state.sandbox[key] = Number(input.value);
        out.textContent = String(state.sandbox[key]);
        updateBoard();
      });
      return el('div', { class: 'slider' }, el('label', null, el('span', { text: label }), out), input);
    }
    var reset = el('button', { class: 'button', type: 'button', text: 'Reset the sandbox' });
    reset.addEventListener('click', function () {
      state.sandbox.growth_weight = DATA.model.growth_weight;
      state.sandbox.maturity_floor = DATA.model.maturity_floor;
      state.sandbox.chain_step = DATA.model.chain_step;
      buildShell();
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x multiple(category) x growth x maturity x chains )'
      ),
      el('p', { class: 'sub', text: 'multiple: the median market-cap-to-TVL ratio of the snapshot\u2019s own live-token protocols in the row\u2019s category, winsorized to [' + m.median_floor + ', ' + m.median_cap + '] and shrunk toward the overall median of ' + fmtMult(cal.overall_median) + ' (' + cal.live_n + ' live protocols) when the category has few comps, clamped to [' + m.multiple_floor + ', ' + m.multiple_cap + ']. A category with no live protocol takes the overall median.' }),
      el('p', { class: 'sub', text: 'growth = 1 + ' + m.growth_weight + ' x ln(1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100), clamped to [' + m.growth_mult_floor + ', ' + m.growth_mult_cap + ']: a week\u2019s spike is evidence, not a promise. maturity = ' + m.maturity_floor + ' + ' + m.maturity_range + ' x ln(1 + min(age_days, ' + m.maturity_days + ')) / ln(1 + ' + m.maturity_days + '): survival is mostly proven in the first year. chains = 1 + ' + m.chain_step + ' x extra chains, up to ' + m.chain_max_extra + '. An unlisted age takes ' + m.unknown_age_days + ' days of credit.' }),
      el('h3', { text: 'Calibration: what the live market pays per dollar of TVL' }),
      el('div', { class: 'table-wrap cal-wrap' },
        el('table', { class: 'calibration' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Live comps' }), el('th', { scope: 'col', text: 'Median mcap / TVL' }), el('th', { scope: 'col', text: 'Multiple used' }))),
          calBody
        )
      ),
      el('div', { class: 'sandbox' },
        el('h3', { text: 'Model sandbox: move a constant and watch the board re-rank' }),
        el('p', { class: 'sub', text: 'The sandbox recomputes every row with your constants and re-ranks the table. It changes nothing in board.json: the board\u2019s own numbers stay as scored, and a protocol\u2019s detail always shows them.' }),
        el('div', { class: 'sliders' },
          slider('growth_weight', 'Growth weight', 0, 1, 0.05),
          slider('maturity_floor', 'Maturity floor', 0.3, 0.8, 0.05),
          slider('chain_step', 'Chain premium', 0, 0.08, 0.01)
        ),
        el('div', null, reset)
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  // While a hash change is being applied, the dialog's close is part of the sync, not the
  // reader closing it: the listener must not clear the selection the new hash just set.
  var syncingHash = false;
  dialog.addEventListener('close', function () {
    if (syncingHash) return;
    state.selected = null;
    writeHash();
  });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var cal = DATA.calibration.rows.filter(function (r) { return r.category === (row.category || 'Other'); })[0];
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.on_watchlist ? ' · on the watchlist' : '') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Multiple (' + (row.category || 'Other') + (cal ? ', ' + cal.live_n + ' live comp' + (cal.live_n === 1 ? '' : 's') : '') + ')' }), el('b', { class: 'num', text: fmtMult(row.multiple) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) + ' → ×' + row.growth_multiplier.toFixed(2) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) + ' → ×' + row.maturity_multiplier.toFixed(2) })),
        el('div', null, el('span', { text: 'Chains (' + (row.chains || []).length + ')' }), el('b', { class: 'num', text: '×' + row.chains_multiplier.toFixed(2) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(impliedOf(row, DATA.model)) + (impliedOf(row, DATA.model) === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  // The shell is built once; only the table region re-renders on filter, sort or sandbox input, so
  // a search box or a slider never loses focus while it is used.
  var tableHost = null;
  var modelHost = null;
  function buildShell() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    tableHost = el('div');
    shell.appendChild(tableHost);
    modelHost = el('div');
    modelHost.appendChild(modelPanel());
    shell.appendChild(modelHost);
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    updateBoard();
    if (state.selected) openDetail(state.selected);
  }
  function updateBoard() {
    if (!tableHost) return;
    tableHost.textContent = '';
    if (state.tab === 'pre-token') {
      tableHost.appendChild(boardTable());
      if (countEl) countEl.textContent = rows().length + ' rows shown';
      if (modelHost) modelHost.style.display = '';
    } else if (state.tab === 'live') {
      tableHost.appendChild(liveTable());
      if (countEl) countEl.textContent = DATA.live.length + ' live-token protocols';
      if (modelHost) modelHost.style.display = 'none';
    } else {
      tableHost.appendChild(excludedTable());
      if (countEl) countEl.textContent = DATA.excluded.length + ' protocols set aside';
      if (modelHost) modelHost.style.display = 'none';
    }
    var pressed = app.querySelectorAll('.tabs button');
    pressed.forEach(function (b, i) {
      b.setAttribute('aria-pressed', (i === 0 && state.tab === 'pre-token') || (i === 1 && state.tab === 'live') || (i === 2 && state.tab === 'excluded') ? 'true' : 'false');
    });
  }

  readHash();
  buildShell();
  // A deep link pasted into a loaded tab, or the back button, re-applies the hash: filters,
  // tabs and the detail view all follow it, so every view of the board is linkable.
  window.addEventListener('hashchange', function () {
    syncingHash = true;
    state.q = '';
    state.category = 'all';
    state.chain = 'all';
    state.tab = 'pre-token';
    state.watchlistOnly = false;
    state.selected = null;
    readHash();
    if (dialog.open) dialog.close();
    syncingHash = false;
    buildShell();
  });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
