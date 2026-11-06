#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const legacy = path.join(__dirname, "legacy");
const header = "/* bc-engrave-e v1.0.30 2026-11-06 | per-item engraving instructions on each cart line; Continue to checkout stays on an incomplete form; browser email removed; paid-order queue is the only email path */\n";

function read(name) {
  return fs.readFileSync(path.join(legacy, name), "utf8");
}

let storefront = fs.readFileSync(path.join(__dirname, "src", "storefront.js"), "utf8");
storefront = storefront.replace("__KNIFE_CSS__", JSON.stringify(read("knife.css")));
storefront = storefront.replace("__BOARD_CSS__", JSON.stringify(read("board.css")));
if (storefront.includes("__KNIFE_CSS__") || storefront.includes("__BOARD_CSS__")) {
  throw new Error("CSS placeholders were not replaced");
}

const parts = [
  header,
  read("cats.js").replace(/\s*$/, "\n"),
  fs.readFileSync(path.join(__dirname, "src", "contract.js"), "utf8").replace(/\s*$/, "\n"),
  storefront.replace(/\s*$/, "\n"),
  read("hero.js").replace(/\s*$/, "\n"),
  read("tail.js").replace(/\s*$/, "\n")
];

const out = path.join(root, "bc-engrave-e.min.js");
fs.writeFileSync(out, parts.join("\n"));
process.stdout.write(out + "\n");
