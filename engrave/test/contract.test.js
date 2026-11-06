"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const C = require("../src/contract");

const root = path.join(__dirname, "..", "..");

function knife(id, qty) {
  return {
    product: { id: id, sku: "K-" + id, name: "Knife " + id, price: 100 },
    quantity: qty || 1,
    options: {}
  };
}

function blank(qty) {
  return {
    product: { id: C.ENGRAVE_ID, sku: C.ENGRAVE_SKU, name: "ENGRAVE - BC Knife - Service - Engraving", price: 15 },
    quantity: qty || 1,
    options: {}
  };
}

function fields(extra) {
  return Object.assign({
    name: "Ada Lovelace",
    phone: "(432) 555-0100",
    provided_font: "1 Allura",
    custom_font: "",
    placement: "Blade",
    engraving_text: "AAA",
    what_to_engrave: "Knife One",
    description: "",
    instructions: "",
    board_size: ""
  }, extra || {});
}

function createAdapter(items, behavior) {
  behavior = behavior || {};
  const cart = { items: JSON.parse(JSON.stringify(items)) };
  const api = {
    cart: cart,
    adds: [],
    removes: [],
    get: function (cb) { cb({ items: JSON.parse(JSON.stringify(cart.items)) }); },
    add: function (payload, cb) {
      api.adds.push(JSON.parse(JSON.stringify(payload)));
      if (behavior.failAdd) return cb(false);
      if (behavior.failBlankRestore && payload.id === C.ENGRAVE_ID && !payload.options) return cb(false);
      assert.equal(payload.price, undefined);
      assert.equal(payload.selectedPrice, undefined);
      const sku = payload.id === C.ENGRAVE_ID ? C.ENGRAVE_SKU : C.BOARD_SKU;
      const name = payload.id === C.ENGRAVE_ID ? "ENGRAVE - BC Knife - Service - Engraving" : "Cutting Board Engraving";
      const price = payload.id === C.ENGRAVE_ID ? 15 : 12;
      cart.items.push({
        product: { id: payload.id, sku: sku, name: name, price: price },
        quantity: payload.quantity,
        options: payload.options || {}
      });
      cb(true);
    },
    remove: function (index, cb) {
      api.removes.push(index);
      if (behavior.failRemove) return cb(false);
      cart.items.splice(index, 1);
      cb(true);
    }
  };
  return api;
}

function run(method, adapter, job) {
  return new Promise(function (resolve) {
    method(adapter, job, resolve);
  });
}

function sigs(items) {
  return items.map(function (it) {
    const id = it.product.id;
    const kind = id === C.ENGRAVE_ID ? "E" : id === C.BOARD_ID ? "B" : "O";
    return kind + "|" + id + "|" + it.quantity + "|" + JSON.stringify(C.norm(C.readOptions(it)));
  }).sort();
}

test("font and placement are required", function () {
  const missingFont = C.validate("knife", fields({ provided_font: "Select a font", custom_font: "  " }));
  assert.equal(missingFont.ok, false);
  assert.ok(missingFont.errors.includes("font"));

  const missingPlacement = C.validate("knife", fields({ placement: "Select placement" }));
  assert.equal(missingPlacement.ok, false);
  assert.ok(missingPlacement.errors.includes("placement"));

  const specimen = C.validate("knife", fields({ custom_font: "" }));
  assert.equal(specimen.ok, true);

  const customOnly = C.validate("knife", fields({ provided_font: "", custom_font: "Shop Script", placement: "Handle" }));
  assert.equal(customOnly.ok, true);

  const other = C.validate("board", fields({
    placement: C.OTHER_PLACEMENT,
    instructions: "",
    board_size: "4x4",
    engraving_text: "",
    description: "Maple board"
  }));
  assert.ok(other.errors.includes("instructions"));
  const otherOk = C.validate("board", fields({
    placement: C.OTHER_PLACEMENT,
    instructions: "Lower right corner",
    board_size: "4x4",
    engraving_text: "",
    description: "Maple board"
  }));
  assert.equal(otherOk.ok, true);

  const shortPhone = C.validate("knife", fields({ phone: "555-01", engraving_text: "", what_to_engrave: "" }));
  assert.ok(shortPhone.errors.includes("phone"));
  assert.ok(shortPhone.errors.includes("text"));
  assert.ok(C.explain("knife", shortPhone.errors).includes("font") === false);
});

