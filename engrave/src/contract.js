/* bc-engrave-e v1.0.30 cart/order contract.
   Pure logic. No Ecwid calls, no network, no email.
   Browser mail is not implemented here. The paid-order queue is the only sender. */
(function (factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.BcEngraveContract = api;
})(function () {
  var ENGRAVE_ID = 865178331;
  var ENGRAVE_SKU = "ENGRAVE";
  var BOARD_ID = 868564107;
  var BOARD_SKU = "BOARD-ENGRAVE";
  var SIZE = "Engraving size";
  var VERSION = "BC instructions v";
  var VERSION_VALUE = "1";
  var FOR_SKU = "For SKU";
  var ITEM = "Item";

  /* Display copy only. Live catalog: BOARD-ENGRAVE base price 12 plus the
     existing Engraving size modifiers. Never sent as a cart price. */
  var BOARD_DISPLAY_PRICES = {
    "2x2": 12,
    "3x3": 15,
    "4x4": 20,
    "5x5": 30,
    "6x6": 40,
    "7x7": 50,
    "8x8": 60,
    "Larger than 8x8": 75
  };

  var TEXT_OPTIONS = [
    { name: VERSION, type: "TEXTFIELD" },
    { name: FOR_SKU, type: "TEXTFIELD" },
    { name: ITEM, type: "TEXTAREA" },
    { name: "Name", type: "TEXTFIELD" },
    { name: "Phone", type: "TEXTFIELD" },
    { name: "Font", type: "TEXTFIELD" },
    { name: "Custom font", type: "TEXTFIELD" },
    { name: "Placement", type: "TEXTFIELD" },
    { name: "Engraving text", type: "TEXTAREA" },
    { name: "What to engrave", type: "TEXTAREA" },
    { name: "Description", type: "TEXTAREA" },
    { name: "Instructions", type: "TEXTAREA" }
  ];

  var OTHER_PLACEMENT = "Other (describe in Instructions)";
  var FULFILLMENT_NOTE = "ENGRAVING ORDER: send item to engraving before shipping.";
  var CHECKOUT_STEPS = {
    CHECKOUT: 1,
    CHECKOUT_ADDRESS: 1,
    CHECKOUT_ADDRESS_BOOK: 1,
    CHECKOUT_PAYMENT_DETAILS: 1,
    CHECKOUT_PLACE_ORDER: 1
  };

  function trim(s) {
    return String(s == null ? "" : s).replace(/^\s+|\s+$/g, "");
  }

  function oneLine(s) {
    return trim(String(s == null ? "" : s).replace(/[\r\n]+/g, " "));
  }

  function digits(s) {
    var n = 0;
    String(s || "").split("").forEach(function (ch) {
      if ("0123456789".indexOf(ch) !== -1) n++;
    });
    return n;
  }

  function cleanFont(s) {
    s = oneLine(s);
    if (!s || s.toLowerCase() === "select a font") return "";
    return s;
  }

  function cleanPlacement(s) {
    s = oneLine(s);
    if (!s || s.toLowerCase() === "select placement") return "";
    return s;
  }

  function productOf(it) {
    return (it && it.product) || {};
  }

  function isEngrave(it) {
    if (!it) return false;
    var p = productOf(it);
    return p.id === ENGRAVE_ID || p.sku === ENGRAVE_SKU || it.productId === ENGRAVE_ID || it.sku === ENGRAVE_SKU;
  }

  function isBoard(it) {
    if (!it) return false;
    var p = productOf(it);
    return p.id === BOARD_ID || p.sku === BOARD_SKU || it.productId === BOARD_ID || it.sku === BOARD_SKU;
  }

  function readOptions(line) {
    var raw = line && (line.options || line.selectedOptions);
    var out = {};
    if (!raw) return out;
    if (Object.prototype.toString.call(raw) === "[object Array]") {
      raw.forEach(function (entry) {
        if (!entry || !entry.name) return;
        var value = entry.value != null ? entry.value : entry.selectionTitle;
        out[entry.name] = value == null ? "" : String(value);
      });
      return out;
    }
    Object.keys(raw).forEach(function (key) {
      out[key] = raw[key] == null ? "" : String(raw[key]);
    });
    return out;
  }

  function norm(map) {
    var out = {};
    Object.keys(map || {}).forEach(function (key) {
      var value = map[key];
      if (value == null) return;
      value = String(value);
      if (value === "") return;
      out[key] = value;
    });
    return out;
  }

  function mapsEqual(a, b) {
    var left = norm(a);
    var right = norm(b);
    var keys = {};
    Object.keys(left).forEach(function (k) { keys[k] = 1; });
    Object.keys(right).forEach(function (k) { keys[k] = 1; });
    var ok = true;
    Object.keys(keys).forEach(function (k) {
      if (left[k] !== right[k]) ok = false;
    });
    return ok;
  }

  function cloneItem(it) {
    var p = productOf(it);
    var copy = {
      product: {
        id: p.id != null ? p.id : it.productId,
        sku: p.sku || it.sku || "",
        name: p.name || it.name || "",
        price: p.price
      },
      quantity: it.quantity || 0,
      options: readOptions(it)
    };
    if (it.id != null) copy.id = it.id;
    return copy;
  }

  function engraveShell(options, qty) {
    return {
      product: {
        id: ENGRAVE_ID,
        sku: ENGRAVE_SKU,
        name: "ENGRAVE - BC Knife - Service - Engraving",
        price: 15
      },
      quantity: qty,
      options: options || {}
    };
  }

  function boardShell(options, qty) {
    return {
      product: {
        id: BOARD_ID,
        sku: BOARD_SKU,
        name: "Cutting Board Engraving",
        price: 12
      },
      quantity: qty,
      options: options || {}
    };
  }

  function resolvedFont(fields) {
    var specimen = cleanFont(fields && fields.provided_font);
    var custom = oneLine(fields && fields.custom_font);
    if (specimen && custom) return specimen + " / " + custom;
    return specimen || custom;
  }

  function resolvedText(role, fields) {
    var text = trim(fields && fields.engraving_text);
    if (text) return text;
    if (role === "board") return trim(fields && fields.description);
    return trim(fields && fields.what_to_engrave);
  }

  function resolvedPlacement(fields) {
    var placement = cleanPlacement(fields && fields.placement);
    if (!placement) return "";
    if (/^other\b/i.test(placement)) {
      var extra = trim(fields && fields.instructions);
      if (!extra) return "";
      return "Other: " + extra;
    }
    return placement;
  }

  function placementSaved(value) {
    var placement = oneLine(value);
    if (!placement) return false;
    if (/^other$/i.test(placement)) return false;
    if (/^other\b/i.test(placement) && placement.indexOf(":") === -1) return false;
    return true;
  }

  function validate(role, fields) {
    fields = fields || {};
    var errors = [];
    if (!oneLine(fields.name)) errors.push("name");
    if (digits(fields.phone) < 7) errors.push("phone");
    if (!resolvedFont(fields)) errors.push("font");
    var placement = resolvedPlacement(fields);
    if (!placement) errors.push(cleanPlacement(fields.placement) && /^other\b/i.test(cleanPlacement(fields.placement)) ? "instructions" : "placement");
    if (role === "board") {
      if (BOARD_DISPLAY_PRICES[fields.board_size] == null) errors.push("size");
      if (!resolvedText(role, fields)) errors.push("text");
    } else if (!resolvedText(role, fields)) {
      errors.push("text");
    }
    return { ok: errors.length === 0, errors: errors };
  }

  function explain(role, errors) {
    var need = [];
    if (errors.indexOf("name") !== -1) need.push("your name");
    if (errors.indexOf("phone") !== -1) need.push("a phone number we can call (at least 7 digits)");
    if (errors.indexOf("font") !== -1) need.push("a font or a custom font");
    if (errors.indexOf("placement") !== -1) need.push("a placement");
    if (errors.indexOf("instructions") !== -1) need.push("instructions describing that placement");
    if (errors.indexOf("size") !== -1) need.push("an engraving size");
    if (errors.indexOf("text") !== -1) {
      need.push(role === "board" ? "the text (or a description of the board)" : "the text (or what to engrave)");
    }
    if (!need.length) return "";
    return "Please fill in " + need.join(", ") + ".";
  }

  function optionMap(fields, meta) {
    fields = fields || {};
    meta = meta || {};
    var role = (meta && meta.role) || "knife";
    return {
      "BC instructions v": VERSION_VALUE,
      "For SKU": oneLine(meta && meta.forSku),
      "Item": trim(meta && meta.itemName),
      "Name": oneLine(fields.name),
      "Phone": oneLine(fields.phone),
      "Font": resolvedFont(fields),
      "Custom font": oneLine(fields.custom_font),
      "Placement": resolvedPlacement(fields),
      "Engraving text": resolvedText(role, fields),
      "What to engrave": trim(fields.what_to_engrave),
      "Description": trim(fields.description),
      "Instructions": trim(fields.instructions)
    };
  }

  function fieldsFromOptions(map) {
    map = map || {};
    return {
      name: map.Name || "",
      phone: map.Phone || "",
      provided_font: map.Font || "",
      custom_font: map["Custom font"] || "",
      placement: map.Placement || "",
      engraving_text: map["Engraving text"] || "",
      what_to_engrave: map["What to engrave"] || "",
      description: map.Description || "",
      instructions: map.Instructions || "",
      board_size: map[SIZE] || ""
    };
  }

  function versioned(map) {
    return map && map[VERSION] === VERSION_VALUE;
  }

  function fieldsForSku(items, sku) {
    var found = null;
    (items || []).forEach(function (it) {
      if (found || (!isEngrave(it) && !isBoard(it))) return;
      var map = readOptions(it);
      if (!versioned(map)) return;
      if ((map[FOR_SKU] || "") !== String(sku || "")) return;
      found = fieldsFromOptions(map);
    });
    return found;
  }

  function authoritativeFields(items, sku, draft) {
    var fromCart = fieldsForSku(items, sku);
    if (fromCart) return { source: "cart", fields: fromCart };
    if (draft && typeof draft === "object") return { source: "draft", fields: draft };
    return { source: "none", fields: null };
  }

  function lineComplete(it) {
    if (!isEngrave(it) && !isBoard(it)) return true;
    var map = readOptions(it);
    if (!versioned(map)) return false;
    if (!oneLine(map[FOR_SKU])) return false;
    if (!oneLine(map.Name)) return false;
    if (digits(map.Phone) < 7) return false;
    if (!oneLine(map.Font)) return false;
    if (!placementSaved(map.Placement)) return false;
    if (!trim(map["Engraving text"])) return false;
    if (isBoard(it) && BOARD_DISPLAY_PRICES[map[SIZE]] == null) return false;
    return true;
  }

  function allowCheckout(items) {
    return incomplete(items).length === 0;
  }

  function isCheckoutIntent(href, text) {
    var link = String(href || "");
    var label = String(text || "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
    if (/\/checkout(\/|$|\?|#)/i.test(link)) return true;
    return /^(checkout|check out|go to checkout|place order|pay now|continue to payment)$/i.test(label);
  }

  function incomplete(items) {
    var out = [];
    (items || []).forEach(function (it, index) {
      if (!isEngrave(it) && !isBoard(it)) return;
      if (lineComplete(it)) return;
      var map = readOptions(it);
      out.push({
        index: index,
        role: isBoard(it) ? "board" : "knife",
        forSku: map[FOR_SKU] || "",
        quantity: it.quantity || 0
      });
    });
    return out;
  }

  function blankQty(items) {
    var qty = 0;
    (items || []).forEach(function (it) {
      if (!isEngrave(it)) return;
      if (versioned(readOptions(it))) return;
      qty += it.quantity || 0;
    });
    return qty;
  }

  function applyKnife(items, job) {
    job = job || {};
    var check = validate("knife", job.fields);
    if (!check.ok) return { error: "invalid", errors: check.errors, items: items || [] };
    var sku = oneLine(job.forSku);
    if (!sku) return { error: "association", items: items || [] };
    var options = optionMap(job.fields, { forSku: sku, itemName: job.itemName, role: "knife" });
    var next = [];
    var replaced = false;
    var blanks = [];
    (items || []).forEach(function (it) {
      if (!isEngrave(it)) {
        next.push(cloneItem(it));
        return;
      }
      var map = readOptions(it);
      if (versioned(map) && (map[FOR_SKU] || "") === sku) {
        if (!replaced) {
          next.push(engraveShell(options, 1));
          replaced = true;
        }
        return;
      }
      if (!versioned(map)) {
        blanks.push(it);
        return;
      }
      next.push(cloneItem(it));
    });
    if (!replaced) {
      var pool = 0;
      blanks.forEach(function (it) { pool += it.quantity || 0; });
      if (pool > 0) pool -= 1;
      if (pool > 0) next.push(engraveShell({}, pool));
      next.push(engraveShell(options, 1));
    } else {
      blanks.forEach(function (it) { next.push(cloneItem(it)); });
    }
    return { items: next, options: options, forSku: sku };
  }

  function boardOwned(items, sku) {
    if (!sku) return false;
    return (items || []).some(function (it) {
      return isBoard(it) && (readOptions(it)[FOR_SKU] || "") === sku;
    });
  }

  function applyBoard(items, spec) {
    spec = spec || {};
    var sku = oneLine(spec.forSku);
    var size = spec.size == null ? "" : String(spec.size);
    var sizeOk = BOARD_DISPLAY_PRICES[size] != null;
    if (spec.fields) {
      var check = validate("board", spec.fields);
      if (!check.ok) return { error: "invalid", errors: check.errors, items: items || [] };
      if (!sku) return { error: "association", items: items || [] };
      size = spec.fields.board_size;
      sizeOk = BOARD_DISPLAY_PRICES[size] != null;
    }
    var claimUnscoped = !boardOwned(items, sku);
    var next = [];
    var replaced = false;
    var targetOptions = null;
    (items || []).forEach(function (it) {
      if (!isBoard(it)) {
        next.push(cloneItem(it));
        return;
      }
      var map = readOptions(it);
      var owner = map[FOR_SKU] || "";
      var mine = owner === sku || (owner === "" && claimUnscoped);
      if (!mine) {
        next.push(cloneItem(it));
        return;
      }
      if (!sizeOk || replaced) return;
      var options;
      if (spec.fields) options = optionMap(spec.fields, { forSku: sku, itemName: spec.itemName, role: "board" });
      else options = readOptions(it);
      options[SIZE] = size;
      if (sku) options[FOR_SKU] = sku;
      if (spec.itemName) options[ITEM] = trim(spec.itemName);
      targetOptions = options;
      next.push(boardShell(options, 1));
      replaced = true;
    });
    if (sizeOk && !replaced && spec.fields) {
      var created = optionMap(spec.fields, { forSku: sku, itemName: spec.itemName, role: "board" });
      created[SIZE] = size;
      if (sku) created[FOR_SKU] = sku;
      if (spec.itemName) created[ITEM] = trim(spec.itemName);
      targetOptions = created;
      next.push(boardShell(created, 1));
    }
    return { items: next, options: targetOptions, forSku: sku };
  }

  function lineSig(it) {
    var p = productOf(it);
    var kind = isEngrave(it) ? "E" : isBoard(it) ? "B" : "O";
    var id = p.id != null ? p.id : it.productId;
    return kind + "|" + id + "|" + (it.quantity || 0) + "|" + JSON.stringify(norm(readOptions(it)));
  }

  function sameLines(a, b) {
    var left = (a || []).map(lineSig).sort();
    var right = (b || []).map(lineSig).sort();
    if (left.length !== right.length) return false;
    for (var i = 0; i < left.length; i++) if (left[i] !== right[i]) return false;
    function others(list) {
      return (list || []).filter(function (it) {
        return !isEngrave(it) && !isBoard(it);
      }).map(function (it) {
        var p = productOf(it);
        return String(p.id != null ? p.id : it.productId) + "x" + (it.quantity || 0);
      }).join(",");
    }
    return others(a) === others(b);
  }

  function addPayload(id, quantity, options) {
    var payload = { id: id, quantity: quantity };
    var cleaned = norm(options);
    var keys = Object.keys(cleaned);
    if (keys.length) payload.options = cleaned;
    return payload;
  }

  function identityOf(it) {
    var p = productOf(it);
    var id = p.id != null ? p.id : it.productId;
    return id + "|" + JSON.stringify(norm(readOptions(it)));
  }

  function sameTarget(current, desired, isTarget) {
    function sigs(list) {
      return (list || []).filter(isTarget).map(lineSig).sort();
    }
    var left = sigs(current);
    var right = sigs(desired);
    if (left.length !== right.length) return false;
    for (var i = 0; i < left.length; i++) if (left[i] !== right[i]) return false;
    return true;
  }

  /* One cart change per fresh Cart.get.
     addProduct is used only for an option set that is not already in the cart,
     so a same-option quantity combine cannot swallow a different line.
     removeProduct deletes the whole position at one index from that get.
     A wrong quantity is corrected by removing that position, then adding it
     back on the next get. Parent products are not targets. */
  function nextCartFix(current, desired, isTarget, productId) {
    var have = [];
    var want = [];
    (current || []).forEach(function (it, index) {
      if (isTarget(it)) have.push({ index: index, id: identityOf(it), qty: it.quantity || 0, item: it });
    });
    (desired || []).forEach(function (it) {
      if (isTarget(it)) want.push({ id: identityOf(it), qty: it.quantity || 0, item: it });
    });
    var haveById = {};
    have.forEach(function (row) { haveById[row.id] = row; });
    var wantById = {};
    want.forEach(function (row) { wantById[row.id] = row; });
    var missing = null;
    Object.keys(wantById).forEach(function (id) {
      if (!haveById[id] && !missing) missing = wantById[id];
    });
    if (missing) {
      return { type: "add", payload: addPayload(productId, missing.qty, readOptions(missing.item)) };
    }
    var removeIndex = -1;
    have.forEach(function (row) {
      var wanted = wantById[row.id];
      if (!wanted || wanted.qty !== row.qty) removeIndex = row.index;
    });
    if (removeIndex >= 0) return { type: "remove", index: removeIndex };
    return null;
  }

  function converge(adapter, desiredItems, isTarget, productId, cb) {
    var steps = 0;
    var acted = false;
    function tick() {
      if (steps++ > 16) return cb({ ok: false, error: "converge-failed" });
      adapter.get(function (cart) {
        var items = (cart && cart.items) || [];
        if (sameTarget(items, desiredItems, isTarget)) {
          return cb({ ok: true, unchanged: !acted, cart: cart });
        }
        var action = nextCartFix(items, desiredItems, isTarget, productId);
        if (!action) return cb({ ok: false, error: "converge-failed" });
        acted = true;
        if (action.type === "add") {
          adapter.add(action.payload, function (success) {
            if (!success) return cb({ ok: false, error: "add-failed" });
            tick();
          });
          return;
        }
        adapter.remove(action.index, function (success) {
          if (success === false) return cb({ ok: false, error: "remove-failed" });
          tick();
        });
      });
    }
    tick();
  }

  function runKnife(adapter, job, cb) {
    adapter.get(function (cart) {
      var before = (cart && cart.items) || [];
      var plan = applyKnife(before, job);
      if (plan.error) return cb({ ok: false, error: plan.error, errors: plan.errors });
      converge(adapter, plan.items, isEngrave, ENGRAVE_ID, cb);
    });
  }

  function runBoard(adapter, spec, cb) {
    adapter.get(function (cart) {
      var before = (cart && cart.items) || [];
      var plan = applyBoard(before, spec);
      if (plan.error) return cb({ ok: false, error: plan.error, errors: plan.errors });
      converge(adapter, plan.items, isBoard, BOARD_ID, cb);
    });
  }

  function mapToSelected(options) {
    return Object.keys(norm(options)).sort().map(function (name) {
      return {
        name: name,
        type: name === SIZE ? "CHOICE" : "TEXT",
        value: String(options[name])
      };
    });
  }

  /* Test double of the order Ecwid stores after checkout.
     Ecwid copies cart options into item.selectedOptions. This function does
     that copy in the documented REST shape. It does not place an order. */
  function orderFromCart(cart, meta) {
    meta = meta || {};
    return {
      id: meta.id,
      paymentStatus: meta.paymentStatus,
      email: meta.email || "",
      orderComments: meta.orderComments != null ? meta.orderComments : "",
      extraFields: meta.extraFields || {},
      items: ((cart && cart.items) || []).map(function (it, index) {
        var p = productOf(it);
        return {
          id: it.id != null ? it.id : index + 1,
          productId: p.id,
          sku: p.sku || "",
          name: p.name || "",
          quantity: it.quantity || 0,
          selectedOptions: mapToSelected(readOptions(it))
        };
      })
    };
  }

  var REQUIRED_AT_ADD = {
    "BC instructions v": true,
    "For SKU": true,
    "Name": true,
    "Phone": true,
    "Font": true,
    "Placement": true,
    "Engraving text": true
  };

  function catalogOptions() {
    return TEXT_OPTIONS.map(function (option) {
      return { type: option.type, name: option.name, required: !!REQUIRED_AT_ADD[option.name] };
    });
  }

  return {
    ENGRAVE_ID: ENGRAVE_ID,
    ENGRAVE_SKU: ENGRAVE_SKU,
    BOARD_ID: BOARD_ID,
    BOARD_SKU: BOARD_SKU,
    SIZE_OPTION: SIZE,
    VERSION_OPTION: VERSION,
    VERSION_VALUE: VERSION_VALUE,
    FOR_SKU: FOR_SKU,
    FULFILLMENT_NOTE: FULFILLMENT_NOTE,
    BOARD_DISPLAY_PRICES: BOARD_DISPLAY_PRICES,
    OTHER_PLACEMENT: OTHER_PLACEMENT,
    TEXT_OPTIONS: TEXT_OPTIONS,
    browserSendsEmail: false,
    isCheckoutStep: function (type) { return !!CHECKOUT_STEPS[type]; },
    catalogOptions: catalogOptions,
    validate: validate,
    explain: explain,
    optionMap: optionMap,
    readOptions: readOptions,
    fieldsFromOptions: fieldsFromOptions,
    fieldsForSku: fieldsForSku,
    authoritativeFields: authoritativeFields,
    incomplete: incomplete,
    allowCheckout: allowCheckout,
    isCheckoutIntent: isCheckoutIntent,
    applyKnife: applyKnife,
    applyBoard: applyBoard,
    runKnife: runKnife,
    runBoard: runBoard,
    addPayload: addPayload,
    sameLines: sameLines,
    orderFromCart: orderFromCart,
    isEngrave: isEngrave,
    isBoard: isBoard,
    norm: norm
  };
});
