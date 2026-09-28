/* GridIronUI slip->journal export logic tests — exercises the pure
   Slip.journalBets mapper: leg-to-bet mapping, sport/market labels,
   stake splitting, captured-price preference, invalid legs skipped
   (never invented), converter failures, empty input, date passthrough.
   Run: node tests/test-slip-journal.js */
"use strict";
const Slip = require("../js/odds-slip.js");

let pass = 0, fail = 0;
function ok(name, cond, extra){
  if(cond){ pass++; }
  else{ fail++; console.log("FAIL:", name, extra === undefined ? "" : extra); }
}
function toAmerican(d){ /* mirror of BetMath.decimalToAmerican */
  d = Number(d);
  if(!isFinite(d) || d < 1.01) throw new Error("bad decimal");
  return d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1));
}
function leg(o){
  return Object.assign({
    id: "g1|dk|h2h|Chiefs", game: "Chiefs @ Raiders", market: "h2h", side: "Chiefs",
    book: "draftkings", bookTitle: "DraftKings", label: "-110", price: 1.91,
    captured: 1.91, sport: "americanfootball_nfl"
  }, o || {});
}

/* mapping */
{
  const r = Slip.journalBets([leg()], 100, "NFL", "2026-09-28", toAmerican);
  ok("one leg -> one bet", r.bets.length === 1 && r.skipped === 0, JSON.stringify(r));
  const b = r.bets[0];
  ok("date passed through", b.date === "2026-09-28");
  ok("sport label used", b.sport === "NFL");
  ok("event = game + book", b.event === "Chiefs @ Raiders (DraftKings)", b.event);
  ok("h2h -> Moneyline", b.market === "Moneyline", b.market);
  ok("pick = side + label", b.pick === "Chiefs -110", b.pick);
  ok("price = American of decimal", b.price === -110, b.price);
  ok("stake = full when single leg", b.stake === 100, b.stake);
  ok("result pending", b.result === "pending");
}
/* stake split + market map */
{
  const r = Slip.journalBets([
    leg({ market: "spreads", side: "Chiefs", label: "-3.5 · -110", price: 1.91 }),
    leg({ id: "g2", game: "Bills @ Jets", market: "totals", side: "Over", label: "O 47.5 · -105", price: 1.952, bookTitle: "FanDuel" }),
    leg({ id: "g3", game: "Cowboys @ Giants", market: "h2hx", side: "Cowboys", label: "+140", price: 2.4, captured: 2.4 }),
  ], 75, "NFL", "2026-09-28", toAmerican);
  ok("3 legs -> 3 bets", r.bets.length === 3 && r.skipped === 0, JSON.stringify(r));
  ok("spreads -> Spread", r.bets[0].market === "Spread");
  ok("totals -> Total", r.bets[1].market === "Total");
  ok("unknown market -> Other", r.bets[2].market === "Other", r.bets[2].market);
  ok("stake split evenly", r.bets.every(b => b.stake === 25), JSON.stringify(r.bets.map(b => b.stake)));
  ok("+140 from 2.40", r.bets[2].price === 140, r.bets[2].price);
  ok("book in event", r.bets[1].event === "Bills @ Jets (FanDuel)", r.bets[1].event);
}
/* captured price preferred over live price */
{
  const r = Slip.journalBets([leg({ price: 1.80, captured: 1.91 })], 50, "NFL", "2026-09-28", toAmerican);
  ok("captured price wins over drifted live price", r.bets[0].price === -110, r.bets[0].price);
}
/* invalid legs skipped, never invented */
{
  const r = Slip.journalBets([
    leg({ price: 1.0, captured: 1.0 }),            // even money -> 0, invalid
    leg({ price: NaN, captured: NaN }),            // no price at all
    leg({ price: 1.91 }),                          // captured missing -> price used
  ], 60, "NFL", "2026-09-28", toAmerican);
  ok("bad legs skipped", r.bets.length === 1 && r.skipped === 2, JSON.stringify(r));
  ok("valid leg survived", r.bets[0].price === -110);
}
{
  const r = Slip.journalBets([leg()], 60, "NFL", "2026-09-28", function(){ throw new Error("boom"); });
  ok("converter failure skips leg", r.bets.length === 0 && r.skipped === 1);
}
/* edge inputs */
{
  const r = Slip.journalBets([], 100, "NFL", "2026-09-28", toAmerican);
  ok("empty legs -> empty", r.bets.length === 0 && r.skipped === 0);
  const r2 = Slip.journalBets(null, 100, "NFL", "2026-09-28", toAmerican);
  ok("null legs -> empty", r2.bets.length === 0 && r2.skipped === 0);
  const r3 = Slip.journalBets([leg()], 100, "", "2026-09-28", toAmerican);
  ok("blank sport label -> Other", r3.bets[0].sport === "Other");
  const r4 = Slip.journalBets([leg({ game: "", bookTitle: "" })], 100, "NFL", "2026-09-28", toAmerican);
  ok("missing game falls back", r4.bets[0].event === "Unknown game", r4.bets[0].event);
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
