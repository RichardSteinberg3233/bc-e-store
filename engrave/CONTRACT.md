# Engraving order contract (v1.0.29)

Store 142565005. Knife service product `ENGRAVE` id `865178331` ($15, name unchanged). Board service product `BOARD-ENGRAVE` id `868564107` ($12 base, name unchanged). Engraver mailbox `engraving@bcknife.com`.

This file is the contract to apply before catalog options are created. It does not change the live store.

## What is saved, and where

Each engraved surface is its own cart line. The questionnaire is that line's product options. Ecwid copies those options onto the order item as `selectedOptions`. That is the record the paid-order queue reads.

| Channel | Scope | Used for instructions? |
| --- | --- | --- |
| Product options → order `items[].selectedOptions` | Per engraving line | Yes. Source of truth. |
| `orderComments` | One string for the whole order | No. The storefront still sets only `ENGRAVING ORDER: send item to engraving before shipping.` when an `ENGRAVE` line is in the cart. The shopper can edit that box at checkout. |
| `extraFields` / `orderExtraFields` | One value per field for the whole order | No. The storefront does not write them. |

`For SKU` on each engraving line is the parent item's SKU. Two knives produce two `ENGRAVE` lines. Two boards produce two `BOARD-ENGRAVE` lines. A later edit replaces the line with that same `For SKU` and does not overwrite the other one.

A line is complete only when it has `BC instructions v` = `1` and the required answers below. The browser does not send mail.

## Catalog options to add

Add these options to **both** products. `required` is `false` on every one of them. Do not set a price modifier. Do not send `name` or `price` in the product update.

| Option name | Ecwid type | Required in catalog | Required before checkout |
| --- | --- | --- | --- |
| `BC instructions v` | `TEXTFIELD` | false | Set to `1` by the script when the form is accepted |
| `For SKU` | `TEXTFIELD` | false | Parent item SKU |
| `Item` | `TEXTAREA` | false | Parent item name |
| `Name` | `TEXTFIELD` | false | Shopper name |
| `Phone` | `TEXTFIELD` | false | At least 7 digits |
| `Font` | `TEXTFIELD` | false | Specimen name, or blank when a custom font is set |
| `Custom font` | `TEXTFIELD` | false | Free-text font, or blank when a specimen is chosen |
| `Placement` | `TEXTFIELD` | false | Knife: `Blade` or `Handle`. Board: `Top`, `Bottom`, or `Other (describe in Instructions)` |
| `Engraving text` | `TEXTAREA` | false | Knife: this or `What to engrave`. Board: this or `Description` |
| `What to engrave` | `TEXTAREA` | false | Knife description field |
| `Description` | `TEXTAREA` | false | Board description field |
| `Instructions` | `TEXTAREA` | false | Required only when placement is `Other (describe in Instructions)` |

Font is satisfied by `Font` or `Custom font`. Both may be present. Empty and `Select a font` do not count. Empty and `Select placement` do not count.

`BOARD-ENGRAVE` already has a required `SELECT` named `Engraving size`. Leave that option, its choices, and its price modifiers as they are:

| Choice | Modifier seen on the live product | Price shown |
| --- | --- | --- |
| `2x2` | none (base $12) | $12 |
| `3x3` | +3 ABSOLUTE | $15 |
| `4x4` | +8 ABSOLUTE | $20 |
| `5x5` | +18 ABSOLUTE | $30 |
| `6x6` | +28 ABSOLUTE | $40 |
| `7x7` | +38 ABSOLUTE | $50 |
| `8x8` | +48 ABSOLUTE | $60 |
| `Larger than 8x8` | +63 ABSOLUTE | $75 |

The script sends the choice text (`4x4`, not `4x4 - $20`). It does not send `price` or `selectedPrice`.

Catalog `required: false` is deliberate. `Yes, add engraving` on a knife calls `Ecwid.Cart.addProduct({ id: 865178331, quantity: 1 })` with no options, then opens the form. A catalog-required option would reject that add. The script rejects checkout while any `ENGRAVE` or `BOARD-ENGRAVE` line is missing `BC instructions v` = `1` or fails the checks above.

### PUT bodies

Private token stays on the box. Do not put it in the browser or this repo.

`ENGRAVE` currently has no options. PUT only `options`:

```json
{
  "options": [
    { "type": "TEXTFIELD", "name": "BC instructions v", "required": false },
    { "type": "TEXTFIELD", "name": "For SKU", "required": false },
    { "type": "TEXTAREA", "name": "Item", "required": false },
    { "type": "TEXTFIELD", "name": "Name", "required": false },
    { "type": "TEXTFIELD", "name": "Phone", "required": false },
    { "type": "TEXTFIELD", "name": "Font", "required": false },
    { "type": "TEXTFIELD", "name": "Custom font", "required": false },
    { "type": "TEXTFIELD", "name": "Placement", "required": false },
    { "type": "TEXTAREA", "name": "Engraving text", "required": false },
    { "type": "TEXTAREA", "name": "What to engrave", "required": false },
    { "type": "TEXTAREA", "name": "Description", "required": false },
    { "type": "TEXTAREA", "name": "Instructions", "required": false }
  ]
}
```

