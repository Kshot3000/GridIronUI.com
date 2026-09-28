# GridIronUI.com

The sharpest free sports betting knowledge hub — guides, calculators, live odds, prediction markets, scores, news, injuries, weather, video, and a DFS lineup lab.

**Live:** https://gridironui.xyz/

## What it is

- **Learn** — original guides (betting 101, bet types, bankroll, advanced strategy) + glossary
- **Tools** — odds converter, implied probability, parlay math, Kelly staking, no-vig calculator
- **Live data** — odds board (The Odds API, user-supplied key), Polymarket + Kalshi NFL moneyline prices (Kalshi via server-side snapshot), ESPN scores/news/injuries, Open-Meteo stadium weather
- **DFS Lab** — real lineup optimizer for DraftKings/FanDuel, NFL/NBA, cash/GPP, with CSV import and export
- **Watch** — betting shows and analysis from major outlets

## Tech

Static site. Vanilla HTML/CSS/JS, no build step, no backend. Live data is fetched in the visitor's browser from public APIs (ESPN, Polymarket, Open-Meteo) — nothing is proxied.

## Honesty rules (enforced)

- No fake live data, no fake partnerships, no "AI picks" claims
- Every fetch has loading/setup/failure states
- Sample data is always labeled as sample
- All outbound sportsbook links go to licensed, authorized US operators only

## Develop

