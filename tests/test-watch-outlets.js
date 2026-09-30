/* Regression guard for the Watch page outlet/playlist IDs in shipped watch.html.
   YouTube channels get rebranded (CBS Sports' old channel id UCrRttZIypNTA1Mrfwo745Sg
   now resolves to "Paramount Plus - YouTube"), so a label that points at the wrong
   channel is a quiet honesty bug: the playlist playing under "CBS Sports" would be
   Paramount Plus uploads. This test pins every channel/playlist id on the page to
   the ids verified live on 2026-09-29 (channel page <title> + working embeds playlist).
   Run: node tests/test-watch-outlets.js */
"use strict";
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var fails = 0;
function ok(name, cond, extra){
  if(!cond){ fails++; console.error("FAIL", name, extra === undefined ? "" : extra); }
  else console.log("ok  ", name);
}
var html = fs.readFileSync(path.join(ROOT, "watch.html"), "utf8");

/* Label -> verified channel id (UC form). The CBS Sports id was re-verified
   2026-09-29: youtube.com/@CBSSports canonicalizes to it and the channel
   <title> is "CBS Sports - YouTube"; the old id now serves Paramount Plus. */
var OUTLETS = {
  "ESPN":          "UCiio0ydw439X13KyZgMIcHw",
  "FOX Sports":    "UCvQrivswRDGK0lZ_AcUHp8g",
  "CBS Sports":    "UCja8sZ2T4ylIqjggA1Zuukg",
  "NBC Sports":    "UCqZQlzSHbVJrwrn5XvzrzcA",
  "NFL":           "UCDVYQ4Zhbm3S2dlz7P1GBDg",
  "NFL on ESPN":   "UCiWLfSweyRNmLpgEHekhoAg",
  "Action Network": "UCvv0ade-LVRA2fp9C5-C6hQ",
  "WagerTalk TV":  "UCNLTjT8_c2gyVNDIKf2YwEw"
};
var PARAMOUNT_PLUS = "UCrRttZIypNTA1Mrfwo745Sg"; // stale CBS Sports id (verified rebranded 2026-09-29)

ok("CBS Sports does not point at the Paramount Plus channel", html.indexOf(PARAMOUNT_PLUS) === -1, "found stale id");
ok("CBS Sports does not embed the Paramount Plus playlist", html.indexOf("UUrRttZIypNTA1Mrfwo745Sg") === -1, "found stale playlist");

var labels = Object.keys(OUTLETS);
labels.forEach(function(label){
  var ch = OUTLETS[label];
  ok(label + ": channel link present", html.indexOf("youtube.com/channel/" + ch) !== -1);
  /* Uploads playlist id is the channel id with UC -> UU. */
  var pl = "UU" + ch.slice(2);
  var usesEmbed = html.indexOf("embed/videoseries?list=" + pl) !== -1;
  var usesPlaylist = html.indexOf("youtube.com/playlist?list=" + pl) !== -1;
  ok(label + ": uploads playlist wired (" + pl + ")", usesEmbed || usesPlaylist);
});

/* The video-card section: every embed/videoseries playlist id must be the UU form
   of a channel id that also appears as a channel link on the page. */
var cardRe = /embed\/videoseries\?list=(UU[A-Za-z0-9_-]{22})/g, m, cards = [];
while((m = cardRe.exec(html)) !== null){ cards.push(m[1]); }
ok("video cards found", cards.length === 7, "found=" + cards.length);
cards.forEach(function(pl){
  var ch = "UC" + pl.slice(2);
  ok("card playlist " + pl + " matches a linked channel", html.indexOf("youtube.com/channel/" + ch) !== -1);
});

if(fails){ console.error(fails + " FAILURE(S)"); process.exit(1); }
console.log("ALL WATCH-OUTLET CHECKS PASSED");