test("two engraved items keep their own instructions", async function () {
  const adapter = createAdapter([knife(101), knife(202), blank(2)]);
  const first = await run(C.runKnife, adapter, { forSku: "SKU-1", itemName: "Knife One", fields: fields({ engraving_text: "AAA" }) });
  assert.equal(first.ok, true);
  const second = await run(C.runKnife, adapter, {
    forSku: "SKU-2",
    itemName: "Knife Two",
    fields: fields({ engraving_text: "BBB", placement: "Handle", provided_font: "11 Cooper Black" })
  });
  assert.equal(second.ok, true);
  const lines = adapter.cart.items.filter(C.isEngrave);
  assert.equal(lines.length, 2);
  const bySku = {};
  lines.forEach(function (line) { bySku[C.readOptions(line)["For SKU"]] = C.readOptions(line); });
  assert.equal(bySku["SKU-1"]["Engraving text"], "AAA");
  assert.equal(bySku["SKU-1"].Placement, "Blade");
  assert.equal(bySku["SKU-2"]["Engraving text"], "BBB");
  assert.equal(bySku["SKU-2"].Placement, "Handle");
  assert.equal(bySku["SKU-1"]["Engraving text"] === bySku["SKU-2"]["Engraving text"], false);
  const tagged = adapter.adds.filter(function (payload) { return payload.options && payload.options["For SKU"]; });
  assert.deepEqual(tagged.map(function (payload) { return payload.options["For SKU"]; }), ["SKU-1", "SKU-2"]);
  assert.equal(JSON.stringify(tagged[0]).includes("BBB"), false);
  assert.equal(JSON.stringify(tagged[1]).includes("AAA"), false);
});

test("instructions survive checkout refresh and a second device cart", async function () {
  const adapter = createAdapter([knife(101), blank(1)]);
  const saved = await run(C.runKnife, adapter, { forSku: "SKU-1", itemName: "Knife One", fields: fields() });
  assert.equal(saved.ok, true);
  const order = C.orderFromCart(adapter.cart, {
    id: "ORDAVTEST",
    paymentStatus: "AWAITING_PAYMENT",
    email: "buyer@example.com",
    orderComments: C.FULFILLMENT_NOTE,
    extraFields: {}
  });
  const line = order.items.filter(function (item) { return item.sku === "ENGRAVE"; })[0];
  const stored = {};
  line.selectedOptions.forEach(function (option) { stored[option.name] = option.value; });
  assert.equal(stored["BC instructions v"], "1");
  assert.equal(stored["For SKU"], "SKU-1");
  assert.equal(stored.Font, "1 Allura");
  assert.equal(stored.Placement, "Blade");
  assert.equal(stored["Engraving text"], "AAA");
  assert.deepEqual(order.extraFields, {});
  assert.equal(order.orderComments.includes("AAA"), false);

  const draft = { provided_font: "WRONG FONT", placement: "Handle", engraving_text: "WRONG" };
  const freshBrowser = C.authoritativeFields(adapter.cart.items, "SKU-1", null);
  assert.equal(freshBrowser.source, "cart");
  assert.equal(freshBrowser.fields.provided_font, "1 Allura");
  assert.equal(freshBrowser.fields.engraving_text, "AAA");
  const otherDevice = C.authoritativeFields(adapter.cart.items, "SKU-1", draft);
  assert.equal(otherDevice.source, "cart");
  assert.equal(otherDevice.fields.provided_font, "1 Allura");
  assert.equal(C.fieldsForSku([], "SKU-1"), null);
});

test("a failed option write does not remove the engraving line", async function () {
  const adapter = createAdapter([knife(101), blank(1)], { failAdd: true });
  const result = await run(C.runKnife, adapter, { forSku: "SKU-1", itemName: "Knife One", fields: fields() });
  assert.equal(result.ok, false);
  assert.equal(result.error, "add-failed");
  assert.equal(adapter.removes.length, 0);
  assert.equal(adapter.cart.items.filter(C.isEngrave).length, 1);
  assert.equal(C.readOptions(adapter.cart.items.filter(C.isEngrave)[0])["BC instructions v"], undefined);
});

