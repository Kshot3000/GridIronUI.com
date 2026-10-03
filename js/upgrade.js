/* GridIronUI 2.0: accessible site search, shared navigation and personal tools.
   Static hosting friendly; no build step and no new production dependency. */
(function(root){
"use strict";
var CATALOG = [
  ["Game room","index.html","Your sports research headquarters","Workspace","home"],
  ["Scores & stats","scores.html","Live scoreboard, schedules, results and game detail","Workspace","score"],
  ["Odds board","odds.html","Compare spreads, moneylines and totals across sportsbooks; requires your API key","Workspace","chart"],
  ["Prediction markets","markets.html","Polymarket and Kalshi crowd prices","Workspace","market"],
  ["Win probabilities","predictions.html","Market-implied predictions and methodology","Workspace","trend"],
  ["DFS Lab","dfs.html","DraftKings and FanDuel lineup optimizer, CSV import and export","Tools","flask"],
  ["AI Coach","ai-coach.html","Chat with Grid about your DFS player pool","Tools","spark"],
  ["Betting calculators","tools.html","17 calculators for sportsbook math","Tools","calculator"],
  ["Bet journal","journal.html","Track bets, bankroll, profit, ROI and closing line value","Tools","book"],
  ["News wire","news.html","Sports news, latest headlines and your teams","Intelligence","news"],
  ["Injury reports","injuries.html","Player status, questionable, doubtful and out","Intelligence","health"],
  ["Game-day weather","weather.html","Stadium forecasts, wind, rain and conditions","Intelligence","cloud"],
  ["Watch","watch.html","Sports video, analysis and shows","Intelligence","play"],
  ["Betting 101","guides/betting-101.html","Learn odds, probability and the fundamentals","Playbook","learn"],
  ["Bet types","guides/bet-types.html","Moneyline, spread, totals, parlays and futures","Playbook","learn"],
  ["Bankroll management","guides/bankroll.html","Units, limits, staking and responsible planning","Playbook","learn"],
  ["Advanced strategy","guides/advanced.html","EV, hedging, middling, arbitrage and closing line value","Playbook","learn"],
  ["Live betting","guides/live-betting.html","In-play odds and price changes","Playbook","learn"],
  ["Reading line movement","guides/line-movement.html","Steam, reverse line movement and market signals","Playbook","learn"],
  ["The player props playbook","guides/props.html","Player props, pricing and line shopping","Playbook","learn"],
  ["Glossary A–Z","glossary.html","Sports betting terms explained","Playbook","book"],
  ["Odds converter","tools.html#converter","Convert American, decimal and fractional prices","Calculator","calculator"],
  ["Implied probability","tools.html#implied","Calculate break-even win probability from odds","Calculator","calculator"],
  ["Payout calculator","tools.html#payout","Calculate profit and total return from your stake","Calculator","calculator"],
  ["Parlay calculator","tools.html#parlay","Combine multiple legs and calculate payout","Calculator","calculator"],
  ["Round-robin calculator","tools.html#roundrobin","Combinations, by 2s, by 3s and total cost","Calculator","calculator"],
  ["Kelly stake calculator","tools.html#kelly","Full, half or quarter Kelly bankroll sizing","Calculator","calculator"],
  ["Expected value calculator","tools.html#ev","EV, your probability and the market price","Calculator","calculator"],
  ["Vig remover","tools.html#vig","Remove the sportsbook margin and overround","Calculator","calculator"],
  ["Hedge & arbitrage finder","tools.html#hedge","Two sides, stake sizing and arbitrage math","Calculator","calculator"],
  ["Ticket hedge planner","tools.html#tickethedge","Equal lock, free-roll and custom hedge stakes","Calculator","calculator"],
  ["Middle calculator","tools.html#middle","Spread and total middles and both sides of a bet","Calculator","calculator"],
  ["Bonus & promo value","tools.html#bonus","Bonus bets, rollover requirements and profit boosts","Calculator","calculator"],
  ["Cash-out evaluator","tools.html#cashout","Compare a cash out offer to a fair value","Calculator","calculator"],
  ["Dutching calculator","tools.html#dutching","Split stakes for equal returns across outcomes","Calculator","calculator"],
  ["Teaser calculator","tools.html#teaser","Key numbers, Wong teasers and adjusted lines","Calculator","calculator"],
  ["Bankroll simulator","tools.html#bankroll","Simulate staking plans and variance","Calculator","calculator"],
  ["Journal dashboard","tools.html#journal-tool","Track the record behind your decisions","Calculator","book"],
  ["Betting links","links.html","Sports research resources and operator directory","Resources","globe"],
  ["Responsible gambling","responsible-gambling.html","Limits, support and help resources","Resources","health"],
  ["About GridIronUI","about.html","Project, purpose and data sources","Resources","globe"],
  ["Contact","contact.html","Get in touch with the creator","Resources","news"],
  ["Privacy policy","privacy.html","How browser storage and external services are used","Resources","lock"],
  ["Terms of use","terms.html","Educational use and service terms","Resources","book"],
  ["Affiliate disclosure","affiliate-disclosure.html","Advertising and referral transparency","Resources","book"],
  ["Legality","legality.html","State rules and regulatory resources","Resources","book"],
  ["Partners","partners.html","Partnership information","Resources","globe"]
];
var PATHS={
 home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/><path d="M9 21v-8h6v8"/>',
 score:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 5v14M7 9v6m10-6v6M1 10h2m18 0h2"/>',
 chart:'<path d="M4 20V10m5 10V4m6 16v-7m5 7V7"/>',
 market:'<path d="m3 8 5-5 5 5M8 3v13m13 0-5 5-5-5m5 5V8"/>',
 trend:'<path d="m3 17 6-6 4 4 8-10m-6 0h6v6"/>',
 flask:'<path d="M9 3h6m-5 0v7L4 19a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2l-6-9V3M7 15h10"/>',
 spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
 calculator:'<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8M8 10h1m6 0h1m-8 4h1m6 0h1m-8 4h1m6 0h1"/>',
 book:'<path d="M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-3-2H4Zm16 0h-4a3 3 0 0 0-3 3m0 14a4 4 0 0 1 3-2h4V4"/>',
 news:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 7h4v4H7Zm8 0h2m-2 4h2M7 15h10M7 18h7"/>',
 health:'<path d="M3 12h4l3-8 4 16 3-8h4"/>',
 cloud:'<path d="M6 17a4 4 0 1 1 .2-8 6 6 0 0 1 11.5-1 4.5 4.5 0 1 1 .8 9H6Z"/>',
 play:'<rect x="2" y="4" width="20" height="16" rx="3"/><path d="m10 8 6 4-6 4Z"/>',
 learn:'<path d="m2 8 10-5 10 5-10 5Zm4 3v6q6 5 12 0v-6m4-3v8"/>',
 globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
 arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-14 4h3m4 0h3m-10 4h3"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',
 up:'<path d="m6 14 6-6 6 6"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>'
};
function icon(name){return '<svg class="giu-icon" viewBox="0 0 24 24" aria-hidden="true">'+(PATHS[name]||PATHS.chart)+'</svg>';}
function search(query,catalog){
  var terms=String(query||'').trim().toLowerCase().split(/\s+/).filter(Boolean);
  return (catalog||CATALOG).filter(function(x){var txt=(x[0]+' '+x[2]+' '+x[3]).toLowerCase();return terms.every(function(t){return txt.indexOf(t)!==-1;});}).sort(function(a,b){
    if(!terms.length)return 0;
    var qa=terms.filter(function(t){return a[0].toLowerCase().indexOf(t)!==-1;}).length;
    var qb=terms.filter(function(t){return b[0].toLowerCase().indexOf(t)!==-1;}).length;return qb-qa;
  });
}
function quickPayout(odds,stake){
  var raw=String(odds).trim(),a=Number(raw),s=Number(stake);
  if(!/^[+-]?\d+$/.test(raw)||!Number.isFinite(a)||Math.abs(a)<100||a===-100)throw new Error('Use American odds like -110 or +150. Even money is +100.');
  if(!Number.isFinite(s)||s<=0||s>1e9)throw new Error('Enter a stake greater than $0 and no more than $1 billion.');
  var decimal=a>0?1+a/100:1+100/Math.abs(a),profit=s*(decimal-1);
  if(!Number.isFinite(profit))throw new Error('These numbers are too large.');
  return {profit:profit,total:s*decimal,probability:100/decimal};
}
if(typeof module!=='undefined'&&module.exports){module.exports={search:search,quickPayout:quickPayout,catalog:CATALOG};return;}
var doc=root.document,BASE=root.GIU_BASE||'.',G,esc;
function url(p){return BASE+'/'+p;}
function el(tag,cls,html){var n=doc.createElement(tag);if(cls)n.className=cls;if(html!==undefined)n.innerHTML=html;return n;}
function read(key,fallback){try{var v=JSON.parse(localStorage.getItem(key));return v===null?fallback:v;}catch(e){return fallback;}}
function money(n){return n.toLocaleString('en-US',{style:'currency',currency:'USD'});}
var toastTimer;
function toast(msg){var n=doc.getElementById('giuToast');if(!n){n=el('div','giu-toast');n.id='giuToast';n.setAttribute('role','status');doc.body.appendChild(n);}n.textContent=msg;n.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(function(){n.hidden=true;},4200);}
function boot(){
 G=root.GIU||{};esc=G.esc||function(v){return String(v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
 doc.querySelectorAll('[data-icon]').forEach(function(n){n.outerHTML=icon(n.dataset.icon);});
 var header=doc.querySelector('.header-inner'),nav=doc.getElementById('mainNav');
 if(!header||!nav)return;
 nav.setAttribute('aria-label','Main navigation');
 var byFile={};nav.querySelectorAll('a').forEach(function(a){byFile[a.getAttribute('href').split('/').pop()]=a;});
 var groups=[['Workspace',['index.html','scores.html','odds.html','markets.html','predictions.html']],['Your toolkit',['dfs.html','ai-coach.html','tools.html','journal.html']],['Intelligence',['news.html','injuries.html','weather.html','watch.html']],['The playbook',['betting-101.html','links.html']]];
 groups.forEach(function(group){nav.appendChild(el('div','nav-section',group[0]));group[1].forEach(function(f){var a=byFile[f];if(!a)return;var entry=CATALOG.find(function(c){return c[1].split('/').pop()===f;});a.innerHTML=icon(entry?entry[4]:'chart')+'<span>'+esc(f==='index.html'?'Overview':a.textContent)+'</span>';nav.appendChild(a);});});
 var foot=el('div','nav-foot','<button class="btn btn-ghost btn-sm" id="teamsNav">'+icon('star')+' Your teams</button><small>YOUR GAME. YOUR EDGE.</small><span class="nav-free">Free. Independent. Always.</span>');nav.appendChild(foot);
 var active=nav.querySelector('[aria-current="page"]'),title=active?active.textContent.trim():(doc.querySelector('h1')||{}).textContent||'Explore';
 header.appendChild(el('div','app-crumb','<span>Workspace</span><span>/</span><b>'+esc(title)+'</b>'));
 var utilities=el('div','app-tools','<button class="app-search" id="openSearch" aria-label="Search pages and tools">'+icon('search')+'<span>Find anything…</span><kbd>⌘ K</kbd></button><button class="icon-btn" id="openTeams" aria-label="Choose your teams" title="Your teams">'+icon('star')+'</button>');
 var pill=doc.getElementById('feedPill');if(pill&&doc.body.hasAttribute('data-feedcheck'))utilities.appendChild(pill);else if(pill)pill.hidden=true;
 utilities.appendChild(el('span','app-avatar','GI'));header.appendChild(utilities);
 var tog=doc.getElementById('navToggle');tog.innerHTML=icon('menu');tog.setAttribute('aria-label','Open navigation menu');
 // Close navigation on outside click, and restore focus when Escape closes it.
 doc.addEventListener('click',function(e){if(nav.classList.contains('open')&&!nav.contains(e.target)&&!tog.contains(e.target)){nav.classList.remove('open');tog.setAttribute('aria-expanded','false');}});
 var mobile=el('nav','mobile-nav');mobile.setAttribute('aria-label','Quick navigation');
 [['Home','index.html','home'],['Scores','scores.html','score'],['Odds','odds.html','chart'],['Tools','tools.html','calculator']].forEach(function(x){var a=el('a',byFile[x[1]]&&byFile[x[1]].classList.contains('active')?'active':'',icon(x[2])+'<span>'+x[0]+'</span>');a.href=url(x[1]);if(a.className)a.setAttribute('aria-current','page');mobile.appendChild(a);});
 var more=el('button','',icon('menu')+'<span>More</span>');more.setAttribute('aria-label','Open all navigation');more.addEventListener('click',function(e){e.stopPropagation();tog.click();if(nav.classList.contains('open'))(nav.querySelector('.active')||nav.querySelector('a')).focus();});mobile.appendChild(more);doc.body.appendChild(mobile);
 setupSearch();setupTeams();setupDashboard();
 var iconNames=['learn','score','chart','trend','spark','book','flask'];doc.querySelectorAll('.card-icon').forEach(function(n,i){var a=n.closest('a'),entry=a&&CATALOG.find(function(c){return a.getAttribute('href')===c[1];});n.innerHTML=icon(entry?entry[4]:iconNames[i%iconNames.length]);});
 // A real main landmark, preserving existing anchor IDs and page-level handlers.
 var main=doc.querySelector('main');if(!main){main=el('main');var first=doc.querySelector('.site-header').nextElementSibling,footer=doc.querySelector('.site-footer');if(first&&footer){first.before(main);while(main.nextElementSibling&&main.nextElementSibling!==footer)main.appendChild(main.nextElementSibling);}}
 if(main){main.setAttribute('aria-label','Main content');if(!doc.getElementById('giu-main'))main.id='giu-main';}
 var top=el('button','giu-top',icon('up'));top.setAttribute('aria-label','Back to top');top.hidden=true;top.addEventListener('click',function(){root.scrollTo({top:0,behavior:root.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});doc.body.appendChild(top);root.addEventListener('scroll',function(){top.hidden=root.scrollY<650;},{passive:true});
 var offline=el('div','giu-offline','You’re offline. Calculators and saved journal entries are still available on pages already loaded.');offline.setAttribute('role','status');offline.hidden=navigator.onLine;doc.querySelector('.site-header').after(offline);root.addEventListener('offline',function(){offline.hidden=false;});root.addEventListener('online',function(){offline.hidden=true;toast('Connection restored. Refresh any live board to update it.');});
 doc.addEventListener('error',function(e){if(e.target.tagName==='IMG')e.target.style.display='none';},true);
}
function dialog(id,title,description){
 var d=el('dialog','giu-dialog','<div class="dialog-head"><div><h2 id="'+id+'Title">'+title+'</h2><p>'+description+'</p></div><button class="icon-btn" data-close aria-label="Close dialog">'+icon('close')+'</button></div>');d.id=id;d.setAttribute('aria-labelledby',id+'Title');doc.body.appendChild(d);d.querySelector('[data-close]').addEventListener('click',function(){d.close();});d.addEventListener('click',function(e){if(e.target===d){var r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});return d;
}
function setupSearch(){
 var d=dialog('giuSearch','Find your next move.','Pages, calculators, guides. One search.');
 d.insertAdjacentHTML('beforeend','<div class="dialog-search">'+icon('search')+'<input id="globalSearch" type="search" placeholder="Try “parlay”, “weather” or “bankroll”…" autocomplete="off" aria-label="Search pages and tools" aria-controls="searchResults"></div><div class="search-results" id="searchResults"></div><div class="dialog-foot"><span id="searchCount" role="status"></span><span>↑ ↓ navigate &nbsp; · &nbsp; Esc close</span></div>');
 var input=d.querySelector('input'),results=d.querySelector('#searchResults');
 function render(){var rows=search(input.value);results.innerHTML=rows.slice(0,20).map(function(c){return '<a class="search-item" href="'+url(c[1])+'">'+icon(c[4])+'<span><b>'+esc(c[0])+'</b><small>'+esc(c[2])+'</small></span><span class="search-group">'+esc(c[3])+'</span></a>';}).join('')||'<div class="search-empty">No matches. Try “odds”, “DFS” or “guides”.</div>';d.querySelector('#searchCount').textContent=rows.length+' result'+(rows.length===1?'':'s')+(rows.length>20?' · showing first 20':'');}
 function open(){if(d.open)return;input.value='';render();d.showModal();input.focus();}
 doc.getElementById('openSearch').addEventListener('click',open);input.addEventListener('input',render);
 doc.addEventListener('keydown',function(e){var typing=/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.target.isContentEditable;if(((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k')||(!typing&&e.key==='/')){e.preventDefault();open();}});
 d.addEventListener('keydown',function(e){var links=Array.from(results.querySelectorAll('a')),i=links.indexOf(doc.activeElement);if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();var step=e.key==='ArrowDown'?1:-1;if(links.length)links[(i+step+links.length)%links.length].focus();}else if(e.key==='Enter'&&doc.activeElement===input&&links[0]){e.preventDefault();links[0].click();}});
}
function setupTeams(){
 var d=dialog('giuTeams','Make it your game.','Follow NFL teams to highlight them across your game-day boards.');
 d.insertAdjacentHTML('beforeend','<div class="dialog-search">'+icon('search')+'<input type="search" placeholder="Find a team…" aria-label="Find an NFL team"></div><p class="team-dialog-info" id="teamSaveState" role="status">Your selection is saved in this browser.</p><div class="team-pick-list"></div><div class="dialog-foot"><span id="teamCount"></span><button class="btn btn-gold btn-sm" id="teamDone">Done</button></div>');
 var input=d.querySelector('input'),list=d.querySelector('.team-pick-list'),teams=[],selected=[],changed=false;
 function followed(){var a=read('giu-followed-teams',[]);return Array.isArray(a)?a.filter(function(t){return typeof t==='string'&&/^[A-Z]{2,4}$/.test(t);}):[];}
 function render(){var query=input.value.toLowerCase().trim();list.innerHTML=teams.filter(function(t){return (t.displayName+' '+t.abbr).toLowerCase().indexOf(query)!==-1;}).map(function(t){var yes=selected.indexOf(t.abbr)!==-1;return '<button class="team-choice" data-team="'+esc(t.abbr)+'" aria-pressed="'+yes+'"><span class="team-monogram">'+esc(t.abbr)+'</span><span>'+esc(t.displayName)+'</span><span class="star">'+(yes?'★':'☆')+'</span></button>';}).join('')||'<p class="mini-note">No matching teams.</p>';d.querySelector('#teamCount').textContent=teams.filter(function(t){return selected.indexOf(t.abbr)!==-1;}).length+' NFL teams followed';}
 async function open(){selected=followed();changed=false;input.value='';d.showModal();input.focus();if(teams.length){render();return;}list.innerHTML='<p class="mini-note">Loading teams…</p>';try{var data=await G.fetchJSON(url('data/teams.json'));teams=data.leagues.nfl||[];render();}catch(e){list.innerHTML='<p class="mini-note">Couldn’t load the team directory. Close and reopen to try again.</p>';}}
 ['openTeams','teamsNav'].forEach(function(id){doc.getElementById(id).addEventListener('click',open);});input.addEventListener('input',render);
 list.addEventListener('click',function(e){var btn=e.target.closest('[data-team]');if(!btn)return;var abbr=btn.dataset.team;var next=selected.indexOf(abbr)===-1?selected.concat(abbr):selected.filter(function(a){return a!==abbr;});try{localStorage.setItem('giu-followed-teams',JSON.stringify(next));selected=next;changed=true;render();list.querySelector('[data-team="'+abbr+'"]').focus();d.querySelector('#teamSaveState').textContent='Saved in this browser.';}catch(err){d.querySelector('#teamSaveState').textContent='Browser storage is unavailable. Your selection could not be saved.';}});
 d.querySelector('#teamDone').addEventListener('click',function(){d.close();});
 d.addEventListener('close',function(){if(changed){doc.dispatchEvent(new CustomEvent('giu:teams-changed'));if(!doc.getElementById('homeGames'))toast('Teams saved. Reload this board to update the highlights.');else toast('Teams saved. Your dashboard is updating.');}});
}
function setupDashboard(){
 var date=doc.getElementById('dashboardDate');if(date){date.dateTime=new Date().toISOString();date.textContent=new Date().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});}
 var odds=doc.getElementById('quickOdds'),stake=doc.getElementById('quickStake');
 if(odds&&stake){var paint=function(){var error=doc.getElementById('quickError'),result=doc.getElementById('quickResult');try{var r=quickPayout(odds.value,stake.value);doc.getElementById('quickProfit').textContent=money(r.profit);doc.getElementById('quickProbability').textContent=r.probability.toFixed(2)+'%';result.hidden=false;error.hidden=true;}catch(e){result.hidden=true;error.hidden=false;error.textContent=e.message;}};odds.addEventListener('input',paint);stake.addEventListener('input',paint);paint();}
 var journal=doc.getElementById('homeJournal');if(journal&&root.BetMath){var bets=read('giu.journal.v1',[]);if(Array.isArray(bets)&&bets.length){var valid=bets.filter(function(b){try{return !root.BetMath.journalValid(b);}catch(e){return false;}});if(valid.length){var stats=root.BetMath.journalStats(valid);journal.innerHTML='<div class="journal-total">'+esc(money(stats.profit))+'</div><p>Net profit · '+stats.wins+'W / '+stats.losses+'L / '+stats.pushes+'P<br>'+stats.pending+' pending · '+stats.roi.toFixed(1)+'% ROI</p>';}}}
}
if(doc.readyState==='complete')boot();else doc.addEventListener('DOMContentLoaded',boot);
})(typeof window!=='undefined'?window:globalThis);
