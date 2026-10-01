/* GridIronUI — watch-page YouTube click-to-play facades (v1.130.0).
   The Watch page embeds seven YouTube playlist players, and each one pulls in
   heavyweight YouTube JS on page load even when the visitor never presses play.
   This converts every .video-card iframe into a lightweight poster button — the
   real player is injected only when the visitor taps it (a user gesture, so
   autoplay of the tapped playlist is allowed). No-JS fallback: without this
   script the iframes load exactly as before. Poster copy is deliberately
   generic — it never names a video that isn't there. */
(function(){
"use strict";
var W = {};

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

/* decorative poster content (button text itself is the aria-label) */
W.posterHtml = function(){
  return '<span class="vf-inner">' +
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
  var allow = iframe.getAttribute("allow");
  if(allow) btn.setAttribute("data-allow", allow);
  var fs = iframe.getAttribute("allowfullscreen");
  if(fs !== null && fs !== undefined ||
     (iframe.hasAttribute && iframe.hasAttribute("allowfullscreen")))
    btn.setAttribute("data-fullscreen", "1");
  btn.innerHTML = W.posterHtml();
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

/* wire click-to-play; safe to call more than once (idempotent: posters replace iframes) */
W.boot = function(doc){
  doc = doc || (typeof document !== "undefined" ? document : null);
  if(!doc || !doc.addEventListener) return 0;
  var n = W.convert(doc);
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