test("board price stays on the catalog size option", async function () {
  const adapter = createAdapter([
    { product: { id: 303, sku: "BOARD-1", name: "Maple board", price: 80 }, quantity: 1, options: {} }
  ]);
  const boardFields = fields({
    placement: "Top",
    board_size: "4x4",
    engraving_text: "Family",
    description: "Maple board"
  });
  const first = await run(C.runBoard, adapter, { forSku: "BOARD-1", itemName: "Maple board", size: "4x4", fields: boardFields });
  assert.equal(first.ok, true);
  const payload = adapter.adds[0];
  assert.equal(payload.id, C.BOARD_ID);
  assert.equal(payload.quantity, 1);
  assert.equal(payload.options["Engraving size"], "4x4");
  assert.equal(payload.options["For SKU"], "BOARD-1");
  assert.equal(payload.price, undefined);
  assert.equal(payload.selectedPrice, undefined);
  const secondAdapterAdds = adapter.adds.length;
  const again = await run(C.runBoard, adapter, { forSku: "BOARD-1", itemName: "Maple board", size: "4x4", fields: boardFields });
  assert.equal(again.unchanged, true);
  assert.equal(adapter.adds.length, secondAdapterAdds);

  const other = await run(C.runBoard, adapter, {
    forSku: "BOARD-2",
    itemName: "Walnut board",
    size: "2x2",
    fields: fields({ placement: "Bottom", board_size: "2x2", engraving_text: "Walnut", description: "Walnut board" })
  });
  assert.equal(other.ok, true);
  const boards = adapter.cart.items.filter(C.isBoard);
  assert.equal(boards.length, 2);
  const sizes = {};
  boards.forEach(function (line) {
    const options = C.readOptions(line);
    sizes[options["For SKU"]] = options["Engraving size"];
  });
  assert.equal(sizes["BOARD-1"], "4x4");
  assert.equal(sizes["BOARD-2"], "2x2");
  const resized = await run(C.runBoard, adapter, {
    forSku: "BOARD-1",
    itemName: "Maple board",
    size: "5x5",
    fields: fields({ placement: "Top", board_size: "5x5", engraving_text: "Family", description: "Maple board" })
  });
  assert.equal(resized.ok, true);
  const after = {};
  adapter.cart.items.filter(C.isBoard).forEach(function (line) {
    const options = C.readOptions(line);
    after[options["For SKU"]] = options["Engraving size"];
  });
  assert.equal(adapter.cart.items.filter(C.isBoard).length, 2);
  assert.equal(after["BOARD-1"], "5x5");
  assert.equal(after["BOARD-2"], "2x2");
  assert.equal(C.isCheckoutStep("CHECKOUT_PAYMENT_DETAILS"), true);
  assert.equal(C.isCheckoutStep("CHECKOUT_RESULT"), false);
  assert.equal(C.isCheckoutStep("ORDER_CONFIRMATION"), false);
  assert.deepEqual(sigs(adapter.cart.items).filter(function (sig) { return sig.indexOf("\"price\"") !== -1; }), []);
});

test("checkout is blocked while an engraving line has no saved instructions", function () {
  const items = [knife(101), blank(1)];
  const missing = C.incomplete(items);
  assert.equal(missing.length, 1);
  assert.equal(missing[0].role, "knife");
  assert.equal(C.allowCheckout(items), false);
  const done = C.applyKnife(items, { forSku: "SKU-1", itemName: "Knife One", fields: fields() });
  assert.equal(C.allowCheckout(done.items), true);
});

test("one finished line does not cover a direct or blank engraving line", function () {
  const done = C.applyKnife([knife(101), blank(1)], { forSku: "SKU-1", itemName: "Knife One", fields: fields() });
  const withBlank = done.items.concat([blank(1)]);
  assert.equal(C.incomplete(withBlank).length, 1);
  assert.equal(C.allowCheckout(withBlank), false);
  const nativePartial = {
    product: { id: C.ENGRAVE_ID, sku: "ENGRAVE", name: "ENGRAVE", price: 15 },
    quantity: 1,
    options: {
      "BC instructions v": "1",
      "Name": "Ada",
      "Phone": "4325550100",
      "Font": "1 Allura",
      "Placement": "Blade",
      "Engraving text": "Hi"
    }
  };
  assert.equal(C.allowCheckout([nativePartial]), false);
  nativePartial.options["For SKU"] = "SKU-1";
  assert.equal(C.allowCheckout([knife(101), nativePartial]), true);
  nativePartial.options.Phone = "555-01";
  assert.equal(C.allowCheckout([nativePartial]), false);
});

