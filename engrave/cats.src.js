/* bc-engrave-e v1.0.27 2026-10-22 | whole-tree category qualification. Knife pop-up: any categoryId in/under knife roots (mirror Knives 207447039, legacy Knives 206527798/206528760, Cleaver 207448787, Zippo 206527760/207448818) and none in/under board roots. Board prompt: any id in/under board roots (206531754, 206527805, 207448809) and none in/under care (206531762, 207447057). Baked list generated from live tree 2026-10-22, unioned with runtime parentId roll-up (public categories API, sessionStorage cache 6h). No DOM watchers. */
!function(){if(window.__bcCats)return;
var KR=__KR__,BR=__BR__,CR=__CR__,KB=__KB__,BB=__BB__,CB=__CB__,
TOK="public_EPT7mhL7zZnZyKR4Ewj2FwLCvfzLSDDR",SK="bc_cats_v1027",TTL=216e5,par=null;
function load(){try{var s=JSON.parse(sessionStorage.getItem(SK)||"null");if(s&&s.t&&Date.now()-s.t<TTL&&s.p){par=s.p;return}}catch(e){}
var acc={},off=0;(function pg(){var x=new XMLHttpRequest();x.open("GET","https://app.ecwid.com/api/v3/142565005/categories?token="+TOK+"&hidden_categories=true&limit=100&offset="+off+"&responseFields=total,count,items(id,parentId)");
x.onload=function(){var d=null;try{d=JSON.parse(x.responseText)}catch(e){}if(!d||!d.items)return;for(var i=0;i<d.items.length;i++)acc[d.items[i].id]=d.items[i].parentId||0;off+=d.count||0;
if(d.count&&off<d.total)return pg();par=acc;try{sessionStorage.setItem(SK,JSON.stringify({t:Date.now(),p:acc}))}catch(e){}};x.send()})()}
function under(id,roots,baked){if(baked.indexOf(id)!==-1)return!0;if(!par)return!1;for(var n=0;id&&n<12;n++){if(roots.indexOf(id)!==-1)return!0;id=par[id]}return!1}
function any(ids,roots,baked){for(var i=0;i<(ids||[]).length;i++)if(under(+ids[i],roots,baked))return!0;return!1}
window.__bcCats={knife:function(ids){return any(ids,KR,KB)&&!any(ids,BR,BB)},board:function(ids){return any(ids,BR,BB)&&!any(ids,CR,CB)},_set:function(p){par=p}};
try{load()}catch(e){}}();