`PUT /api/v3/142565005/products/865178331`

For `BOARD-ENGRAVE`, GET the product first and PUT `options` as the **full list**: the existing `Engraving size` object, unchanged, followed by the twelve objects above.

`PUT /api/v3/142565005/products/868564107`

Do not retype `Engraving size` from this document. Copy it from the GET. After both PUTs, GET again and confirm:

- `ENGRAVE` name is still `ENGRAVE - BC Knife - Service - Engraving`, price is still 15
- `BOARD-ENGRAVE` name is still `Cutting Board Engraving`, price is still 12
- `Engraving size` is still required and its modifiers still match the table
- the twelve new options exist, are not required, and have no price modifier

No published "update a single option" call was found. Send the full `options` list you want stored.

## Storefront API actually used

Documented Ecwid storefront calls only:

- `Ecwid.Cart.get`
- `Ecwid.Cart.addProduct({ id, quantity, options, callback })` — `options` is a map of the **exact option name** to a string. Text field and text area values are strings. This is already how `Engraving size` is added today.
- `Ecwid.Cart.removeProduct(index, callback)` — removes the whole cart position, including quantity greater than 1
- `Ecwid.Cart.setOrderComments(text)` — one order-level comment
- `Ecwid.openPage("category", { id })` and `Ecwid.openPage("cart")`
- `Ecwid.OnAPILoaded`, `Ecwid.OnCartChanged`, `Ecwid.OnPageLoaded`

There is no documented call that updates options on an existing line. The script adds the new line first. If that add fails, it does not remove the previous line. It then removes the previous line for that same `For SKU`. `removeProduct` is how a quantity change is done: remove the position, then add it back at the new quantity.

Not used, because they do not do this job:

- `ec.order.extraFields` and `Ecwid.refreshConfig`. Extra fields are order-level. The create-order reference says an extra field **value cannot exceed 255 characters**. The extra-field JS reference also caps one configuration setting at 255 characters and the whole order's extra fields at 8Kb. Several engraving jobs do not fit in one 255-character value, and the value is not attached to a line.
- `Ecwid.openPage("product", { options: [index, index] })`. That array only preselects dropdown or radio choices by index. It does not accept this text questionnaire.
- `selectedPrice`. Documented to apply only when name-your-price is enabled. These products are not sent a price.
- Any REST call with a secret token. The public product read already in the script uses the existing public token.
- FormSubmit. The browser must not send mail. Do not keep a silent browser fallback beside the queue.

No character limit for a text option's shopper value was found in the cart or order `selectedOptions` schema (the 200-symbol figure on the CSV import page applies to preset choice values, and the 100-symbol figure applies to option names in that import). These option names are shorter than 100. The live storefront test has to confirm a normal engraving text is still on the paid order. This repo does not invent a maxlength or truncate text.

A guest cart stays with that browser. Refresh of the same cart loads the options from Ecwid, so clearing `localStorage` does not drop a saved line. A different device does not have that guest cart. After checkout, the order is the record the queue uses.

`OnOrderPlaced` can run while `paymentStatus` is still `AWAITING_PAYMENT`. Documented paid status values include `AWAITING_PAYMENT` and `PAID`. The browser no longer listens for that event to send mail.

## Queue file

Outbox directory on the box: `/workspace/engrave-notify/outbox/<orderId>.json`

`<orderId>` is the Ecwid order `id` string (the public id, same shape as `ORDAVH4W`). REST `GET /orders/{orderId}` accepts that public id. `orderNumber` is the older internal number and is not the filename when `id` is present.

Write the file only when `paymentStatus` is `PAID` and at least one engraving line has `BC instructions v` = `1`. If the file already exists, do not rewrite it. Lines without that version are skipped, so an old order that only has a blank `ENGRAVE` line and the fulfillment comment (the shape reported for `ORDAVH4W`) produces no file.

`extraFields` and `orderComments` are copied onto the file for inspection. The email body is built only from each saved line's `selectedOptions`. One file is one Gmail message. Each item is its own section, with its own `For SKU`.

```json
{
  "schema": "bc-engrave-outbox/1",
  "orderId": "ORDAVTEST",
  "paymentStatus": "PAID",
  "to": "engraving@bcknife.com",
  "dispatchState": "queued",
  "browserFormSubmit": false,
  "authority": "server-queue",
  "items": [
    {
      "role": "knife",
      "productId": 865178331,
      "sku": "ENGRAVE",
      "forSku": "SKU-1",
      "font": "1 Allura",
      "placement": "Blade",
      "engravingText": "AAA"
    }
  ],
  "message": {
    "to": "engraving@bcknife.com",
    "subject": "Engraving order ORDAVTEST",
    "body": "..."
  }
}
```

