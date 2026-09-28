/* Node tests for the slip value summary (js/odds-slip.js: normalize +
   valueSummary) — the bettor's "did the lines move on my slip?" readout.
   Run: node tests/test-odds-slip-value.js */
var S = require("../js/odds-slip.js");
var fails = 0;
function ok(name, cond, extra){
  if(!cond){ fails++; console.error("FAIL", name, extra === undefined ? "" : JSON.stringify(extra)); }
  else console.log("ok  ", name);
}
function leg(id, price, captured){
  return { id:id, game:"Chiefs @ Raiders", market:"h2h", side:id,
           book:"draftkings", bookTitle:"DraftKings", label:"test",
           price:price, captured:captured };
}

/* normalize: backfills captured for legacy legs, claims no move */
var legacy = [{ id:"a", price:1.91 }, { id:"b", price:2.10, captured:2.00 }];
S.normalize(legacy);
ok("normalize backfills captured=price for legacy legs", legacy[0].captured === 1.91, legacy[0]);
ok("normalize leaves existing captured untouched", legacy[1].captured === 2.00, legacy[1]);
ok("normalize returns the legs array", S.normalize([]).length === 0);

/* valueSummary */
ok("empty slip -> null", S.valueSummary([]) === null);
ok("malformed legs -> null", S.valueSummary([{id:"x"},{id:"y",price:1.5}]) === null);
ok("missing captured (unnormalized) -> null", S.valueSummary([{id:"a", price:1.91}]) === null);

var v = S.valueSummary([leg("a", 1.91, 1.91), leg("b", 2.10, 2.10)]);
ok("no moves: 0/0/2", v.better === 0 && v.worse === 0 && v.same === 2, v);
ok("no moves: combined equals", Math.abs(v.current - 1.91*2.10) < 1e-9 && Math.abs(v.captured - v.current) < 1e-9, v);

v = S.valueSummary([leg("a", 2.05, 1.91), leg("b", 1.87, 1.91), leg("c", 2.10, 2.10)]);
ok("mixed moves: better=1 worse=1 same=1", v.better === 1 && v.worse === 1 && v.same === 1 && v.n === 3, v);
ok("combined math: captured 1.91*1.91*2.10", Math.abs(v.captured - 1.91*1.91*2.10) < 1e-9, v.captured);
ok("combined math: current 2.05*1.87*2.10", Math.abs(v.current - 2.05*1.87*2.10) < 1e-9, v.current);

v = S.valueSummary([leg("a", 1.91005, 1.91)]);
ok("sub-epsilon drift counts as same", v.better === 0 && v.worse === 0 && v.same === 1, v);

v = S.valueSummary([leg("a", 1.91, 1.91), {id:"junk"}, leg("b", 2.20, 2.00)]);
ok("malformed legs skipped, priceable counted", v.n === 2 && v.better === 1 && v.same === 1, v);

process.exit(fails ? 1 : 0);
