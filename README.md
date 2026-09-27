# GridIronUI.com

The sharpest free sports betting knowledge hub — guides, calculators, live odds, prediction markets, scores, news, injuries, weather, video, and a DFS lineup lab.

**Live:** https://kshot3000.github.io/GridIronUI.com/

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
node tests/test-odds.js       # odds logic tests
node tests/test-odds-identity.js  # odds sport->identity-league mapping + identity header resolution
node tests/test-odds-slip.js  # bet-slip math tests
node tests/test-odds-slip-dom.js  # bet-slip DOM wiring tests
node tests/test-odds-slip-identity.js  # bet-slip GameDay identity (logo + team-color chips on slip legs)
node tests/test-dfs.js        # DFS optimizer tests
node tests/test-dfs-exposure.js  # DFS exposure summary tests
node tests/test-ai-coach.js   # AI coach directive/context/validation tests
node tests/test-kalshi.js     # Kalshi snapshot logic tests
node tests/test-team-brand.js  # ESPN team logo/color identity tests
node tests/test-teams.js     # team-directory lookup (abbr/name/normalized) + vs-header tests
node tests/test-weather.js    # weather matchup header + impact tests (kickoff->+3h game window, gusts, window-max impact tags)
node tests/test-scores.js     # ESPN scoreboard stat-leader line tests
node tests/test-scores-live.js  # scores page live auto-refresh (60s tick, hidden-tab skip, pause/resume, no stacking)
node tests/test-scores-detail.js  # game-detail logic (ESPN summary -> scoring timeline, period table, team-stats comparison)
node tests/test-scores-detail-dom.js  # game-detail expander wiring (toggle, cache, failure retry, stale-response guard)
node tests/test-markets-live.js  # markets page live auto-refresh (90s Polymarket tick on likely-live games, 5-min Kalshi snapshot tick, hidden-tab skip, pause/resume, no stacking)
node tests/test-predictions-live.js  # predictions page live auto-refresh (90s tick on likely-live games, render-generation guard, hidden-tab skip, pause/resume, no stacking)
node tests/test-news-live.js  # news wire live auto-refresh (3-min silent tick, hidden-tab skip, pause/resume, no stacking, tab-generation guard)
node tests/test-odds-live.js  # odds board quota-smart auto-refresh (5-min tick only when games near, silent in-place re-pull, hidden-tab skip, timer no-stack, stale-sport generation guard, failed-pull keeps board)
node tests/test-odds-spark.js  # line-movement sparkline logic (history record/dedupe/caps, series extraction, SVG geometry)
node tests/test-odds-spark-dom.js  # sparkline wiring in shipped odds.js (renders with 2+ samples, hidden with 1, history recorded per fetch)
node tests/test-cache-keys.js  # cache-key regression guard (every js ?v= key >= the release that last changed that file)
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
feed. Refresh it (loop runs do this on every push):

```bash
python3 scripts/fetch-kalshi.py   # writes data/kalshi-nfl.json (timestamped)
```

The page labels the tab as a snapshot, shows when it was captured, and warns
when it goes stale (>6h) — never presented as live prices.

## Deploy

Push to `main` — GitHub Pages serves the repo root.

21+. Gamble responsibly. 1-800-GAMBLER.