test("checkout entry words are recognized and shopping words are not", function () {
  assert.equal(C.isCheckoutIntent("/checkout", ""), true);
  assert.equal(C.isCheckoutIntent("/checkout/payment", "Continue"), true);
  assert.equal(C.isCheckoutIntent("", "Checkout"), true);
  assert.equal(C.isCheckoutIntent("", "Place order"), true);
  assert.equal(C.isCheckoutIntent("/products", "Continue shopping"), false);
  assert.equal(C.isCheckoutIntent("", "Yes, add engraving"), false);
  assert.equal(C.isCheckoutIntent("", "Return to shopping"), false);
});

function sdkAdapter(items) {
  const cart = { items: JSON.parse(JSON.stringify(items)) };
  const api = {
    cart: cart,
    adds: [],
    removedIds: [],
    get: function (cb) { cb({ items: JSON.parse(JSON.stringify(cart.items)) }); },
    add: function (payload, cb) {
      api.adds.push(JSON.parse(JSON.stringify(payload)));
      assert.equal(payload.price, undefined);
      assert.equal(payload.selectedPrice, undefined);
      const incoming = JSON.stringify(C.norm(payload.options || {}));
      let merged = false;
      cart.items.forEach(function (it) {
        if (merged || !it.product || it.product.id !== payload.id) return;
        if (JSON.stringify(C.norm(it.options || {})) === incoming) {
          it.quantity = (it.quantity || 0) + payload.quantity;
          merged = true;
        }
      });
      if (!merged) {
        const sku = payload.id === C.ENGRAVE_ID ? C.ENGRAVE_SKU : C.BOARD_SKU;
        cart.items.push({
          product: { id: payload.id, sku: sku, name: sku, price: payload.id === C.ENGRAVE_ID ? 15 : 12 },
          quantity: payload.quantity,
          options: payload.options || {}
        });
      }
      cb(true);
    },
    remove: function (index, cb) {
      const it = cart.items[index];
      api.removedIds.push(it && it.product && it.product.id);
      cart.items.splice(index, 1);
      cb(true);
    }
  };
  return api;
}

test("merged blanks and a cart refresh do not drop the parent items", async function () {
  const adapter = sdkAdapter([knife(101), knife(202), blank(1)]);
  adapter.add({ id: C.ENGRAVE_ID, quantity: 1 }, function () {});
  assert.equal(adapter.cart.items.filter(C.isEngrave).length, 1);
  assert.equal(adapter.cart.items.filter(C.isEngrave)[0].quantity, 2);
  assert.equal(C.allowCheckout(adapter.cart.items), false);
  const first = await run(C.runKnife, adapter, { forSku: "SKU-1", itemName: "Knife One", fields: fields({ engraving_text: "AAA" }) });
  assert.equal(first.ok, true);
  let refreshed = null;
  adapter.get(function (cart) { refreshed = cart; });
  assert.equal(C.allowCheckout(refreshed.items), false);
  assert.ok(refreshed.items.filter(C.isEngrave).every(function (line) { return line.quantity === 1; }));
  const second = await run(C.runKnife, adapter, {
    forSku: "SKU-2",
    itemName: "Knife Two",
    fields: fields({ engraving_text: "BBB", placement: "Handle" })
  });
  assert.equal(second.ok, true);
  adapter.get(function (cart) { refreshed = cart; });
  assert.equal(C.allowCheckout(refreshed.items), true);
  assert.deepEqual(refreshed.items.filter(function (it) { return !C.isEngrave(it); }).map(function (it) { return it.product.id; }), [101, 202]);
  assert.ok(adapter.removedIds.every(function (id) { return id === C.ENGRAVE_ID; }));
  const bySku = {};
  refreshed.items.filter(C.isEngrave).forEach(function (line) {
    bySku[C.readOptions(line)["For SKU"]] = C.readOptions(line)["Engraving text"];
  });
  assert.equal(bySku["SKU-1"], "AAA");
  assert.equal(bySku["SKU-2"], "BBB");
});

