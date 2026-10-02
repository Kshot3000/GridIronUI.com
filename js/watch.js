/* GridIronUI — watch-page YouTube click-to-play facades (v1.148.0).
   The Watch page embeds seven YouTube playlist players, and each one pulls in
   heavyweight YouTube JS on page load even when the visitor never presses play.
   This converts every .video-card iframe into a lightweight poster button — the
   real player is injected only when the visitor taps it (a user gesture, so
   autoplay of the tapped playlist is allowed). Posters carry per-outlet
   branding (name + accent hue from the shipped lookup; the name is the same
   outlet named in the card header, so nothing is promised that isn't there).
   The #weekend-spotlight band is date-gated: it only renders inside its
   data-start/data-end window and removes itself outside it, so the editorial
   note can never go stale. No-JS fallback: without this script the iframes
   load exactly as before, and the spotlight stays hidden. */
(function(){
"use strict";
var W = {};

/* outlet branding keyed by the uploads-playlist list id (UU...); these ids are
   pinned by tests/test-watch-outlets.js to the verified channel ids, so the
   branding below always names the outlet whose player the card embeds. Hues
   are accents only — the gold play disc keeps the site's identity. */
W.OUTLETS = {
  "UUiWLfSweyRNmLpgEHekhoAg": { name: "ESPN",            hue: 4   },
  "UUvQrivswRDGK0lZ_AcUHp8g": { name: "NFL on FOX",      hue: 214 },
  "UUja8sZ2T4ylIqjggA1Zuukg": { name: "CBS Sports",      hue: 152 },
  "UUqZQlzSHbVJrwrn5XvzrzcA": { name: "NBC Sports",      hue: 268 },
  "UUiio0ydw439X13KyZgMIcHw": { name: "NFL on ESPN",     hue: 16  },
  "UUvv0ade-LVRA2fp9C5-C6hQ": { name: "Action Network",  hue: 38  },
  "UUNLTjT8_c2gyVNDIKf2YwEw": { name: "WagerTalk TV",    hue: 190 }
};

/* autoplay variant of a youtube embed URL; untouched for anything else */
W.autoplayUrl = function(src){
  if(typeof src !== "string" || src.indexOf("youtube.com/embed/") < 0) return src;
  return src + (src.indexOf("?") >= 0 ? "&" : "?") + "autoplay=1";
};

/* honest, non-promising poster label for an outlet player */
W.facadeLabel = function(title){
  var t = (typeof title === "string" ? title : "").trim();
  return "Load the latest-uploads player" + (t ? ": " + t : "");
};

/* decorative poster content (button text itself is the aria-label); outlet is
   the W.OUTLETS entry for this player, or null for the generic poster */
W.escapeHtml = function(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
};

W.listIdOf = function(src){
  if(typeof src !== "string") return null;
  var m = src.match(/[?&]list=([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
};

W.outletFor = function(listId){
  return (typeof listId === "string" && W.OUTLETS.hasOwnProperty(listId))
    ? W.OUTLETS[listId] : null;
};

W.posterHtml = function(outlet){
  var brand = (outlet && outlet.name)
    ? '<span class="vf-brand" aria-hidden="true">' + W.escapeHtml(outlet.name) + "</span>"
    : "";
  return '<span class="vf-inner">' + brand +
    '<span class="vf-disc" aria-hidden="true"><span class="vf-tri"></span></span>' +
    '<span class="vf-cap" aria-hidden="true">Latest uploads &middot; tap to play</span>' +
    "</span>";
};

/* build the poster button for an iframe element; null for non-youtube embeds */
W.facadeFor = function(doc, iframe){
  if(!iframe || !iframe.getAttribute) return null;
  var src = iframe.getAttribute("src") || "";
  if(src.indexOf("youtube.com/embed/") < 0) return null;
  var btn = doc.createElement("button");
  btn.setAttribute("type", "button");
  btn.className = "v-facade";
  var title = iframe.getAttribute("title") || "";
  btn.setAttribute("aria-label", W.facadeLabel(title));
  btn.setAttribute("data-embed", src);
  if(title) btn.setAttribute("data-title", title);
  var outlet = W.outletFor(W.listIdOf(src));
  if(outlet){
    btn.setAttribute("data-outlet", outlet.name);
    if(btn.style && btn.style.setProperty)
      btn.style.setProperty("--vf-hue", String(outlet.hue));
  }
  var allow = iframe.getAttribute("allow");
  if(allow) btn.setAttribute("data-allow", allow);
  var fs = iframe.getAttribute("allowfullscreen");
  if(fs !== null && fs !== undefined ||
     (iframe.hasAttribute && iframe.hasAttribute("allowfullscreen")))
    btn.setAttribute("data-fullscreen", "1");
  btn.innerHTML = W.posterHtml(outlet);
  return btn;
};

/* swap a poster button for the live player (call on the user's click) */
W.activate = function(doc, btn){
  var f = doc.createElement("iframe");
  f.setAttribute("src", W.autoplayUrl(btn.getAttribute("data-embed")));
  f.setAttribute("title", btn.getAttribute("data-title") || "Latest uploads playlist");
  var allow = btn.getAttribute("data-allow");
  if(allow) f.setAttribute("allow", allow);
  if(btn.getAttribute("data-fullscreen") === "1") f.setAttribute("allowfullscreen", "");
  f.setAttribute("frameborder", "0");
  var parent = btn.parentNode;
  if(parent && parent.replaceChild) parent.replaceChild(f, btn);
  return f;
};

/* climb from a click target to the enclosing poster button, if any */
W.closestFacade = function(doc, el){
  while(el && el !== doc){
    if(el.classList && el.classList.contains && el.classList.contains("v-facade"))
      return el;
    el = el.parentNode;
  }
  return null;
};

/* convert every youtube iframe on the page; returns the converted count */
W.convert = function(doc){
  doc = doc || (typeof document !== "undefined" ? document : null);
  if(!doc || !doc.querySelectorAll) return 0;
  var frames = doc.querySelectorAll(".video-card iframe");
  var n = 0;
  for(var i = 0; i < frames.length; i++){
    var btn = W.facadeFor(doc, frames[i]);
    if(!btn) continue;
    var parent = frames[i].parentNode;
    if(!parent || !parent.replaceChild) continue;
    parent.replaceChild(btn, frames[i]);
    n++;
  }
  return n;
};

/* weekend spotlight: date-gated editorial band. Shown only while the local
   date sits inside data-start..data-end (both YYYY-MM-DD, inclusive); outside
   the window the band removes itself so the note can never go stale. Returns
   "shown", "expired", or "none". */
W.todayStr = function(d){
  d = (d instanceof Date) ? d : new Date();
  var m = d.getMonth() + 1, day = d.getDate();
  return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
};

W.inWindow = function(start, end, today){
  var ok = /^\d{4}-\d{2}-\d{2}$/;
  if(!ok.test(start || "") || !ok.test(end || "") || !ok.test(today || "")) return false;
  return start <= today && today <= end;
};

W.revealWeekend = function(doc, today){
  doc = doc || (typeof document !== "undefined" ? document : null);
  if(!doc || !doc.getElementById) return "none";
  var sec = doc.getElementById("weekend-spotlight");
  if(!sec) return "none";
  var now = today || W.todayStr(new Date());
  if(W.inWindow(sec.getAttribute("data-start"), sec.getAttribute("data-end"), now)){
    sec.removeAttribute("hidden");
    return "shown";
  }
  if(sec.parentNode && sec.parentNode.removeChild) sec.parentNode.removeChild(sec);
  return "expired";
};

/* wire click-to-play; safe to call more than once (idempotent: posters replace iframes) */
W.boot = function(doc){
  doc = doc || (typeof document !== "undefined" ? document : null);
  if(!doc || !doc.addEventListener) return 0;
  var n = W.convert(doc);
  W.revealWeekend(doc);
  if(n > 0){
    doc.addEventListener("click", function(ev){
      var btn = W.closestFacade(doc, ev.target);
      if(btn) W.activate(doc, btn);
    });
  }
  return n;
};

if(typeof module !== "undefined" && module.exports) module.exports = W;
else{
  if(typeof window !== "undefined") window.GIUWatch = W;
  if(typeof document !== "undefined"){
    if(document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", function(){ W.boot(document); });
    else W.boot(document);
  }
}
})();
