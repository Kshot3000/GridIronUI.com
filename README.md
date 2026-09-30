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
node tests/test-tools-labels.js   # tools label/layout: ticket-hedge label fits its column, form-row tracks shrink so labels wrap
node tests/test-live-guide.js   # live-betting guide: TOC anchors, cross-link targets, footer/index/sitemap/bet-types wiring, guide math, cache keys
node tests/test-linemove-guide.js   # line-movement guide: TOC anchors, cross-link targets, footer/index/sitemap wiring, guide math, honesty copy, cache keys
node tests/test-props-guide.js   # player-props guide: TOC anchors, cross-link targets, footer/index/sitemap wiring, guide math, honesty copy, cache keys
node tests/test-bankroll-guide.js  # bankroll guide: artifact sweep, TOC anchors, cross-link targets, flat-betting + line-shopping worked examples re-derived
node tests/test-advanced-arb.js  # advanced-guide arbitrage example: stake split re-derived against js/betmath.js hedge math, equal profit both ways
node tests/test-core-guides-math.js  # core guides math audit: every worked example in betting-101/bet-types/advanced re-derived against js/betmath.js, TOC anchors, parlay-tax honesty fix
node tests/test-glossary-terms.js  # glossary vocabulary-drift guard: Kalshi/Polymarket/prediction-market/cash-out/dutching present, no stub definitions, alphabetical order
node tests/test-about-content.js  # about-page sitemap-in-prose: all 7 guides + all live-data pages linked, future guide files must be linked
node tests/test-dutching.js   # dutching stake-split math (equal returns, arb vs locked-loss verdicts, error paths)
node tests/test-dutching-dom.js  # dutching wiring in shipped tools.js (named selections, table values, verdicts, empty/bad-input states)
node tests/test-teaser.js     # teaser key-number math (teased lines, crossings, Wong/dead legs, breakeven, error paths)
node tests/test-teaser-dom.js  # teaser wiring in shipped tools.js (leg rows, badges, verdicts, push copy, empty/bad-input states)
node tests/test-cashout.js    # cash-out evaluator math (fair value, book margin, DIY hedge equalization, verdict bands, error paths)
node tests/test-cashout-dom.js  # cash-out wiring in shipped tools.js (verdicts, money math, format selector, empty/bad-input states)
node tests/test-bonus.js      # bonus & promo value math (bonusBet, rollover, profitBoost)
node tests/test-bonus-dom.js  # bonus & promo value DOM wiring in shipped tools.js
node tests/test-bonus-static.js  # bonus & promo value static wiring in tools.html (cache keys)
node tests/test-journal.js    # bet journal math (validation, profit, record/ROI/win-rate/streak/per-sport, CSV export, closing line value)
node tests/test-journal-dom.js  # journal wiring in shipped journal.js (add validation, settle/undo/delete, filters, unit size, CSV, escaping, empty states)
node tests/test-journal-clv-dom.js  # closing-price editor + beat-the-close chip/stat wiring in shipped journal.js
node tests/test-journal-curve.js  # bankroll curve math (cumulative settled profit, date order, pending excluded, pushes flat)
node tests/test-journal-curve-dom.js  # bankroll-curve wiring in shipped journal.js (hide when unsettled, DPR paint, aria, caption, null-context safety)
node tests/test-journal-csvimport.js  # journal CSV import math (export round-trip, RFC-4180 quoting, column-order freedom, bad-row skips with reasons, honest result/date defaults)
node tests/test-journal-csvimport-dom.js  # CSV import wiring in shipped journal.js (picker open, file read, dedupe by content, fresh ids, result message)
node tests/test-hero-rain.js   # hero canvas: half-speed chart drift, rain glyph set + layering, hero-pulse cache key
node tests/test-odds-inj.js   # injury-badge pure logic (severity ranks, per-team counts, card lines, badge HTML)
node tests/test-odds-inj-dom.js  # injury-badge wiring in shipped odds.js (hidden slots, live injection, quiet cases, feed failure)
node tests/test-injuries.js  # injuries page: severity filter + sorting in the SHIPPED js/injuries.js
node tests/test-odds.js       # odds logic tests
node tests/test-odds-identity.js  # odds sport->identity-league mapping + identity header resolution
node tests/test-odds-slip.js  # bet-slip math tests
node tests/test-odds-slip-dom.js  # bet-slip DOM wiring tests
node tests/test-odds-slip-share.js  # bet-slip share-link codec (base64url round-trip, hostile-payload guards)
node tests/test-odds-slip-share-dom.js  # share-link wiring in shipped odds.js (hash load + honesty banner, copy link, bad-link handling)
node tests/test-odds-slip-value.js  # bet-slip value summary math (normalize + implied totals in js/odds-slip.js)
node tests/test-odds-slip-value-dom.js  # slip value summary wiring in the SHIPPED js/odds.js
node tests/test-slip-journal.js  # slip→journal mapper: leg→bet mapping, sport/market labels, stake split, captured prices, invalid-leg skips
node tests/test-slip-journal-dom.js  # slip→journal wiring in shipped odds.js (journal writes, dedup, empty-slip guidance, skip reporting)
node tests/test-odds-slip-identity.js  # bet-slip GameDay identity (logo + team-color chips on slip legs)
node tests/test-dfs.js        # DFS optimizer tests
node tests/test-dfs-exposure.js  # DFS exposure summary tests
node tests/test-dfs-injuries.js  # DFS injury cross-check logic (ESPN flatten, severity ranks, conservative name+team matching)
node tests/test-dfs-injuries-dom.js  # injury wiring in shipped dfs.js (fetch-once, chips, banner, exclude-OUT, locked-OUT warning)
node tests/test-dfs-value.js  # DFSOpt.value: projected points per $1k, zero-salary guard, node + browser exports
node tests/test-dfs-filters-dom.js  # pool search + position filter + value column wiring in shipped dfs.js
node tests/test-dfs-dkimport.js  # DK/FD salary-CSV import: DK headers (Name/TeamAbbrev/Game Info) and FD headers (Team/Opponent/First+Last Name) auto-map, opponents derived from Game Info, ID suffixes stripped (shipped js/dfs.js)
node tests/test-dfs-lockout.js  # DFS lock/exclude logic
node tests/test-ai-coach.js   # AI coach directive/context/validation tests
node tests/test-ai-coach-chain.js  # AI coach provider chain: failover order, credits-error detection, attempt recording
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
node tests/test-disagree-snapshot.js  # cross-book-edge card: snapshot age named in the note, Kalshi figures tagged "snapshot" + frozen-at-snapshot tooltip (shipped js/markets.js)
node tests/test-disagree.js  # disagree-logic unit tests: Polymarket moneyline vs Kalshi snapshot pairing, gap flags
node tests/test-disagree-mlb.js  # disagree-logic MLB series disambiguation: Game 1/Game 2 nearest-day matching, league arg, backward-compat default
node tests/test-disagree-mlb-card.js  # cross-book-edge card on the MLB tab: real-snapshot BOS/NYY + CHW/HOU matching, league-aware shipped-card wiring in js/markets.js
node tests/test-movement.js  # 7d-movement + 24h-volume rendering in the SHIPPED js files (markets/predictions)
node tests/test-links-verified.js  # links directory honesty: "Last checked" date stamp present in the hero, parses to a real non-future non-stale date (shipped links.html)
node tests/test-legality-watch.js  # legality page regulatory-watch section: dated enforcement news, honesty framing, cross-links (shipped legality.html)
node tests/test-partners-programs.js  # partners page prediction-market programs: Polymarket Builder tiers + Kalshi refer-a-friend mechanics, honesty framing, date stamp, legality cross-link (shipped partners.html)
node tests/test-seo.js  # SEO pass: social meta on all 30 pages, JSON-LD, sitemap
node tests/test-ads.js  # display-ad + referral slots in shipped js/site.js: slots render only once ad-unit IDs are set
node tests/test-predictions-live.js  # predictions page live auto-refresh (90s tick on likely-live games, render-generation guard, hidden-tab skip, pause/resume, no stacking)
node tests/test-kalshi-predrow.js  # Kalshi "two crowds" row on the predictions page (prices, gap chip, stale withhold, missing-data, XSS)
node tests/test-news-live.js  # news wire live auto-refresh (3-min silent tick, hidden-tab skip, pause/resume, no stacking, tab-generation guard)
node tests/test-odds-live.js  # odds board quota-smart auto-refresh (5-min tick only when games near, silent in-place re-pull, hidden-tab skip, timer no-stack, stale-sport generation guard, failed-pull keeps board)
node tests/test-odds-spark.js  # line-movement sparkline logic (history record/dedupe/caps, series extraction, SVG geometry)
node tests/test-odds-spark-dom.js  # sparkline wiring in shipped odds.js (renders with 2+ samples, hidden with 1, history recorded per fetch)
node tests/test-odds-nokey.js   # no-key empty state in shipped odds.js (in-place #oddsNoKey panel + honesty line + CTA scroll/focus, no fetch burned, key-save transition to spinner)
node tests/test-odds-honesty.js  # odds-board honesty: homepage card names the free API-key requirement + never-sample-lines line, combined-odds decimal parenthesized in shipped odds.js
node tests/test-home-strip.js  # homepage "Today's games" strip (post-game drop, malformed-event skip, live-first + kickoff ranking, top-6 cap)
node tests/test-odds-wx.js  # odds-board weather badges: venue cross-check vs ESPN (neutral-site aware, dome/retractable skip), pre-game + 16-day horizon only, multi-location forecast URL, escaped badge HTML
node tests/test-odds-wx-dom.js  # weather badge wiring in shipped odds.js (hidden slot on NFL cards, gusty forecast reveals stadium badge, calm stays hidden, one multi-location fetch, no fetches on non-NFL tabs)
node tests/test-wx-rollover.js  # week-rollover fetcher in wx-shared.js (all-post board -> explicit week=number+1&seasontype fetch, in-progress kept, garbage/absurd week guards, failure semantics, escaped fallback notice)
node tests/test-wx-rollover-dom.js  # rollover wiring in shipped weather.js (notice inserted + next-week slate rendered in the dead window, no fallback/notice when pre games exist, primary failure -> feed-failure box)
node tests/test-wx-ballparks.js  # MLB ballpark dataset (30 geocoded parks, roof enum, ballparkFor, ESPN-venue cross-check in ballparkVenueFor)
node tests/test-wx-bsb-impact.js  # baseball weather impact model (wind-direction framing, rain delay/PPD risk, cold/heat carry notes)
node tests/test-wx-mlb-postseason.js  # MLB postseason fetcher (seasontype=3 board, pre/in kept, post dropped, empty/failure semantics)
node tests/test-watch-outlets.js  # Watch page outlet/playlist ids pinned to verified channel ids (CBS Sports rebrand catch 2026-09-29)
node tests/test-scores-smartday.js  # scores smart-day (any league tab on a no-game day jumps to the next game day with an honest league-aware notice; failure/null-window stay on the empty state; Today clears notice, no re-scan)
node tests/test-cache-keys.js  # cache-key regression guard (every js ?v= key >= the release that last changed that file)
node tests/test-readme-testlist.js  # README test-list drift guard: every test file listed, no dead references
node tests/test-tabs-a11y.js   # tab-list accessibility in shipped site.js (tablist/tab roles, aria-labels, roving tabindex, arrow/Home/End activation, late-added lists, pre-set role preservation)
node tests/test-nav.js  # nav a11y: shipped site.js with stubbed DOM (skip link, aria, keyboard)
node tests/test-header-compact.js  # header-compact regression: no display:none snap on the compact strips (layout-shift guard)
node tests/test-backgrounds.js  # sports-imagery backgrounds: static checks for the themed hero/page backgrounds
node tests/test-feedpill-mobile.js  # feed-pill mobile: layout doesn't overflow on small viewports
node tests/test-arbs.js       # cross-book arbitrage logic (stake splits, moneyline/spread/total pairing, same-book exclusion, 3-way EPL)
node tests/test-arbs-dom.js   # Sure bets strip wiring in shipped odds.js (strip render, game flags, quiet-when-empty)
node tests/test-fairline.js    # no-vig fair moneyline math (vig removal, orientation, hold, null paths)
node tests/test-fairline-dom.js  # fair line wiring in shipped odds.js (render, hold figure, quiet-when-one-sided)
node tests/test-odds-alerts.js # line-move alert candidates (threshold gating, baseline seeding, started-game skip, no re-fire)
node tests/test-odds-alerts-dom.js # alert wiring in shipped odds.js (seed-quiet first pull, toast content/jump/dismiss, off stops all)
node tests/test-odds-pm.js     # market-check logic (Polymarket live moneylines, no-vig fair probs, 5-pt gap flag, pinned-market exclusion)
node tests/test-odds-pm-dom.js # market-check wiring in shipped odds.js (hidden slot, live-price reveal, pinned silence, no NBA fetches)
node tests/test-predictions-kalshi-dom.js  # Kalshi row wiring in shipped predictions.js (NFL snapshot fetch, matched-game row, gap chip, snapshot-failure degrade)
node tests/test-kalshi-snapshot.js # Kalshi snapshot honesty (no minute-specific cadence promises, loop refresh rule, snapshot shape, markets.js cache key)
node tests/test-kalshi-mlb-snapshot.js # Kalshi MLB postseason snapshot honesty (KXMLBGAME series, 2-winner-markets shape, fetcher --series/--out args, markets + predictions wiring)
node tests/test-ev.js        # expected-value math (fair price -> zero EV, +EV/-EV cases, break-even, garbage-in throws)
node tests/test-ev-dom.js    # EV calculator wiring in shipped tools.js (verdicts, dollar/edge math, formats, default stake, errors)
node tests/test-middle.js      # middling math (both-win payout, split outcomes, worst case, garbage-in throws)
node tests/test-middle-dom.js  # middling calculator wiring in shipped tools.js (math, verdicts, formats, label XSS, errors)
node tests/test-middle-static.js  # middle card wiring in tools.html (New tag, Sixteen counts, v1.65.0 cache keys)
```

### Team identity directory

Feeds that don't carry logos/colors themselves (Kalshi snapshot, Polymarket
events, ESPN injury teams) get GameDay identity from a static ESPN snapshot.
Team colors/logos are stable, so this is refreshed rarely:

```bash
python3 scripts/fetch-teams.py    # writes data/teams.json (NFL/NBA/MLB/NHL/EPL)
```

### Kalshi NFL + MLB snapshots

Kalshi's public API rejects browser cross-origin requests, so the Markets
page's "Kalshi · NFL" and "Kalshi · MLB" (postseason) tabs render server-side
snapshots instead of a live feed. Refresh both on every push — loop runs do
this when a snapshot is older than about two hours:

```bash
python3 scripts/fetch-kalshi.py                                    # writes data/kalshi-nfl.json (timestamped)
python3 scripts/fetch-kalshi.py --series KXMLBGAME --out data/kalshi-mlb.json  # writes data/kalshi-mlb.json
```

The page labels the tab as a snapshot, shows when it was captured, and warns
when it goes stale (>6h) — never presented as live prices.

## Deploy

Push to `main` — GitHub Pages serves the repo root.

21+. Gamble responsibly. 1-800-GAMBLER.