test("native required fields are present on a new engraving add", function () {
  const required = C.catalogOptions().filter(function (option) { return option.required; }).map(function (option) { return option.name; });
  assert.deepEqual(required, ["BC instructions v", "For SKU", "Name", "Phone", "Font", "Placement", "Engraving text"]);
  const plan = C.applyKnife([knife(101)], {
    forSku: "SKU-1",
    itemName: "Knife One",
    fields: fields({
      provided_font: "",
      custom_font: "Shop Script",
      engraving_text: "",
      what_to_engrave: "Initials on the blade"
    })
  });
  assert.equal(plan.error, undefined);
  assert.equal(plan.options.Font, "Shop Script");
  assert.equal(plan.options["Engraving text"], "Initials on the blade");
  assert.equal(plan.options.Placement, "Blade");
  const payload = C.addPayload(C.ENGRAVE_ID, 1, plan.options);
  required.forEach(function (name) {
    assert.ok(payload.options[name], name);
  });
  assert.equal(plan.items.filter(C.isEngrave).length, 1);
  assert.equal(C.allowCheckout(plan.items), true);
  const oldBlank = C.applyKnife([knife(101), blank(1)], { forSku: "SKU-1", itemName: "Knife One", fields: fields() });
  assert.equal(oldBlank.items.filter(C.isEngrave).length, 1);
  const both = fields({ provided_font: "1 Allura", custom_font: "Shop Script" });
  assert.equal(C.optionMap(both, { forSku: "SKU-1", role: "knife" }).Font, "1 Allura / Shop Script");
  const other = C.validate("knife", fields({ placement: C.OTHER_PLACEMENT, instructions: "" }));
  assert.ok(other.errors.includes("instructions"));
  const otherSaved = C.optionMap(fields({ placement: C.OTHER_PLACEMENT, instructions: "Lower right" }), { forSku: "SKU-1", role: "knife" });
  assert.equal(otherSaved.Placement, "Other: Lower right");
  const boardText = C.optionMap(fields({
    engraving_text: "",
    description: "Maple logo",
    placement: "Top",
    board_size: "4x4"
  }), { forSku: "BOARD-1", role: "board" });
  assert.equal(boardText["Engraving text"], "Maple logo");
  assert.equal(boardText.Font, "1 Allura");
});

test("continue to checkout does not add engraving when the questionnaire is incomplete", function () {
  const empty = C.validate("knife", { placement: "Blade" });
  assert.equal(empty.ok, false);
  assert.ok(empty.errors.includes("name"));
  assert.ok(empty.errors.includes("phone"));
  assert.ok(empty.errors.includes("font"));
  assert.ok(empty.errors.includes("text"));
  assert.ok(C.explain("knife", empty.errors).length > 0);
  const textOnly = C.validate("knife", { placement: "Blade", engraving_text: "TEST DO NOT ENGRAVE" });
  assert.equal(textOnly.ok, false);
  assert.ok(textOnly.errors.includes("font"));
  assert.ok(textOnly.errors.includes("name"));
  const plan = C.applyKnife([knife(2425)], {
    forSku: "2425K",
    itemName: "CRKT Scribe",
    fields: { placement: "Blade", engraving_text: "TEST DO NOT ENGRAVE" }
  });
  assert.equal(plan.error, "invalid");
  assert.equal(plan.items.filter(C.isEngrave).length, 0);
});

test("storefront source and bundle do not send browser mail", function () {
  const build = spawnSync(process.execPath, [path.join(root, "engrave", "build.js")], { encoding: "utf8" });
  assert.equal(build.status, 0, build.stderr);
  const bundle = fs.readFileSync(path.join(root, "bc-engrave-e.min.js"), "utf8");
  const storefront = fs.readFileSync(path.join(root, "engrave", "src", "storefront.js"), "utf8");
  const contract = fs.readFileSync(path.join(root, "engrave", "src", "contract.js"), "utf8");
  [bundle, storefront, contract].forEach(function (source) {
    assert.equal(source.toLowerCase().includes("formsubmit"), false);
  });
  assert.equal(C.browserSendsEmail, false);
  assert.ok(bundle.startsWith("/* bc-engrave-e v1.0.29 2026-11-06"));
  assert.ok(bundle.includes("BC instructions v"));
  assert.ok(bundle.includes("For SKU"));
  assert.ok(bundle.includes("OnPageLoad"));
  assert.ok(storefront.includes("a.bc-mailin-checkout-btn"));
  assert.ok(storefront.includes("stopImmediatePropagation"));
  assert.ok(bundle.includes("whole-tree category qualification"));
  assert.ok(bundle.includes('placeholder",T'));
  const check = spawnSync(process.execPath, ["--check", path.join(root, "bc-engrave-e.min.js")], { encoding: "utf8" });
  assert.equal(check.status, 0, check.stderr);
});

