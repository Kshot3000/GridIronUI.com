/* Node tests for the GridIronUI bet-slip share-link codec (js/odds-slip.js).
   Run: node tests/test-odds-slip-share.js */
var S = require("../js/odds-slip.js");
var fails = 0;
function ok(name, cond, extra){
  if(!cond){ fails++; console.error("FAIL", name, extra === undefined ? "" : extra); }
  else console.log("ok  ", name);
}
function legs2(){
  return [
    { id:"g1|dk|h2h|Chiefs", game:"Chiefs @ Raiders", market:"h2h", side:"Chiefs",
      book:"draftkings", bookTitle:"DraftKings", label:"-110", price:1.91,
      sport:"americanfootball_nfl" },
    { id:"g2|fd|totals|Over 48.5", game:"Bills @ Jets", market:"totals", side:"Over 48.5",
      book:"fanduel", bookTitle:"FanDuel", label:"-105", price:1.952,
      sport:"americanfootball_nfl" }
  ];
}

/* round-trip */
var enc = S.encodeShare(legs2(), 50, 1759000000000);
ok("encode returns a string", typeof enc === "string" && enc.length > 0);
ok("encode is URL-hash safe", /^[A-Za-z0-9\-_]+$/.test(enc), enc.slice(0, 40));
var d = S.decodeShare(enc);
ok("decode succeeds", !!d);
ok("legs survive", d && d.legs.length === 2 &&
  d.legs[0].id === "g1|dk|h2h|Chiefs" && d.legs[1].side === "Over 48.5");
ok("prices survive exactly", d && d.legs[0].price === 1.91 && d.legs[1].price === 1.952);
ok("sport/context survive", d && d.legs[0].sport === "americanfootball_nfl" &&
  d.legs[0].bookTitle === "DraftKings" && d.legs[1].market === "totals");
ok("stake survives", d && d.stake === 50, d && d.stake);
ok("timestamp survives", d && d.ts === 1759000000000, d && d.ts);

/* unicode round-trip (accents, emoji, smart quotes in game/side) */
var uni = [{ id:"u1", game:"São Paulo @ Río — clássico ⚽", market:"h2h", side:"São Paulo",
  book:"draftkings", bookTitle:"DraftKings", label:"+120", price:2.2, sport:"soccer_epl" }];
var ud = S.decodeShare(S.encodeShare(uni, 100));
ok("unicode round-trips", !!ud && ud.legs[0].game === "São Paulo @ Río — clássico ⚽" &&
  ud.legs[0].side === "São Paulo", ud && JSON.stringify(ud.legs[0]));

/* decoded legs feed straight back into slip math */
var m = S.payout(d.legs, d.stake);
ok("decoded legs price a parlay", m !== null && Math.abs(m.combined - 1.91*1.952) < 1e-9);

/* guards */
ok("empty legs -> null", S.encodeShare([], 100) === null);
ok("null legs -> null", S.encodeShare(null, 100) === null);
var big = []; for(var i=0;i<41;i++) big.push({id:"l"+i, price:1.91});
ok(">40 legs refused", S.encodeShare(big, 100) === null);
ok("bad price refused", S.encodeShare([{id:"x", price:0.5}], 100) === null);
ok("missing id refused", S.encodeShare([{price:1.91}], 100) === null);
ok("decode null -> null", S.decodeShare(null) === null);
ok("decode empty -> null", S.decodeShare("") === null);
ok("decode garbage chars -> null", S.decodeShare("!!!not-b64!!!") === null);
ok("decode tampered char -> null", S.decodeShare(enc.slice(0, 10) + "!") === null);
ok("decode truncated (len%4==1) -> null", S.decodeShare(enc.slice(0, enc.length - 3)) === null);
ok("decode valid JSON wrong shape -> null",
  S.decodeShare("W10") === null); /* base64url of "[]" */
/* local mini base64url encoder for crafting hostile payloads */
var CH = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function miniEnc(str){
  var bytes = unescape(encodeURIComponent(str)), out = "", q;
  for(q=0;q<bytes.length;q+=3){
    var n = (bytes.charCodeAt(q)<<16)|
            (q+1<bytes.length ? bytes.charCodeAt(q+1)<<8 : 0)|
            (q+2<bytes.length ? bytes.charCodeAt(q+2) : 0);
    out += CH[(n>>18)&63]+CH[(n>>12)&63];
    if(q+1<bytes.length) out += CH[(n>>6)&63];
    if(q+2<bytes.length) out += CH[n&63];
  }
  return out;
}
ok("decode wrong version -> null",
  S.decodeShare(miniEnc(JSON.stringify({v:0, t:1, s:100,
    l:[{i:"x", p:1.91}]}))) === null);
ok("decode leg with bad price -> null",
  S.decodeShare(miniEnc(JSON.stringify({v:1, t:1, s:100,
    l:[{i:"x", p:0.5}]}))) === null);
ok("decode oversized input -> null",
  S.decodeShare(miniEnc(JSON.stringify({v:1, t:1, s:100,
    l:[{i:"x", p:1.91}]})) + new Array(9000).join("A")) === null);

/* stake + timestamp normalization */
var st1 = S.decodeShare(S.encodeShare(legs2(), "junk"));
ok("bad stake -> 100 default", !!st1 && st1.stake === 100, st1 && st1.stake);
var st2 = S.decodeShare(S.encodeShare(legs2(), -5));
ok("negative stake -> 100 default", !!st2 && st2.stake === 100);
var st3 = S.decodeShare(S.encodeShare(legs2(), 0));
ok("zero stake survives", !!st3 && st3.stake === 0, st3 && st3.stake);
var st4 = S.decodeShare(S.encodeShare(legs2(), 25.5));
ok("decimal stake survives", !!st4 && st4.stake === 25.5);

/* decoded payload is a plain leg array slip code already understands */
var st5 = S.decodeShare(enc);
ok("decoded legs work with toggle/has", !!st5 && S.has(st5.legs, "g1|dk|h2h|Chiefs"));
ok("decoded legs work with sameGame", !!st5 && S.sameGame(st5.legs).length === 0);

console.log(fails ? fails+" FAILURES" : "all share-codec tests passed");
process.exit(fails ? 1 : 0);
