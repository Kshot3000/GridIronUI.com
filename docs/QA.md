# GridIronUI 2.0 validation

## Automated regression checks

`npm test` completed successfully:

- **178 test suites passed; zero failed.** Includes all 175 original suites plus the dashboard, network and worker suites.
- **31 HTML pages and 442 local references checked.** No duplicate static IDs, missing local files or browser JavaScript syntax errors.
- Existing snapshot assertions were updated where this release intentionally changed markup, asset versions or input IDs. Mathematical and data-processing assertions were retained.
- The cache-version test now works with unversioned/shallow history: it checks real references and explicitly reports when historical comparisons cannot run.

## Browser checks

Chromium checked all 31 pages at **390px, 820px and 1440px** widths. These 93 page visits had no JavaScript page errors, document-width overflow or missing main landmarks. External feeds were disabled for this layout pass so unavailable-feed states were also exercised.

The following workflows passed in a separate browser run:

1. Instant payout calculation and invalid-input messages.
2. Keyboard global search and navigation to a specific calculator.
3. Odds conversion and calculator filtering/clearing.
4. Promo calculation using its own stake while the payout calculator held a different amount.
5. Team selection, persistence after reload, and Escape-to-close dialogs.
6. Journal add, settlement, persistence and CSV export.
7. Homepage journal summary reading saved entries.
8. DFS demo-pool loading, lineup generation and CSV export.
9. Honest no-key state on the sportsbook odds board.
10. Mobile navigation menu, page navigation and menu dismissal.

## External-service checks and limits

- ESPN scoreboard and Open-Meteo endpoints returned successful responses. The final browser check loaded six real games on the homepage.
- A direct Polymarket probe returned HTTP 403 in this environment. Its reachability may differ by connection or region; existing unavailable/stale-data handling remains important.
- Ad requests were deliberately blocked in browser QA to avoid ad activity during repeated test visits.
- No private sportsbook key was available, so authenticated Odds API requests were not exercised. Existing fixture-based odds tests passed.
- No AI Worker was deployed and no owner AI credentials were supplied. Worker request handling was tested with a mocked model response.
- DFS export was downloaded and inspected locally, not submitted to DraftKings or FanDuel.
- Chromium was tested; Safari and Firefox were not independently tested.

Test-generated journal entries and demo lineups existed only in isolated test-browser storage. They are not embedded in the site or ZIP.
