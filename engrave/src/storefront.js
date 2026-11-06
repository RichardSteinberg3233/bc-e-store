/* bc-engrave-e v1.0.30 storefront.
   Writes per-item instructions with Ecwid.Cart.addProduct / removeProduct.
   Does not email from the browser, write checkout extra fields, or call a secret API. */
(function (C) {
  if (!C || window.__bcEngrPersist) return;
  window.__bcEngrPersist = 1;
  window.__bcEngr = 1;
  window.__bcBoard = 1;

  var KNIFE_CAT = 206527799;
  var BOARD_CAT = 207250251;
  var MAIL_CAT = 206528792;
  var KNIFE_CSS = __KNIFE_CSS__;
  var BOARD_CSS = __BOARD_CSS__;
  var PUBLIC_TOKEN = "public_EPT7mhL7zZnZyKR4Ewj2FwLCvfzLSDDR";
  var STORE = "142565005";
  var NOTE = C.FULFILLMENT_NOTE;
  var d = document;
  var knifeCache = {};
  var boardCache = {};
  var knifePrev = null;
  var boardPrev = null;
  var lastNote = null;
  var knifeBusy = 0;
  var boardBusy = 0;
  var boardPending = null;

  function ls(key, value) {
    try {
      if (value === undefined) return JSON.parse(localStorage.getItem(key) || "null");
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      return null;
    }
  }

  function css(id, text) {
    if (d.getElementById(id)) return;
    var style = d.createElement("style");
    style.id = id;
    style.textContent = text;
    (d.head || d.documentElement).appendChild(style);
  }

  function ecGet(cb) {
    window.Ecwid.Cart.get(function (cart) { cb(cart || { items: [] }); });
  }

  function ecAdd(payload, cb) {
    var product = { id: payload.id, quantity: payload.quantity, callback: function (success) { cb(!!success); } };
    if (payload.options) product.options = payload.options;
    window.Ecwid.Cart.addProduct(product);
  }

  function ecRemove(index, cb) {
    window.Ecwid.Cart.removeProduct(index, function (success) { cb(success !== false); });
  }

  function adapter() {
    return { get: ecGet, add: ecAdd, remove: ecRemove };
  }

  function failText(code) {
    if (code === "association") return "Choose Yes on the item first so the engraving is tied to its part number.";
    if (code === "add-failed") return "Engraving instructions could not be saved on the cart. Please call 432-253-3660. The previous cart line was left in place.";
    if (code === "remove-failed" || code === "blank-restore-failed") return "Engraving was saved but the cart could not be cleaned up. Please call 432-253-3660 before paying, so you are not charged twice.";
    return "Engraving instructions could not be saved. Please call 432-253-3660.";
  }

  function page(cat) {
    return d.querySelector(".ec-store__category-page--" + cat);
  }

  function val(form, name) {
    var el = form && form.querySelector('[name="' + name + '"]');
    return el && "value" in el ? String(el.value || "") : "";
  }

  function readFields(form) {
    return {
      name: val(form, "name"),
      phone: val(form, "phone"),
      provided_font: val(form, "provided_font"),
      custom_font: val(form, "custom_font"),
      placement: val(form, "placement"),
      engraving_text: val(form, "engraving_text"),
      what_to_engrave: val(form, "what_to_engrave"),
      description: val(form, "description"),
      instructions: val(form, "instructions"),
      board_size: val(form, "board_size")
    };
  }

  function setVal(form, name, value) {
    var el = form.querySelector('[name="' + name + '"]');
    if (!el || !("value" in el) || !value || el.value) return;
    el.value = value;
  }

  function fill(form, fields) {
    if (!fields) return;
    setVal(form, "name", fields.name);
    setVal(form, "phone", fields.phone);
    setVal(form, "provided_font", fields.provided_font);
    setVal(form, "custom_font", fields.custom_font);
    setVal(form, "placement", fields.placement);
    setVal(form, "engraving_text", fields.engraving_text);
    setVal(form, "what_to_engrave", fields.what_to_engrave);
    setVal(form, "description", fields.description);
    setVal(form, "instructions", fields.instructions);
    setVal(form, "board_size", fields.board_size);
  }

  function ensurePlacement(form) {
    var select = form.querySelector('[name="placement"]');
    if (!select || select.getAttribute("data-bc-place")) return;
    var opt = d.createElement("option");
    opt.value = "";
    opt.textContent = "Select placement";
    var previous = select.value;
    select.insertBefore(opt, select.firstChild);
    select.setAttribute("data-bc-place", "1");
    if (previous) select.value = previous;
    else select.selectedIndex = 0;
    select.required = true;
  }

  function showErr(form, className, text) {
    var el = form.querySelector("." + className);
    if (!el) {
      el = d.createElement("p");
      el.className = className;
      form.insertBefore(el, form.firstChild);
    }
    el.textContent = text || "";
  }

  function prune(key, listKey) {
    var now = Date.now();
    var limit = now - 2592e6;
    var forms = ls(key) || {};
    Object.keys(forms).forEach(function (sku) {
      if (!forms[sku] || forms[sku].ts < limit) delete forms[sku];
    });
    ls(key, forms);
    ls(listKey, (ls(listKey) || []).filter(function (row) { return row && row.ts >= limit; }));
  }

  function remember(listKey, currentKey, row) {
    if (!row || !row.sku) return;
    var list = (ls(listKey) || []).filter(function (item) { return item.sku !== row.sku; });
    row.ts = Date.now();
    list.push(row);
    ls(listKey, list.slice(-10));
    ls(currentKey, row.sku);
  }

  function choices(listKey, cart, kind) {
    var map = {};
    (ls(listKey) || []).forEach(function (row) {
      if (row && row.sku) map[row.sku] = { sku: row.sku, name: row.name || "", url: row.url || "" };
    });
    ((cart && cart.items) || []).forEach(function (it) {
      var match = kind === "board" ? C.isBoard(it) : C.isEngrave(it);
      if (!match) return;
      var options = C.readOptions(it);
      var sku = options["For SKU"];
      if (sku && !map[sku]) map[sku] = { sku: sku, name: options.Item || "", url: "" };
    });
    return Object.keys(map).map(function (sku) { return map[sku]; });
  }

  function selectedSku(form, selectClass, currentKey, rows) {
    var select = form.querySelector("." + selectClass);
    if (select && select.value) return select.value;
    var current = ls(currentKey);
    if (current && rows.some(function (row) { return row.sku === current; })) return current;
    return (rows[rows.length - 1] || {}).sku || "GENERAL";
  }

  function savedFields(cart, sku, draftKey) {
    var picked = C.authoritativeFields((cart && cart.items) || [], sku, (ls(draftKey) || {})[sku] && (ls(draftKey) || {})[sku].f);
    return picked.fields;
  }

  function writeDraft(draftKey, sku, fields, itemName) {
    var all = ls(draftKey) || {};
    all[sku] = { sku: sku, item: itemName || "", f: fields, ts: Date.now() };
    ls(draftKey, all);
  }

  function lookup(id, cache, kind, cb) {
    if (id === C.ENGRAVE_ID || id === C.BOARD_ID) return cb(false);
    if (cache[id]) return cb(cache[id].ok, cache[id].product);
    var xhr = new XMLHttpRequest();
    xhr.open("GET", "https://app.ecwid.com/api/v3/" + STORE + "/products/" + id + "?token=" + PUBLIC_TOKEN + "&responseFields=id,sku,name,url,categoryIds");
    xhr.onload = function () {
      var product = null;
      try { product = JSON.parse(xhr.responseText); } catch (e) {}
      var ids = product && product.categoryIds;
      var ok = false;
      if (product && window.__bcCats) ok = kind === "board" ? window.__bcCats.board(ids) : window.__bcCats.knife(ids);
      cache[id] = { ok: ok, product: product };
      cb(ok, product);
    };
    xhr.onerror = function () { cb(false); };
    xhr.send();
  }

  function counts(cart) {
    var out = {};
    ((cart && cart.items) || []).forEach(function (it) {
      var id = it.product && it.product.id;
      if (id) out[id] = (out[id] || 0) + (it.quantity || 0);
    });
    return out;
  }

  function closePop(id) {
    var el = d.getElementById(id);
    if (el) el.remove();
  }

  function noteBox() {
    return d.querySelector('.ec-cart textarea, .ec-store__checkout-page textarea, textarea[aria-label*="note" i]');
  }

  function syncNote(cart) {
    try {
      var saved = ls("bcEngrNote");
      var box = noteBox();
      var on = ((cart && cart.items) || []).some(C.isEngrave);
      if (!on && !saved) return;
      var user = box ? box.value : saved && saved.user;
      user = String(user || "").split(NOTE).join("").replace(/^\s+|\s+$/g, "");
      var next = on ? NOTE + (user ? "\n\n" + user : "") : user;
      ls("bcEngrNote", on || user ? { user: user, on: on } : null);
      if (box && box.value === next) { lastNote = next; return; }
      if (next === lastNote && !box) return;
      lastNote = next;
      window.Ecwid.Cart.setOrderComments(next);
      if (box && box.value !== next) {
        box.value = next;
        box.dispatchEvent(new Event("input", { bubbles: true }));
        box.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (!on) ls("bcEngrNote", null);
    } catch (e) {}
  }

  function skuBox(form, rows, className, currentKey, onPick) {
    var box = form.querySelector("." + className + "-for");
    if (!box) {
      box = d.createElement("div");
      box.className = className + "-for";
      form.insertBefore(box, form.firstChild);
    }
    var current = ls(currentKey);
    var chosen = rows.filter(function (row) { return row.sku === current; })[0] || rows[rows.length - 1];
    if (rows.length > 1) {
      box.innerHTML = '<label>Engraving is for part number (SKU)<br><select class="' + className + '-sku"></select></label>';
      var select = box.querySelector("select");
      rows.forEach(function (row) {
        var opt = d.createElement("option");
        opt.value = row.sku;
        opt.textContent = row.sku;
        if (chosen && row.sku === chosen.sku) opt.selected = true;
        select.appendChild(opt);
      });
      select.onchange = function () {
        ls(currentKey, select.value);
        if (onPick) onPick(select.value);
      };
    } else if (chosen) {
      box.innerHTML = 'Engraving is for part number (SKU): <b class="' + className + '-sku-v"></b>';
      box.querySelector("b").textContent = chosen.sku;
    } else {
      box.textContent = className === "bc-board"
        ? "No board selected yet. Add a cutting board to your cart, or describe the board below."
        : "No item selected yet. Add a knife to your cart and choose Yes to engraving, or tell us below what to engrave.";
    }
    return chosen;
  }

  function renderKnife(cart) {
    var root = page(KNIFE_CAT);
    if (!root) return;
    var anchor = root.querySelector('[name="what_to_engrave"]');
    if (!anchor) return;
    var form = anchor.closest("form") || anchor.parentNode;
    css("bc-engr-css", KNIFE_CSS);
    ensurePlacement(form);
    var phone = form.querySelector('[name="phone"]');
    if (phone && !phone.required) {
      phone.required = true;
      phone.type = "tel";
      phone.setAttribute("autocomplete", "tel");
      var label = phone.closest("label");
      if (label && label.firstChild && label.firstChild.nodeType === 3) {
        label.firstChild.nodeValue = "Phone (required - our engraver may call you) ";
      }
    }
    var rows = choices("bc_engr_pending", cart, "knife");
    var chosen = skuBox(form, rows, "bc-engr", "bc_engr_current", function () {
      ecGet(renderKnife);
    });
    var sku = chosen && chosen.sku;
    if (sku && anchor && !anchor.value && chosen.name) anchor.value = chosen.name + " (SKU " + sku + ")";
    fill(form, savedFields(cart, sku, "bc_engr_forms"));
    var buttons = form.querySelectorAll("button");
    for (var i = 0; i < buttons.length; i++) {
      var button = buttons[i];
      if (button.className.indexOf("bc-engr-ret") !== -1) continue;
      var text = button.textContent.toLowerCase();
      if (text.indexOf("print") === -1 && button.getAttribute("type") !== "button") continue;
      button.textContent = "Return to shopping";
      button.className += " bc-engr-ret";
      if (!form.querySelector(".bc-engr-call")) {
        var note = d.createElement("p");
        note.className = "bc-engr-call";
        note.textContent = "For additional engravings or special circumstances, please call our engraving department at 432-253-3660, extension 2.";
        button.parentNode.insertBefore(note, button);
      }
    }
  }

  function renderBoard(cart) {
    var root = page(BOARD_CAT);
    if (!root) return;
    var form = root.querySelector("#board-engraving-form");
    if (!form) return;
    css("bc-board-css", BOARD_CSS);
    var descriptionHost = form.closest(".grid__description");
    if (descriptionHost) descriptionHost.style.setProperty("display", "block", "important");
    ensurePlacement(form);
    var phone = form.querySelector('[name="phone"]');
    if (phone) phone.required = true;
    var rows = choices("bc_board_pending", cart, "board");
    var chosen = skuBox(form, rows, "bc-board", "bc_board_current", function () {
      ecGet(renderBoard);
    });
    var desc = form.querySelector('[name="description"]');
    if (desc && chosen && !desc.value) desc.value = chosen.name || "";
    fill(form, savedFields(cart, chosen && chosen.sku, "bc_board_forms"));
    if (!root.querySelector("#bc-board-checkout")) {
      var row = form.closest(".bc-engrave-form-row") || form;
      var note = root.querySelector("#bc-board-note-text");
      var wrap = d.createElement("div");
      wrap.id = "bc-board-checkout";
      wrap.innerHTML = '<p id="bc-board-line-st"></p><p class="bc-mailin-checkout-note"></p><p><a class="bc-mailin-checkout-btn" href="/products/cart">Continue to checkout</a></p>';
      wrap.querySelector(".bc-mailin-checkout-note").textContent = note && note.textContent.trim() || "When you have completed the above form.";
      row.parentNode.insertBefore(wrap, row.nextSibling);
    }
  }

  function boardStatus(text, bad) {
    var el = d.getElementById("bc-board-line-st");
    if (!el) return;
    el.className = bad ? "err" : "";
    el.textContent = text || "";
  }

  function showKnifeGate(form, message) {
    showErr(form, "bc-engr-err", message);
    var scope = form.closest(".ec-store__category-page--" + KNIFE_CAT);
    var host = scope && scope.querySelector("#bc-mailin-checkout");
    if (!host) return;
    var el = host.querySelector(".bc-engr-gate");
    if (!el) {
      el = d.createElement("p");
      el.className = "bc-engr-err bc-engr-gate";
      host.insertBefore(el, host.firstChild);
    }
    el.textContent = message || "";
  }

  function saveKnife(form, href, done) {
    ensurePlacement(form);
    var fields = readFields(form);
    var check = C.validate("knife", fields);
    if (!check.ok) {
      showKnifeGate(form, C.explain("knife", check.errors));
      if (done) done(false);
      return;
    }
    showKnifeGate(form, "");
    var rows = ls("bc_engr_pending") || [];
    var sku = selectedSku(form, "bc-engr-sku", "bc_engr_current", rows);
    var row = rows.filter(function (item) { return item.sku === sku; })[0] || {};
    if (!sku || sku === "GENERAL") {
      showKnifeGate(form, "Choose Yes on the item first so the engraving is tied to its part number.");
      if (done) done(false);
      return;
    }
    if (knifeBusy) {
      if (done) done(false);
      return;
    }
    knifeBusy = 1;
    showKnifeGate(form, "Saving engraving instructions to your cart…");
    C.runKnife(adapter(), { forSku: sku, itemName: row.name || "", fields: fields }, function (result) {
      knifeBusy = 0;
      if (!result.ok) {
        showKnifeGate(form, failText(result.error));
        if (done) done(false);
        return;
      }
      writeDraft("bc_engr_forms", sku, fields, row.name || "");
      showKnifeGate(form, "Engraving instructions are saved on the engraving line in your cart.");
      if (href) location.href = href;
      if (done) done(true);
    });
  }

  function runBoardJob(spec, cb) {
    boardPending = { spec: spec, cb: cb };
    if (!boardBusy) pumpBoard();
  }

  function pumpBoard() {
    if (!boardPending || boardBusy) return;
    var job = boardPending;
    boardPending = null;
    boardBusy = 1;
    C.runBoard(adapter(), job.spec, function (result) {
      boardBusy = 0;
      try { if (job.cb) job.cb(result); } catch (e) {}
      if (boardPending) pumpBoard();
    });
  }

  function saveBoard(form, openCart) {
    ensurePlacement(form);
    var fields = readFields(form);
    var check = C.validate("board", fields);
    if (!check.ok) {
      var message = C.explain("board", check.errors);
      showErr(form, "bc-board-err", message);
      boardStatus(message, 1);
      return;
    }
    showErr(form, "bc-board-err", "");
    var rows = ls("bc_board_pending") || [];
    var sku = selectedSku(form, "bc-board-sku", "bc_board_current", rows);
    var row = rows.filter(function (item) { return item.sku === sku; })[0] || {};
    boardStatus("Saving engraving instructions to your cart…");
    runBoardJob({ forSku: sku, itemName: row.name || fields.description || "", size: fields.board_size, fields: fields }, function (result) {
      if (!result.ok) {
        boardStatus(failText(result.error), 1);
        return;
      }
      writeDraft("bc_board_forms", sku, fields, row.name || "");
      var price = C.BOARD_DISPLAY_PRICES[fields.board_size];
      boardStatus("Board engraving " + fields.board_size + " ($" + price + ") is in your cart.");
      if (openCart) {
        if (window.Ecwid && window.Ecwid.openPage) window.Ecwid.openPage("cart");
        else location.href = "/products/cart";
      }
    });
  }

  function syncBoardSize(form) {
    var fields = readFields(form);
    var price = C.BOARD_DISPLAY_PRICES[fields.board_size];
    var check = C.validate("board", fields);
    if (!check.ok) {
      boardStatus(price == null ? "" : "Board engraving " + fields.board_size + " ($" + price + ") is added when the form is complete.");
      return;
    }
    var rows = ls("bc_board_pending") || [];
    var sku = selectedSku(form, "bc-board-sku", "bc_board_current", rows);
    var row = rows.filter(function (item) { return item.sku === sku; })[0] || {};
    runBoardJob({
      forSku: sku,
      itemName: row.name || "",
      size: fields.board_size,
      fields: check.ok ? fields : null
    }, function (result) {
      if (!result.ok) {
        boardStatus(failText(result.error), 1);
        return;
      }
      var price = C.BOARD_DISPLAY_PRICES[fields.board_size];
      if (price == null) boardStatus("");
      else boardStatus("Board engraving " + fields.board_size + " ($" + price + ") is in your cart.");
    });
  }

  function holdBanner(missing) {
    if (d.getElementById("bc-engr-hold")) return;
    var host = d.querySelector(".ec-cart, .ec-store__cart-page, .ec-cart__body") || d.body;
    var box = d.createElement("div");
    box.id = "bc-engr-hold";
    box.className = "bc-engr-for";
    var knife = missing.some(function (row) { return row.role === "knife"; });
    var board = missing.some(function (row) { return row.role === "board"; });
    var links = "";
    if (knife) links += '<p><a href="#" data-bc-cat="' + KNIFE_CAT + '">Finish the knife engraving form</a></p>';
    if (board) links += '<p><a href="#" data-bc-cat="' + BOARD_CAT + '">Finish the cutting board engraving form</a></p>';
    box.innerHTML = "<p><b>Every engraving line needs a finished questionnaire before payment.</b> One finished line does not cover a blank one. A line already in the cart is not rechecked by the catalog. Finish the form or remove that line.</p>" + links;
    box.addEventListener("click", function (event) {
      var link = event.target && event.target.closest && event.target.closest("[data-bc-cat]");
      if (!link) return;
      event.preventDefault();
      window.Ecwid.openPage("category", { id: +link.getAttribute("data-bc-cat") });
    });
    host.insertBefore(box, host.firstChild);
  }

  function guard(type) {
    ecGet(function (cart) {
      var items = (cart && cart.items) || [];
      if (C.allowCheckout(items)) {
        var old = d.getElementById("bc-engr-hold");
        if (old) old.remove();
        return;
      }
      var missing = C.incomplete(items);
      if (C.isCheckoutStep(type)) {
        if (window.Ecwid && window.Ecwid.openPage) window.Ecwid.openPage("cart");
        return;
      }
      if (type === "CART") holdBanner(missing);
    });
  }

  function watchPage(pageInfo) {
    var type = pageInfo && pageInfo.type || "";
    var id = pageInfo && pageInfo.categoryId || 0;
    closePop("bc-engr-pop");
    closePop("bc-board-pop");
    if (/^(PRODUCT|CATEGORY|SEARCH)$/.test(type) && id !== KNIFE_CAT && id !== BOARD_CAT && id !== MAIL_CAT) {
      ls("bc_engr_last_shop", location.href);
      ls("bc_board_last_shop", location.href);
    }
    if (type === "CATEGORY" && id === KNIFE_CAT) [0, 300, 1200].forEach(function (ms) { setTimeout(function () { ecGet(renderKnife); }, ms); });
    if (type === "CATEGORY" && id === BOARD_CAT) [0, 300, 1200].forEach(function (ms) { setTimeout(function () { ecGet(renderBoard); }, ms); });
    if (type === "CART") [300, 1200].forEach(function (ms) { setTimeout(continueShopping, ms); });
    if (type === "CART" || C.isCheckoutStep(type)) {
      [0, 800, 2000].forEach(function (ms) { setTimeout(function () { ecGet(syncNote); }, ms); });
      guard(type);
    }
  }

  function knifePop(item) {
    css("bc-engr-css", KNIFE_CSS);
    closePop("bc-engr-pop");
    var pop = d.createElement("div");
    pop.id = "bc-engr-pop";
    pop.innerHTML = '<div class="in"><p><b class="nm"></b></p><p>Only $15 per surface</p><p>Click yes</p><button type="button" class="yes">Yes, add engraving</button><button type="button" class="no">No thanks</button><p class="st"></p></div>';
    pop.querySelector(".nm").textContent = "Personalize your " + (item.name || "item");
    pop.addEventListener("click", function (event) {
      var target = event.target;
      if (pop.bcBusy) return;
      var status = pop.querySelector(".st");
      var no = pop.querySelector(".no");
      var klass = target.className || "";
      if (target === pop || klass.indexOf("no") === 0) return closePop("bc-engr-pop");
      if (klass.indexOf("yes") !== 0) return;
      target.disabled = true;
      pop.bcBusy = 1;
      target.textContent = "Opening the engraving form\u2026";
      if (no) no.style.display = "none";
      status.textContent = "The $15 engraving is added after the form is complete.";
      remember("bc_engr_pending", "bc_engr_current", {
        sku: item.sku || String(item.id),
        id: item.id,
        name: item.name || "",
        url: item.url || location.href
      });
      try { sessionStorage.setItem("bc_engr_top", String(Date.now())); } catch (e) {}
      window.Ecwid.openPage("category", { id: KNIFE_CAT });
    });
    d.body.appendChild(pop);
  }

  function boardPop(item) {
    css("bc-board-css", BOARD_CSS);
    closePop("bc-board-pop");
    var pop = d.createElement("div");
    pop.id = "bc-board-pop";
    pop.innerHTML = '<div class="in"><p><b class="nm"></b></p><p>Engraving from $12, priced by engraving size</p><p>Click yes</p><button type="button" class="yes">Yes, add engraving</button><button type="button" class="no">No thanks</button></div>';
    pop.querySelector(".nm").textContent = "Personalize your " + (item.name || "cutting board");
    pop.addEventListener("click", function (event) {
      var target = event.target;
      var klass = target.className || "";
      if (target === pop || klass.indexOf("no") === 0) return closePop("bc-board-pop");
      if (klass.indexOf("yes") !== 0) return;
      target.disabled = true;
      closePop("bc-board-pop");
      remember("bc_board_pending", "bc_board_current", {
        sku: item.sku || String(item.id),
        id: item.id,
        name: item.name || "",
        url: item.url || location.href
      });
      window.Ecwid.openPage("category", { id: BOARD_CAT });
    });
    d.body.appendChild(pop);
  }

  function addedIds(prev, next, ignore) {
    var ids = [];
    Object.keys(next).forEach(function (id) {
      if (next[id] > (prev[id] || 0) && ignore.indexOf(+id) === -1) ids.push(+id);
    });
    return ids;
  }

  function onKnifeCart(cart) {
    syncNote(cart);
    var next = counts(cart);
    if (knifePrev === null) { knifePrev = next; return; }
    var ids = addedIds(knifePrev, next, [C.ENGRAVE_ID]);
    knifePrev = next;
    ids.forEach(function (id) {
      var line = ((cart.items) || []).filter(function (it) { return it.product && it.product.id === id; })[0];
      var sku = line && line.product && line.product.sku;
      var hasEngrave = (cart.items || []).some(C.isEngrave);
      var pending = (ls("bc_engr_pending") || []).some(function (row) { return row.sku === sku; });
      if (sku && hasEngrave && pending) return;
      lookup(id, knifeCache, "knife", function (ok, product) {
        if (!ok) return;
        knifePop({
          id: id,
          sku: sku || product && product.sku,
          name: line && line.product && line.product.name || product && product.name,
          url: product && product.url || location.href
        });
      });
    });
  }

  function onBoardCart(cart) {
    var next = counts(cart);
    if (boardPrev === null) { boardPrev = next; return; }
    var ids = addedIds(boardPrev, next, [C.ENGRAVE_ID, C.BOARD_ID]);
    boardPrev = next;
    ids.forEach(function (id) {
      var line = ((cart.items) || []).filter(function (it) { return it.product && it.product.id === id; })[0];
      var sku = line && line.product && line.product.sku;
      if (sku && (ls("bc_board_pending") || []).some(function (row) { return row.sku === sku; })) return;
      lookup(id, boardCache, "board", function (ok, product) {
        if (!ok) return;
        boardPop({
          sku: sku || product && product.sku || String(id),
          id: id,
          name: line && line.product && line.product.name || product && product.name || "",
          url: product && product.url || location.href
        });
      });
    });
  }

  function continueShopping() {
    if (d.getElementById("bc-engr-cont")) return;
    var host = d.querySelector(".ec-cart, .ec-store__cart-page, .ec-cart__body");
    if (!host) return;
    css("bc-engr-css", KNIFE_CSS);
    var wrap = d.createElement("div");
    wrap.id = "bc-engr-cont";
    var link = d.createElement("a");
    link.className = "bc-engr-btn";
    link.textContent = "Continue shopping";
    link.href = ls("bc_engr_last_shop") || "/products";
    wrap.appendChild(link);
    host.insertBefore(wrap, host.firstChild);
  }

  /* The site script adds "Continue to checkout" on the knife engraving page
     and calls Ecwid.Cart.gotoCheckout from a document capture listener.
     This window listener runs first and keeps an incomplete form on the page. */
  window.addEventListener("click", function (event) {
    var link = event.target && event.target.closest && event.target.closest("a.bc-mailin-checkout-btn");
    if (!link) return;
    var scope = link.closest(".ec-store__category-page--" + KNIFE_CAT);
    if (!scope) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    var form = scope.querySelector("#engraving-form") || scope.querySelector("form");
    if (!form) return;
    saveKnife(form, null, function (ok) {
      if (!ok) return;
      if (window.Ecwid && Ecwid.Cart && typeof Ecwid.Cart.gotoCheckout === "function") Ecwid.Cart.gotoCheckout();
      else if (window.Ecwid && Ecwid.openPage) Ecwid.openPage("cart");
    });
  }, true);

  d.addEventListener("click", function (event) {
    var button = event.target && event.target.closest && event.target.closest("button.bc-engr-ret");
    if (!button) return;
    var form = button.closest("form");
    if (!form) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    var rows = ls("bc_engr_pending") || [];
    var sku = selectedSku(form, "bc-engr-sku", "bc_engr_current", rows);
    var row = rows.filter(function (item) { return item.sku === sku; })[0];
    saveKnife(form, (row && row.url) || ls("bc_engr_last_shop") || "/products");
  }, true);

  d.addEventListener("click", function (event) {
    var button = event.target && event.target.closest && event.target.closest("button.bc-board-ret");
    if (!button) return;
    var form = button.closest("form");
    if (!form || form.id !== "board-engraving-form") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    var rows = ls("bc_board_pending") || [];
    var sku = selectedSku(form, "bc-board-sku", "bc_board_current", rows);
    var row = rows.filter(function (item) { return item.sku === sku; })[0];
    ensurePlacement(form);
    var fields = readFields(form);
    var check = C.validate("board", fields);
    if (!check.ok) {
      showErr(form, "bc-board-err", C.explain("board", check.errors));
      return;
    }
    runBoardJob({ forSku: sku, itemName: row && row.name || "", size: fields.board_size, fields: fields }, function (result) {
      if (!result.ok) {
        showErr(form, "bc-board-err", failText(result.error));
        return;
      }
      writeDraft("bc_board_forms", sku, fields, row && row.name || "");
      location.href = ls("bc_board_last_shop") || (row && row.url) || "/products";
    });
  }, true);

  window.addEventListener("click", function (event) {
    var link = event.target && event.target.closest && event.target.closest("#bc-board-checkout a.bc-mailin-checkout-btn");
    if (!link) return;
    var form = page(BOARD_CAT) && page(BOARD_CAT).querySelector("#board-engraving-form");
    if (!form) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    saveBoard(form, true);
  }, true);

  d.addEventListener("change", function (event) {
    var target = event.target;
    if (!target || target.name !== "board_size" || !target.closest) return;
    var form = target.closest("form");
    if (!form || form.id !== "board-engraving-form") return;
    syncBoardSize(form);
  }, true);

  function boot() {
    prune("bc_engr_forms", "bc_engr_pending");
    prune("bc_board_forms", "bc_board_pending");
    ecGet(function (cart) {
      if (knifePrev === null) knifePrev = counts(cart);
      if (boardPrev === null) boardPrev = counts(cart);
      syncNote(cart);
    });
    window.Ecwid.OnCartChanged.add(function (cart) {
      onKnifeCart(cart);
      onBoardCart(cart);
    });
    window.Ecwid.OnPageLoaded.add(watchPage);
    if (window.Ecwid.OnPageLoad) window.Ecwid.OnPageLoad.add(watchPage);
  }

  var allowCheckoutClick = false;
  d.addEventListener("click", function (event) {
    if (allowCheckoutClick) return;
    var node = event.target && event.target.closest && event.target.closest("a,button,input");
    if (!node) return;
    if (node.closest("#bc-engr-hold, #bc-engr-pop, #bc-board-pop, #bc-board-checkout, .bc-engr-ret, .bc-board-ret")) return;
    var href = node.getAttribute("href") || "";
    var label = node.value || node.textContent || "";
    if (!C.isCheckoutIntent(href, label)) return;
    event.preventDefault();
    event.stopPropagation();
    ecGet(function (cart) {
      var items = (cart && cart.items) || [];
      if (!C.allowCheckout(items)) {
        holdBanner(C.incomplete(items));
        if (window.Ecwid && window.Ecwid.openPage) window.Ecwid.openPage("cart");
        return;
      }
      allowCheckoutClick = true;
      try { node.click(); }
      finally { allowCheckoutClick = false; }
    });
  }, true);

  css("bc-engr-css", KNIFE_CSS);
  css("bc-board-css", BOARD_CSS);

  (function wait(n) {
    if (window.Ecwid && window.Ecwid.OnAPILoaded) window.Ecwid.OnAPILoaded.add(boot);
    else if (n < 150) setTimeout(function () { wait(n + 1); }, 200);
  })(0);
})(typeof window !== "undefined" ? window.BcEngraveContract : null);