The parent Gmail routine sends `message` only when `paymentStatus` is `PAID` and `dispatchState` is `queued`, then sets `dispatchState` to `sent`. A second claim sends nothing. There is no SMTP client in this repo. Reference implementation: `engrave/notify/queue_contract.py`. The box watcher is not modified from here.

The storefront blocks the standard checkout pages and the checkout, place-order, and pay buttons while any engraving line fails the same checks the watcher uses: `BC instructions v` = `1`, non-empty `For SKU`, name, phone with at least 7 digits, a font or a custom font, placement, text (knife: engraving text or what to engrave; board: engraving text or description), and instructions when placement begins with "Other". One finished line does not excuse a blank line. `Ecwid.Cart.canGotoCheckout` only reports the store's terms checkbox. It cannot take this rule. There is no documented call that makes Ecwid refuse payment.

Because the twelve new options are optional in the catalog, Ecwid itself will add a direct product, cart, or category purchase of `ENGRAVE` with those fields empty and will take payment for it. The script is not a server-side payment gate. It listens for `Ecwid.OnPageLoad` (navigation started) and `Ecwid.OnPageLoaded`, and it stops a checkout click until `Ecwid.Cart.get` shows every engraving line complete. That covers the normal storefront path after this file is the one the page loads.

These paths can still create an incomplete paid engraving line:

- This file is not the script on the live page. The live loader is still `@v1.0.28`.
- The storefront script fails to load or has not reached `Ecwid.OnAPILoaded` before the shopper pays.
- A wallet or PayPal button inside a cross-origin frame does not deliver the click to the page, and the order goes straight to `ORDER_CONFIRMATION`. That event is after payment. The script does not redirect it.
- `OnPageLoad` tells the script the page changed. It does not cancel the change. `openPage("cart")` runs after the callback. A payment request that finishes before that redirect is not stopped.
- An order created in Ecwid admin or by the REST API never runs this script.

The watcher skipping an incomplete order stops the engraving email. It does not void the payment. The sender stays paused until a storefront test order is complete and the email is delivered once.

## Live loader

This repository does not contain the storefront loader or a theme. The live homepage has one script tag, immediately before `</body>`:

```html
<script src="https://cdn.jsdelivr.net/gh/RichardSteinberg3233/bc-e-store@v1.0.28/bc-engrave-e.min.js" onerror="var s=document.createElement('script');s.src=this.src.replace('//cdn.','//fastly.');document.body.appendChild(s)"></script>
```

The only change is `@v1.0.28` to `@v1.0.29` in that `src`. The `onerror` fallback copies `this.src`, so it follows the new version. Do not replace the surrounding inline scripts. Do not publish that change until the coordinator runs the storefront test.

## Deploy and tag

Do this only when the coordinator is ready to load the new script. The catalog options are already on the products. Publishing still waits on a storefront test order, because the live page is `@v1.0.28` and optional catalog fields do not stop Ecwid from taking payment by themselves.

1. Merge the reviewed branch.
2. Confirm the box queue writes this schema and will not send a second time for the same file. It must ignore lines that lack `BC instructions v` = `1`.
3. Tag the merge commit and push the tag:

```bash
git checkout main
git pull origin main
git tag -a v1.0.29 -m "bc-engrave-e v1.0.29 per-item engraving options"
git push origin v1.0.29
```

4. The live page loads `https://cdn.jsdelivr.net/gh/RichardSteinberg3233/bc-e-store@v1.0.28/bc-engrave-e.min.js`. Change that URL to `@v1.0.29/bc-engrave-e.min.js`. The file header is `bc-engrave-e v1.0.29 2026-11-06`. The category-qualifier block inside it still says v1.0.27 because that block was not changed.
5. Purge the CDN URL after the tag exists: `https://purge.jsdelivr.net/gh/RichardSteinberg3233/bc-e-store@v1.0.29/bc-engrave-e.min.js`
6. Place a **storefront** test order. Add a knife, choose Yes, fill name, phone, a font, a placement, and text, pay, and confirm all of the following:
   - the paid order's `ENGRAVE` line has `selectedOptions` for `BC instructions v`, `For SKU`, `Font`, `Placement`, and the text
   - one outbox file named with that order id
   - one delivered message at `engraving@bcknife.com`
   - a second pass does not send another message
   - a second item in the same order keeps its own SKU, font, placement, and text
7. An order typed into Ecwid admin only shows that the queue can read `selectedOptions`. It is not the storefront test. Do not edit order `ORDAVH4W`. Do not change product names or prices. Kitchens are outside this store.

Automated tests in this repo do not place that order and do not deliver mail. They cover required fields, per-item association, the cart-to-order option copy, an unpaid order producing no queue file, a paid order queueing once, and no browser mail call in the script.

```bash
node --test engrave/test/contract.test.js
python3 engrave/notify/test_queue.py
```
