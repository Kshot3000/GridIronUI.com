# GridIronUI.com

The sharpest free sports betting knowledge hub — guides, calculators, live odds, prediction markets, scores, news, injuries, weather, video, and a DFS lineup lab.

**Live:** https://kshot3000.github.io/GridIronUI.com/

## What it is

- **Learn** — original guides (betting 101, bet types, bankroll, advanced strategy) + glossary
- **Tools** — odds converter, implied probability, parlay math, Kelly staking, no-vig calculator
- **Live data** — odds board (The Odds API, user-supplied key), Polymarket markets, ESPN scores/news/injuries, Open-Meteo stadium weather
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
node tests/test-odds-slip.js  # bet-slip math tests
node tests/test-odds-slip-dom.js  # bet-slip DOM wiring tests
node tests/test-dfs.js        # DFS optimizer tests
node tests/test-dfs-exposure.js  # DFS exposure summary tests
node tests/test-ai-coach.js   # AI coach directive/context/validation tests
```

## Deploy

Push to `main` — GitHub Pages serves the repo root.

21+. Gamble responsibly. 1-800-GAMBLER.