test("paid queue is the sender and it does not send twice", function () {
  const adapter = createAdapter([knife(101), knife(202), blank(2)]);
  return run(C.runKnife, adapter, { forSku: "SKU-1", itemName: "Knife One", fields: fields({ engraving_text: "AAA" }) }).then(function () {
    return run(C.runKnife, adapter, {
      forSku: "SKU-2",
      itemName: "Knife Two",
      fields: fields({ engraving_text: "BBB", placement: "Handle", provided_font: "", custom_font: "Shop Script" })
    });
  }).then(function () {
    const order = C.orderFromCart(adapter.cart, {
      id: "ORDAVTEST",
      paymentStatus: "AWAITING_PAYMENT",
      email: "buyer@example.com",
      orderComments: C.FULFILLMENT_NOTE + "\n\nSKU-OTHER should not win",
      extraFields: { Font: "FROM EXTRA FIELD" }
    });
    const dir = fs.mkdtempSync(path.join(require("os").tmpdir(), "bc-engrave-"));
    const orderPath = path.join(dir, "order.json");
    const py = path.join(root, "engrave", "notify", "queue_contract.py");
    function call(args) {
      const result = spawnSync("python3", [py].concat(args), { encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      return JSON.parse(result.stdout);
    }
    fs.writeFileSync(orderPath, JSON.stringify(order));
    const waiting = call(["enqueue", orderPath, dir]);
    assert.equal(waiting.result, "not_paid");
    order.paymentStatus = "PAID";
    fs.writeFileSync(orderPath, JSON.stringify(order));
    const queued = call(["enqueue", orderPath, dir]);
    assert.equal(queued.result, "queued");
    const again = call(["enqueue", orderPath, dir]);
    assert.equal(again.result, "already_queued");
    const sent = call(["claim", queued.path]);
    assert.equal(sent.result, "send");
    assert.equal(sent.message.to, "engraving@bcknife.com");
    const sections = sent.message.body.split("----- engraving item -----");
    assert.ok(sections[1].includes("For SKU: SKU-1"));
    assert.ok(sections[1].includes("Engraving text: AAA"));
    assert.equal(sections[1].includes("BBB"), false);
    assert.ok(sections[2].includes("For SKU: SKU-2"));
    assert.ok(sections[2].includes("Engraving text: BBB"));
    assert.equal(sections[2].includes("AAA"), false);
    assert.equal(sent.message.body.includes("FROM EXTRA FIELD"), false);
    const secondSend = call(["claim", queued.path]);
    assert.equal(secondSend.result, "already_sent");
    assert.equal(secondSend.message, null);
  });
});

test("catalog contract names stay aligned with the deploy notes", function () {
  const notes = fs.readFileSync(path.join(root, "engrave", "CONTRACT.md"), "utf8");
  C.catalogOptions().forEach(function (option) {
    assert.ok(option.type === "TEXTFIELD" || option.type === "TEXTAREA");
    assert.ok(notes.includes(option.name), option.name);
    if (option.required) assert.ok(notes.includes('"' + option.name + '"'));
  });
  assert.equal(C.catalogOptions().filter(function (option) { return option.name === "Custom font"; })[0].required, false);
  assert.equal(C.catalogOptions().filter(function (option) { return option.name === "Instructions"; })[0].required, false);
  assert.ok(notes.includes("Engraving size"));
  assert.ok(notes.includes("255"));
  assert.ok(notes.includes("v1.0.29"));
  assert.ok(notes.includes("formsubmit") === false || notes.toLowerCase().includes("do not send"));
});
