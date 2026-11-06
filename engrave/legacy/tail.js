/* bc-engrave-e v1.0.16/v1.0.20 | cart "Continue shopping" + checkout/cart "Back to store"/"Continue shopping" links -> home page */
!function(){if(window.__bcContHome)return;window.__bcContHome=1;window.addEventListener("click",function(ev){var a=ev.target&&ev.target.closest&&ev.target.closest("a,button,.ec-link");if(!a||a.closest(".bc-board-ret,.bc-engr-ret"))return;if(!a.closest(".ec-cart-shopping a.ec-link")&&!(a.closest(".ec-store")&&/^(continue shopping|back to (store|shop)|keep shopping|return to (store|shop))$/i.test(String(a.textContent||"").trim())))return;ev.preventDefault();ev.stopImmediatePropagation();location.href="/"},!0)}();

/* bc-engrave-e v1.0.22 | checkout city field hint -> "City" (placeholder / floating label only). Uses Ecwid OnPageLoaded / OnPageSwitch / OnPageLoad; no body watchers. */
!function(){if(window.__bcCityHint)return;window.__bcCityHint=1;var d=document,T="City";
function fix(){var L=d.querySelectorAll('.ec-store input[name="city"], .ec-store input[autocomplete$="address-level2"]');for(var i=0;i<L.length;i++){var e=L[i],p=e.getAttribute("placeholder"),c=e.closest(".form-control")||e.parentNode,h=0;
if(c){var w=d.createTreeWalker(c,NodeFilter.SHOW_TEXT,null),n;while(n=w.nextNode()){if(/^\s*City within\b/.test(n.nodeValue)){n.nodeValue=T;h=1}else if(n.nodeValue.trim()===T)h=1}}
if(p?p!==T:!h)e.setAttribute("placeholder",T)}}
function isCheckout(e){var t=e&&e.type||"";return t==="CART"||t.indexOf("CHECKOUT_")==0||/\/checkout\//.test(location.pathname)}
function run(){fix();[200,500,1200,2500].forEach(function(ms){setTimeout(fix,ms)})}
function hook(){Ecwid.OnPageLoaded.add(function(e){if(isCheckout(e))run()});if(Ecwid.OnPageSwitch)Ecwid.OnPageSwitch.add(function(e){if(isCheckout(e))run()});if(Ecwid.OnPageLoad)Ecwid.OnPageLoad.add(function(){if(/\/checkout\//.test(location.pathname)||/\/cart/.test(location.pathname))run()})}
(function b(n){window.Ecwid&&Ecwid.OnAPILoaded?Ecwid.OnAPILoaded.add(hook):n<150&&setTimeout(function(){b(n+1)},200)})(0);
d.addEventListener("focusin",function(ev){var t=ev.target;if(!t||!t.matches)return;if(t.matches('.ec-store input[name="city"], .ec-store input[autocomplete$="address-level2"]'))fix()},!0)}();
/* bc-engrave-e v1.0.22 | checkout address: clear Ecwid geolocation State preselect once per address-step load (never a shopper-picked / restored state). Uses Ecwid OnPageLoaded / OnPageSwitch; no body watchers. */
!function(){if(window.__bcStateClr)return;window.__bcStateClr=1;var d=document,K="bc_state_picked",arm=0,t0=0,busy=0;
function ss(v){try{if(v===void 0)return sessionStorage.getItem(K);sessionStorage.setItem(K,v)}catch(e){}}
d.addEventListener("change",function(e){e.isTrusted&&e.target&&e.target.id==="ec-state"&&(ss("1"),arm=0)},!0);
function filled(){var n=['input[name="name"]','input[name="address-line1"]','input[name="city"]','input[name="postal-code"]'];for(var i=0;i<n.length;i++){var e=d.querySelector(".ec-store "+n[i]);if(e&&String(e.value||"").trim())return!0}return!1}
function go(){if(!arm||busy)return;if(Date.now()-t0>8e3){arm=0;return}var s=d.querySelector(".ec-store select#ec-state");if(!s)return;
if(ss()==="1"||filled()){arm=0;return}if(s.selectedIndex<=0){return}busy=1;
Ecwid.Cart.get(function(c){busy=0;if(!arm)return;var sp=c&&(c.shippingPerson||c.shippingAddress)||{};if(sp.street||sp.name||sp.city||sp.postalCode){arm=0;return}
var s2=d.querySelector(".ec-store select#ec-state");if(!s2||s2.selectedIndex<=0||filled()||ss()==="1"){arm=0;return}arm=0;
s2.selectedIndex=0;s2.dispatchEvent(new Event("input",{bubbles:!0}));s2.dispatchEvent(new Event("change",{bubbles:!0}))})}
function armAddress(){arm=1;t0=Date.now();go();[300,1000,2500].forEach(function(t){setTimeout(go,t)})}
function isAddress(e){var t=e&&e.type||"";return t==="CHECKOUT_ADDRESS"||t==="CHECKOUT_ADDRESS_BOOK"||/\/checkout\/address/.test(location.pathname)}
function hook(){Ecwid.OnPageLoaded.add(function(e){arm=0;if(isAddress(e))armAddress()});if(Ecwid.OnPageSwitch)Ecwid.OnPageSwitch.add(function(e){if(isAddress(e))armAddress()})}
(function b(n){window.Ecwid&&Ecwid.OnAPILoaded?Ecwid.OnAPILoaded.add(hook):n<150&&setTimeout(function(){b(n+1)},200)})(0)}();
/* bc-engrave-e v1.0.26 | after "Yes, add engraving": engraving page (category 206527799) lands at the top of the engraving section instead of Ecwid's remembered scroll position. sessionStorage flag bc_engr_top; no focus changes. */
!function(){if(window.__bcEngrTop)return;window.__bcEngrTop=1;var K="bc_engr_top",C=206527799,P=".ec-store__category-page--"+C;
function off(){var o=0,e=document.elementFromPoint(innerWidth/2,1);for(;e&&e!==document.body&&e!==document.documentElement;e=e.parentElement){var s=getComputedStyle(e);if(s.position==="fixed"||s.position==="sticky"){o=Math.max(0,e.getBoundingClientRect().bottom);break}}return o}
function tgt(){var p=document.querySelector(P);return p&&(p.querySelector(".bc-engr-hero")||p.querySelector(".grid__description")||p)}
function go(){var t0=Date.now(),u=0;function stop(){u=1}["wheel","touchstart","keydown","mousedown"].forEach(function(e){addEventListener(e,stop,{once:!0,passive:!0,capture:!0})});
(function f(){if(u||Date.now()-t0>6e3)return;var e=tgt();if(e){var y=Math.max(0,Math.round(e.getBoundingClientRect().top+scrollY-off()-8));Math.abs(scrollY-y)>2&&window.scrollTo(0,y)}setTimeout(f,150)})()}
function hook(){Ecwid.OnPageLoaded.add(function(e){if(e.type!=="CATEGORY"||e.categoryId!==C)return;var v=0;try{v=+sessionStorage.getItem(K)||0;sessionStorage.removeItem(K)}catch(x){}v&&Date.now()-v<12e4&&go()})}
(function b(n){window.Ecwid&&Ecwid.OnAPILoaded?Ecwid.OnAPILoaded.add(hook):n<150&&setTimeout(function(){b(n+1)},200)})(0)}();
