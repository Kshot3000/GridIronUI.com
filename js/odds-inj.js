/* GridIronUI odds-board injury badges — pure glue between the odds board and
   ESPN's injuries feed. Injuries move lines, so every NFL game card gets a
   quiet one-liner naming each team's reportable injuries, linked to the
   site's full injury wire.

   Honesty rules (no invented data):
   - the injuries feed comes from one CORS-open ESPN fetch per board render
     (zero Odds-API quota);
   - severity ranking mirrors the injuries page: Out / Injured Reserve >
     Doubtful > Questionable / Day-To-Day; everything else (Active,
     Suspension, Bereavement, Paternity…) is not an injury for betting
     purposes and is never counted;
   - a team that can't be matched to the feed, or has no reportable
     injuries, stays silent — no badge beats a wrong badge;
   - only COUNTS are shown on the card (no player names), keeping cards
     compact; the link points to the full wire.

   Browser: window.OddsInj · node: module.exports */
(function(){
"use strict";
var INJ = {};

/* Betting-relevance severity: 3 out, 2 doubtful, 1 questionable, 0 ignorable. */
INJ.sevRank = function(status){
  var s = String(status || "");
  if(/out|injured reserve|\bil\b|injured list/i.test(s)) return 3;
  if(/doubtful/i.test(s)) return 2;
  if(/questionable|day[- ]to[- ]day/i.test(s)) return 1;
  return 0;
};

/* Count reportable injuries by severity. Non-injury statuses drop out. */
INJ.countsFor = function(injuries){
  var c = {out: 0, doubtful: 0, questionable: 0};
  (injuries || []).forEach(function(i){
    var r = INJ.sevRank(i && i.status);
    if(r === 3) c.out++;
    else if(r === 2) c.doubtful++;
    else if(r === 1) c.questionable++;
  });
  return c;
};

/* Index an ESPN injuries payload by normalized team display name, so the
   board can look teams up without guessing. Duplicate names keep the first. */
INJ.indexByName = function(payload){
  var idx = {};
  var teams = payload && payload.injuries;
  if(!Array.isArray(teams)) return idx;
  teams.forEach(function(t){
    if(!t || !t.displayName) return;
    var k = String(t.displayName).toLowerCase().trim();
    if(k && !idx[k]) idx[k] = t;
  });
  return idx;
};

/* One team's card line: null when there's nothing reportable.
   dirTeam carries abbr + displayName from the site's team directory. */
INJ.cardLine = function(dirTeam, espnTeam){
  if(!dirTeam || !espnTeam) return null;
  var c = INJ.countsFor(espnTeam.injuries);
  var parts = [];
  if(c.out) parts.push(c.out + " out");
  if(c.doubtful) parts.push(c.doubtful + " doubtful");
  if(c.questionable) parts.push(c.questionable + " questionable");
  if(!parts.length) return null;
  return { abbr: dirTeam.abbr || "", text: parts.join(", ") };
};

/* The badge HTML for one game card, or "" when both sides are quiet.
   esc is injected (GIU.esc in the browser). */
INJ.badgeHtml = function(awayLine, homeLine, esc){
  var segs = [];
  [awayLine, homeLine].forEach(function(l){
    if(l && l.abbr && l.text)
      segs.push("<b>" + esc(l.abbr) + "</b> " + esc(l.text));
  });
  if(!segs.length) return "";
  return '<span class="inj-badge" title="Key injuries from ESPN, updated today. ' +
    'Lines move on this news — check the full wire before you bet.">' +
    "&#x1FA7A; " + segs.join(" &middot; ") +
    ' &mdash; <a href="injuries.html">injury wire &rarr;</a></span>';
};

if(typeof module !== "undefined" && module.exports){ module.exports = INJ; }
else if(typeof window !== "undefined"){ window.OddsInj = INJ; }
})();
