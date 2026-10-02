/* GridIronUI team-follow — pure follow-list logic + followed-team move matching.
   Followed teams live in localStorage under "giu-followed-teams" as a JSON
   array of team abbreviations. Everything data-bearing here is pure and
   takes explicit arguments; only load/save/toggle touch storage (an optional
   `store` argument keeps them testable). Corrupt storage recovers to [] —
   a bad blob never breaks the board.
   Browser: window.GIU.TeamFollow · node: module.exports */
(function(){
"use strict";
var KEY = "giu-followed-teams";

/* Case normalization: " chi " -> "CHI". Abbreviations are canonical
   uppercase; matching is exact on the normalized form. */
function norm(s){
  return String(s == null ? "" : s).trim().toUpperCase();
}
/* Pure list cleanup: any input -> normalized, deduped array of plausible
   team abbreviations. Non-arrays, strings, nulls -> []; non-string or
   non-abbreviation-shaped entries are dropped (a follow list holds
   2-4 letter abbreviations, nothing else). */
function list(raw){
  if(!raw || typeof raw === "string" || typeof raw.length !== "number") return [];
  var out = [], seen = {}, i, n;
  for(i = 0; i < raw.length; i++){
    if(typeof raw[i] !== "string") continue;
    n = norm(raw[i]);
    if(!/^[A-Z]{2,4}$/.test(n) || seen[n]) continue;
    seen[n] = 1;
    out.push(n);
  }
  return out;
}
/* parse: raw storage string -> clean follow list. Corrupt JSON recovers
   to [] — never throws, never leaks a half-parsed blob. */
function parse(raw){
  if(raw == null || raw === "") return [];
  var arr;
  try{ arr = JSON.parse(raw); }catch(e){ return []; }
  return list(arr);
}
function ls(){
  try{ return (typeof localStorage !== "undefined") ? localStorage : null; }
  catch(e){ return null; }
}
function load(store){
  var s = store || ls(), raw = null;
  try{ raw = s ? s.getItem(KEY) : null; }catch(e){ raw = null; }
  return parse(raw);
}
function save(lst, store){
  var s = store || ls();
  try{ if(s) s.setItem(KEY, JSON.stringify(list(lst))); }catch(e){}
}
function has(lst, abbr){
  return list(lst).indexOf(norm(abbr)) !== -1;
}
/* follow: returns a NEW list with abbr added; already-followed is a no-op
   (never duplicates). */
function follow(lst, abbr){
  abbr = norm(abbr);
  var out = list(lst);
  if(abbr && out.indexOf(abbr) === -1) out.push(abbr);
  return out;
}
/* unfollow: returns a NEW list with abbr removed; unknown abbr is a no-op. */
function unfollow(lst, abbr){
  abbr = norm(abbr);
  return list(lst).filter(function(x){ return x !== abbr; });
}
/* toggle: storage-backed flip. Returns {list, followed}. */
function toggle(abbr, store){
  var cur = load(store), on = has(cur, abbr);
  var next = on ? unfollow(cur, abbr) : follow(cur, abbr);
  save(next, store);
  return { list: next, followed: !on };
}
/* abbrOf: resolve a full team name to its abbreviation via the caller's
   find(dir, league, name) (GIU.teamFind in the browser). Never guesses —
   null when nothing resolves, so unknown teams simply get no ★ toggle. */
function abbrOf(find, dir, league, name){
  var t = null;
  try{ t = find ? find(dir, league, name) : null; }catch(e){ t = null; }
  var a = (t && t.abbr) ? norm(t.abbr) : "";
  return a || null;
}
/* followedInGame: first followed abbreviation playing in this game
   (checks both sides), or null. Pure — the caller resolves the abbrs. */
function followedInGame(lst, abbrAway, abbrHome){
  var f = list(lst), aa = norm(abbrAway), ha = norm(abbrHome), i;
  if(!f.length) return null;
  for(i = 0; i < f.length; i++){
    if((aa && f[i] === aa) || (ha && f[i] === ha)) return f[i];
  }
  return null;
}
/* involvedMoves: pure candidate computation. Takes the steam-move records
   from the caller's moveAlerts (OL.moveAlerts in the browser) and returns
   only those whose game involves a followed team, each stamped .followed
   with the matched abbreviation. The caller owns the threshold. */
function involvedMoves(find, dir, league, events, baseline, followed, threshold, tsNow, moveAlerts){
  var out = [];
  var f = list(followed);
  if(!f.length || typeof moveAlerts !== "function") return out;
  var hits = moveAlerts(events, baseline, threshold, tsNow);
  var byId = {};
  (events || []).forEach(function(ev){ if(ev && ev.id != null) byId[ev.id] = ev; });
  hits.forEach(function(a){
    var ev = a && byId[a.id];
    if(!ev) return;
    var m = followedInGame(f,
      abbrOf(find, dir, league, ev.away_team),
      abbrOf(find, dir, league, ev.home_team));
    if(m){ a.followed = m; out.push(a); }
  });
  return out;
}

var TF = {
  KEY: KEY,
  norm: norm,
  list: list,
  parse: parse,
  load: load,
  save: save,
  has: has,
  follow: follow,
  unfollow: unfollow,
  toggle: toggle,
  abbrOf: abbrOf,
  followedInGame: followedInGame,
  involvedMoves: involvedMoves
};
if(typeof module !== "undefined" && module.exports){ module.exports = TF; }
else {
  var G = (typeof window !== "undefined") ? (window.GIU = window.GIU || {}) : {};
  G.TeamFollow = TF;
}
})();
