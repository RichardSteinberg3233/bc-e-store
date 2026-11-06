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

## Ops: required flags before this script is published

The twelve fields already exist. Do not add fields, rename them, change their types, or touch product names, prices, or `Engraving size`. Flip `required` only. This repo does not call the catalog API.

Yes opens the questionnaire and does not add a charge. The charged `ENGRAVE` or `BOARD-ENGRAVE` line is added only after the form is complete. Ecwid enforces `required` at add time, including a direct product, cart, or category add with this script unavailable. Required means the value is non-empty. It does not check that the version is exactly `1`, that the phone has 7 digits, or that the word Other includes a place.

| Option name | Type, unchanged | `required` |
| --- | --- | --- |
| `BC instructions v` | `TEXTFIELD` | true. The script writes `1`. |
| `For SKU` | `TEXTFIELD` | true. Parent part number. |
| `Item` | `TEXTAREA` | false |
| `Name` | `TEXTFIELD` | true |
| `Phone` | `TEXTFIELD` | true. Non-empty only. The script and watcher still require 7 digits. |
| `Font` | `TEXTFIELD` | true. One resolved value: the specimen, the custom font, or `specimen / custom`. |
| `Custom font` | `TEXTFIELD` | false. A note. It is not an alternative to `Font`. |
| `Placement` | `TEXTFIELD` | true. `Blade`, `Handle`, `Top`, `Bottom`, or `Other: <place>`. |
| `Engraving text` | `TEXTAREA` | true. The one instruction. The script copies literal text, otherwise "what to engrave" or the board description, into this field. |
| `What to engrave` | `TEXTAREA` | false |
| `Description` | `TEXTAREA` | false |
| `Instructions` | `TEXTAREA` | false. Kept as a note. An Other placement is stored in required `Placement` as `Other: <instructions>`. |

`Engraving size` on `BOARD-ENGRAVE` stays required. Leave its choices and modifiers as they are.

A line already in a cart is not revalidated when these flags change. An old blank `$15` line can still be purchased until it is removed or the form is saved onto it. Saving consumes one old blank line so it is not charged twice. Any blank that remains blocks the standard checkout path and, if it is paid, stays in the watcher pending file with an alert. The watcher does not send that order and does not fill the missing fields from comments or extra fields.

```json
{
  "options": [
    { "type": "TEXTFIELD", "name": "BC instructions v", "required": true },
    { "type": "TEXTFIELD", "name": "For SKU", "required": true },
    { "type": "TEXTAREA", "name": "Item", "required": false },
    { "type": "TEXTFIELD", "name": "Name", "required": true },
    { "type": "TEXTFIELD", "name": "Phone", "required": true },
    { "type": "TEXTFIELD", "name": "Font", "required": true },
    { "type": "TEXTFIELD", "name": "Custom font", "required": false },
    { "type": "TEXTFIELD", "name": "Placement", "required": true },
    { "type": "TEXTAREA", "name": "Engraving text", "required": true },
    { "type": "TEXTAREA", "name": "What to engrave", "required": false },
    { "type": "TEXTAREA", "name": "Description", "required": false },
    { "type": "TEXTAREA", "name": "Instructions", "required": false }
  ]
}
```

For `ENGRAVE`, PUT only `options` with that list. For `BOARD-ENGRAVE`, GET first and PUT `options` as the existing `Engraving size` object, unchanged, followed by that list. Do not send `name` or `price`.

`PUT /api/v3/142565005/products/865178331`

`PUT /api/v3/142565005/products/868564107`

Read back both products. Confirm names and prices are unchanged, `Engraving size` is still required with the same modifiers, and the seven fields above are required.

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

The script sends the choice text (`4x4`, not `4x4 - $20`). It does not send `price` or `selectedPrice`. Copy `Engraving size` from the GET. Do not retype it.

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

After the required flags above are on the products, Ecwid rejects a new add that leaves `Font`, `Placement`, `Engraving text`, `For SKU`, `Name`, `Phone`, or `BC instructions v` empty. That includes a direct product, cart, or category add while this script is unavailable. The script also refuses to add until those values are resolved. `Ecwid.OnPageLoad` and `Ecwid.OnPageLoaded` still return a shopper to the cart when an older blank line is already in the cart.

These paths can still produce an incomplete paid engraving line:

- A line already in the cart before the required flags change. Ecwid does not revalidate it.
- The required value is non-empty but not a real answer: version other than `1`, a phone shorter than 7 digits, or Placement equal to `Other` with no place after the colon. The script will not add those. A direct add can. The watcher keeps that paid order pending, with an alert, and does not send.
- The live loader is still `@v1.0.28`, so the form still adds the old blank line until this file is published.
- An order created in Ecwid admin or by the REST API does not pass the storefront required check.

The watcher does not skip an incomplete paid order and does not backfill it. The sender stays paused until a storefront test order is complete and the email is delivered once.

## Live loader

This repository does not contain the storefront loader or a theme. The live homepage has one script tag, immediately before `</body>`:

```html
<script src="https://cdn.jsdelivr.net/gh/RichardSteinberg3233/bc-e-store@v1.0.28/bc-engrave-e.min.js" onerror="var s=document.createElement('script');s.src=this.src.replace('//cdn.','//fastly.');document.body.appendChild(s)"></script>
```

The only change is `@v1.0.28` to `@v1.0.29` in that `src`. The `onerror` fallback copies `this.src`, so it follows the new version. Do not replace the surrounding inline scripts. Do not publish that change until the coordinator runs the storefront test.

## Deploy and tag

Do this only when the coordinator is ready to load the new script, and only after the required-flag read-back above. Publishing still waits on a storefront test order. The live page is `@v1.0.28`.

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