```bash
cd ~/workspace/gridironui
python3 -m http.server 8080   # serve locally
node tests/test-betmath.js    # bet math tests
node tests/test-roundrobin.js   # round-robin combinations + payout/scenario math
node tests/test-roundrobin-dom.js  # round-robin wiring in shipped tools.js (leg rows, size boxes, results, empty/bad-input states)
node tests/test-tickethedge.js   # ticket hedge planner math (equal lock, free-roll, custom outcomes, error paths)
node tests/test-tickethedge-dom.js  # ticket hedge wiring in shipped tools.js (three plans, custom stake, empty/bad-input states)
node tests/test-dutching.js   # dutching stake-split math (equal returns, arb vs locked-loss verdicts, error paths)
node tests/test-dutching-dom.js  # dutching wiring in shipped tools.js (named selections, table values, verdicts, empty/bad-input states)
node tests/test-teaser.js     # teaser key-number math (teased lines, crossings, Wong/dead legs, breakeven, error paths)
node tests/test-teaser-dom.js  # teaser wiring in shipped tools.js (leg rows, badges, verdicts, push copy, empty/bad-input states)
node tests/test-cashout.js    # cash-out evaluator math (fair value, book margin, DIY hedge equalization, verdict bands, error paths)
node tests/test-cashout-dom.js  # cash-out wiring in shipped tools.js (verdicts, money math, format selector, empty/bad-input states)
node tests/test-journal.js    # bet journal math (validation, profit, record/ROI/win-rate/streak/per-sport, CSV export)
node tests/test-journal-dom.js  # journal wiring in shipped journal.js (add validation, settle/undo/delete, filters, unit size, CSV, escaping, empty states)
node tests/test-hero-rain.js   # hero canvas: half-speed chart drift, rain glyph set + layering, hero-pulse cache key
node tests/test-odds-inj.js   # injury-badge pure logic (severity ranks, per-team counts, card lines, badge HTML)
node tests/test-odds-inj-dom.js  # injury-badge wiring in shipped odds.js (hidden slots, live injection, quiet cases, feed failure)
node tests/test-odds.js       # odds logic tests
node tests/test-odds-identity.js  # odds sport->identity-league mapping + identity header resolution
node tests/test-odds-slip.js  # bet-slip math tests
node tests/test-odds-slip-dom.js  # bet-slip DOM wiring tests
node tests/test-odds-slip-share.js  # bet-slip share-link codec (base64url round-trip, hostile-payload guards)
node tests/test-odds-slip-share-dom.js  # share-link wiring in shipped odds.js (hash load + honesty banner, copy link, bad-link handling)
node tests/test-slip-journal.js  # slip→journal mapper: leg→bet mapping, sport/market labels, stake split, captured prices, invalid-leg skips
node tests/test-slip-journal-dom.js  # slip→journal wiring in shipped odds.js (journal writes, dedup, empty-slip guidance, skip reporting)
node tests/test-odds-slip-identity.js  # bet-slip GameDay identity (logo + team-color chips on slip legs)
node tests/test-dfs.js        # DFS optimizer tests
node tests/test-dfs-exposure.js  # DFS exposure summary tests
node tests/test-dfs-injuries.js  # DFS injury cross-check logic (ESPN flatten, severity ranks, conservative name+team matching)
node tests/test-dfs-injuries-dom.js  # injury wiring in shipped dfs.js (fetch-once, chips, banner, exclude-OUT, locked-OUT warning)
node tests/test-dfs-value.js  # DFSOpt.value: projected points per $1k, zero-salary guard, node + browser exports
node tests/test-dfs-filters-dom.js  # pool search + position filter + value column wiring in shipped dfs.js
node tests/test-ai-coach.js   # AI coach directive/context/validation tests
node tests/test-kalshi.js     # Kalshi snapshot logic tests
node tests/test-team-brand.js  # ESPN team logo/color identity tests
node tests/test-teams.js     # team-directory lookup (abbr/name/normalized) + vs-header tests
node tests/test-weather.js    # weather matchup header + impact tests (kickoff->+3h game window, gusts, window-max impact tags)
node tests/test-scores.js     # ESPN scoreboard stat-leader line tests
node tests/test-scores-live.js  # scores page live auto-refresh (60s tick, hidden-tab skip, pause/resume, no stacking)
node tests/test-scores-detail.js  # game-detail logic (ESPN summary -> scoring timeline, period table, team-stats comparison)
node tests/test-scores-detail-dom.js  # game-detail expander wiring (toggle, cache, failure retry, stale-response guard)
node tests/test-winprob.js  # win-probability series, biggest swing, Matchup Predictor, chart/predictor markup
node tests/test-winprob-dom.js  # win-prob canvas paint + scores.js paint wiring (fetch, cache reopen, pregame toggle)
node tests/test-markets-live.js  # markets page live auto-refresh (90s Polymarket tick on likely-live games, 5-min Kalshi snapshot tick, hidden-tab skip, pause/resume, no stacking)
node tests/test-predictions-live.js  # predictions page live auto-refresh (90s tick on likely-live games, render-generation guard, hidden-tab skip, pause/resume, no stacking)
node tests/test-kalshi-predrow.js  # Kalshi "two crowds" row on the predictions page (prices, gap chip, stale withhold, missing-data, XSS)
node tests/test-news-live.js  # news wire live auto-refresh (3-min silent tick, hidden-tab skip, pause/resume, no stacking, tab-generation guard)
node tests/test-odds-live.js  # odds board quota-smart auto-refresh (5-min tick only when games near, silent in-place re-pull, hidden-tab skip, timer no-stack, stale-sport generation guard, failed-pull keeps board)
node tests/test-odds-spark.js  # line-movement sparkline logic (history record/dedupe/caps, series extraction, SVG geometry)
node tests/test-odds-spark-dom.js  # sparkline wiring in shipped odds.js (renders with 2+ samples, hidden with 1, history recorded per fetch)
node tests/test-home-strip.js  # homepage "Today's games" strip (post-game drop, malformed-event skip, live-first + kickoff ranking, top-6 cap)
node tests/test-odds-wx.js  # odds-board weather badges: venue cross-check vs ESPN (neutral-site aware, dome/retractable skip), pre-game + 16-day horizon only, multi-location forecast URL, escaped badge HTML
node tests/test-odds-wx-dom.js  # weather badge wiring in shipped odds.js (hidden slot on NFL cards, gusty forecast reveals stadium badge, calm stays hidden, one multi-location fetch, no fetches on non-NFL tabs)
node tests/test-cache-keys.js  # cache-key regression guard (every js ?v= key >= the release that last changed that file)
node tests/test-arbs.js       # cross-book arbitrage logic (stake splits, moneyline/spread/total pairing, same-book exclusion, 3-way EPL)
node tests/test-arbs-dom.js   # Sure bets strip wiring in shipped odds.js (strip render, game flags, quiet-when-empty)
node tests/test-odds-alerts.js # line-move alert candidates (threshold gating, baseline seeding, started-game skip, no re-fire)
node tests/test-odds-alerts-dom.js # alert wiring in shipped odds.js (seed-quiet first pull, toast content/jump/dismiss, off stops all)
node tests/test-odds-pm.js     # market-check logic (Polymarket live moneylines, no-vig fair probs, 5-pt gap flag, pinned-market exclusion)
node tests/test-odds-pm-dom.js # market-check wiring in shipped odds.js (hidden slot, live-price reveal, pinned silence, no NBA fetches)
node tests/test-predictions-kalshi-dom.js  # Kalshi row wiring in shipped predictions.js (NFL snapshot fetch, matched-game row, gap chip, snapshot-failure degrade)
node tests/test-kalshi-snapshot.js # Kalshi snapshot honesty (no minute-specific cadence promises, loop refresh rule, snapshot shape, markets.js cache key)
```

### Team identity directory

Feeds that don't carry logos/colors themselves (Kalshi snapshot, Polymarket
events, ESPN injury teams) get GameDay identity from a static ESPN snapshot.
Team colors/logos are stable, so this is refreshed rarely:

```bash
python3 scripts/fetch-teams.py    # writes data/teams.json (NFL/NBA/MLB/NHL/EPL)
```

### Kalshi NFL snapshot

Kalshi's public API rejects browser cross-origin requests, so the Markets
page's "Kalshi · NFL" tab renders a server-side snapshot instead of a live
feed. Refresh it on every push — loop runs do this when the snapshot is
older than about two hours:

```bash
python3 scripts/fetch-kalshi.py   # writes data/kalshi-nfl.json (timestamped)
```

The page labels the tab as a snapshot, shows when it was captured, and warns
when it goes stale (>6h) — never presented as live prices.

## Deploy

Push to `main` — GitHub Pages serves the repo root.

21+. Gamble responsibly. 1-800-GAMBLER.
