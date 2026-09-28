/* GridIronUI bet-slip logic — pure functions, no DOM.
   Browser: window.OddsSlip · node: module.exports
   A leg: {id, game, market, side, book, bookTitle, label, price (decimal)} */
(function(){
"use strict";
/* Self-contained base64url codec over UTF-8 bytes. URL-safe alphabet
   (no +, /, or = padding), so encoded slips can live in a URL hash. */
var B64U = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function _utf8Bytes(s){
  s = String(s);
  var b = [], i, c;
  for(i=0;i<s.length;i++){
    c = s.charCodeAt(i);
    if(c < 128) b.push(c);
    else if(c < 2048) b.push(192 | (c >> 6), 128 | (c & 63));
    else if(c >= 0xD800 && c <= 0xDBFF && i+1 < s.length){
      var d = s.charCodeAt(i+1);
      if(d >= 0xDC00 && d <= 0xDFFF){
        var cp = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00); i++;
        b.push(240 | (cp >> 18), 128 | ((cp >> 12) & 63),
               128 | ((cp >> 6) & 63), 128 | (cp & 63));
        continue;
      }
      b.push(239, 191, 189); /* lone surrogate -> U+FFFD */
    }
    else b.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63));
  }
  return b;
}
function _b64uEncode(str){
  var bytes = _utf8Bytes(str), out = "", i;
  for(i=0;i<bytes.length;i+=3){
    var a = bytes[i], b = i+1 < bytes.length ? bytes[i+1] : 0,
        c = i+2 < bytes.length ? bytes[i+2] : 0;
    var n = (a << 16) | (b << 8) | c;
    out += B64U[(n >> 18) & 63] + B64U[(n >> 12) & 63];
    if(i+1 < bytes.length) out += B64U[(n >> 6) & 63];
    if(i+2 < bytes.length) out += B64U[n & 63];
  }
  return out;
}
function _b64uDecode(str){
  if(typeof str !== "string" || !str.length || str.length > 8192) return null;
  if(!/^[A-Za-z0-9\-_]+$/.test(str)) return null;
  if(str.length % 4 === 1) return null;
  var bytes = [], i, j;
  for(i=0;i<str.length;i+=4){
    var chunk = str.slice(i, i+4), n = 0;
    for(j=0;j<chunk.length;j++){
      var v = B64U.indexOf(chunk.charAt(j));
      if(v < 0) return null;
      n = (n << 6) | v;
    }
    if(chunk.length === 4) bytes.push((n >> 16) & 255, (n >> 8) & 255, n & 255);
    else if(chunk.length === 3) bytes.push((n >> 10) & 255, (n >> 2) & 255);
    else bytes.push((n >> 4) & 255);
  }
  var out = "", k = 0;
  while(k < bytes.length){
    var c = bytes[k++];
    if(c < 128) out += String.fromCharCode(c);
    else if((c & 224) === 192 && k < bytes.length)
      out += String.fromCharCode(((c & 31) << 6) | (bytes[k++] & 63));
    else if((c & 240) === 224 && k+1 < bytes.length){
      out += String.fromCharCode(((c & 15) << 12) | ((bytes[k] & 63) << 6) |
                                 (bytes[k+1] & 63));
      k += 2;
    }
    else if((c & 248) === 240 && k+2 < bytes.length){
      var cp = ((c & 7) << 18) | ((bytes[k] & 63) << 12) |
               ((bytes[k+1] & 63) << 6) | (bytes[k+2] & 63);
      k += 3; cp -= 0x10000;
      out += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 1023));
    }
    else return null; /* malformed UTF-8 */
  }
  return out;
}
var S = {
  /* decimal odds -> american ("+150" or -110) */
  dec2am: function(d){
    d = Number(d);
    if(!(d > 1)) return "—";
    return d >= 2 ? "+"+Math.round((d-1)*100) : Math.round(-100/(d-1));
  },
  /* combined decimal odds for a parlay/multi; empty slip -> 1 */
  combined: function(legs){
    return legs.reduce(function(acc,l){ return acc * Number(l.price); }, 1);
  },
  /* stake math; null when there is nothing to price */
  payout: function(legs, stake){
    if(!legs.length) return null;
    stake = Number(stake) || 0;
    var c = S.combined(legs);
    var total = stake * c;
    return { combined:c, combinedAm:S.dec2am(c), implied:S.implied(legs),
             total:total, profit:total - stake };
  },
  /* break-even win probability of the parlay, 0-1: 1 / combined decimal.
     A +300 parlay must win 25% of the time to break even. Null when empty. */
  implied: function(legs){
    if(!legs.length) return null;
    var c = S.combined(legs);
    return c > 1 ? 1 / c : null;
  },
  /* groups of legs sharing one game (2+ legs) — books treat same-game legs
     as correlated, so an independence-assuming parlay price won't hold there.
     Returns [{game, sides:[...]}]; empty when every leg is its own game. */
  sameGame: function(legs){
    var byGame = {}, order = [];
    legs.forEach(function(l){
      var g = (l && l.game) ? String(l.game) : "";
      if(!g) return;
      if(!byGame[g]){ byGame[g] = { game:g, sides:[] }; order.push(g); }
      byGame[g].sides.push(String(l.side || "?"));
    });
    return order.filter(function(g){ return byGame[g].sides.length > 1; })
                .map(function(g){ return byGame[g]; });
  },
  /* toggle a leg by id; returns true if added, false if removed */
  toggle: function(legs, leg){
    for(var i=0;i<legs.length;i++){
      if(legs[i].id === leg.id){ legs.splice(i,1); return false; }
    }
    legs.push(leg);
    return true;
  },
  remove: function(legs, id){
    for(var i=0;i<legs.length;i++){
      if(legs[i].id === id){ legs.splice(i,1); return; }
    }
  },
  clear: function(legs){ legs.length = 0; },
  /* ---- share-link codec: a compact base64url of {v:1,t:<ms>,s:<stake>,
     l:[legs]} with short keys to keep links short. Self-contained codec
     (no browser/node globals) so it's deterministic and unit-testable.
     encodeShare returns null when there is nothing to share (>40 legs is
     also refused — a slip that big makes an unusable link).
     decodeShare returns {legs, stake, ts} or null; never throws, never
     trusts the payload (bad shape, bad prices, oversized input -> null). */
  encodeShare: function(legs, stake, nowMs){
    legs = legs || [];
    if(!legs.length || legs.length > 40) return null;
    var compact = [];
    for(var i=0;i<legs.length;i++){
      var l = legs[i] || {}, p = Number(l.price);
      if(!l.id || !(p > 1)) return null;
      compact.push({ i:String(l.id), g:String(l.game||""), m:String(l.market||""),
        s:String(l.side||""), b:String(l.book||""), t:String(l.bookTitle||""),
        l:String(l.label||""), p:p, sp:String(l.sport||"") });
    }
    var st = Number(stake);
    var payload = JSON.stringify({
      v:1, t:(nowMs == null ? Date.now() : Number(nowMs)),
      s:(isFinite(st) && st >= 0 ? st : 100), l:compact
    });
    var enc = _b64uEncode(payload);
    return enc.length > 8192 ? null : enc;
  },
  decodeShare: function(str){
    var json = _b64uDecode(str);
    if(json == null) return null;
    var d;
    try{ d = JSON.parse(json); }catch(e){ return null; }
    if(!d || d.v !== 1 || !Array.isArray(d.l) || !d.l.length || d.l.length > 40) return null;
    var legs = [];
    for(var i=0;i<d.l.length;i++){
      var c = d.l[i] || {}, p = Number(c.p);
      if(!c.i || !(p > 1)) return null;
      legs.push({ id:String(c.i), game:String(c.g||""), market:String(c.m||""),
        side:String(c.s||""), book:String(c.b||""), bookTitle:String(c.t||""),
        label:String(c.l||""), price:p, sport:String(c.sp||"") });
    }
    var st = Number(d.s), ts = Number(d.t);
    return { legs:legs, stake:(isFinite(st) && st >= 0 ? st : 100),
             ts:(isFinite(ts) && ts > 0 ? ts : Date.now()) };
  },
  has: function(legs, id){
    for(var i=0;i<legs.length;i++){ if(legs[i].id === id) return true; }
    return false;
  },
  /* backfill `captured` (the price a leg was added at) for legs saved
     before this field existed — claim no move, start tracking now. */
  normalize: function(legs){
    legs.forEach(function(l){
      if(l && l.captured === undefined) l.captured = Number(l.price);
    });
    return legs;
  },
  /* Slip value summary: the board's current prices vs what each leg was
     captured at. Every slip leg is a back (tap-a-price), so a bigger
     current decimal = a better payout on offer now = the line moved your
     way. Returns null when nothing is priceable. */
  valueSummary: function(legs){
    var better = 0, worse = 0, same = 0, n = 0, cap = 1, cur = 1;
    legs.forEach(function(l){
      var c = Number(l && l.captured), p = Number(l && l.price);
      if(!(c > 1) || !(p > 1)) return;
      n++;
      cap *= c; cur *= p;
      var d = p - c;
      if(d > 0.0001) better++;
      else if(d < -0.0001) worse++;
      else same++;
    });
    if(!n) return null;
    return { n:n, better:better, worse:worse, same:same,
             captured:cap, current:cur };
  },
  /* re-price legs against the board's fresh id->decimal map.
     Mutates legs in place; returns ids whose price moved. */
  reprice: function(legs, idToPrice){
    var moved = [];
    legs.forEach(function(l){
      var p = idToPrice[l.id];
      if(p !== undefined && Math.abs(Number(p) - Number(l.price)) > 0.0001){
        l.prevPrice = l.price;
        l.price = Number(p);
        moved.push(l.id);
      }
    });
    return moved;
  }
};
if(typeof module !== "undefined" && module.exports){ module.exports = S; }
else { window.OddsSlip = S; }
})();
