"""Paid-order engraving queue contract for the box watcher.

The storefront does not send email. A paid Ecwid order is written once to
``<outbox>/<order id>.json``. The parent Gmail routine claims that file and
sends it. This module does not talk to SMTP, Gmail, or Ecwid.

Production outbox directory (not created here): /workspace/engrave-notify/outbox
"""

from __future__ import annotations

import json
import os
from pathlib import Path

SCHEMA = "bc-engrave-outbox/1"
TO = "engraving@bcknife.com"
ENGRAVE_ID = 865178331
BOARD_ID = 868564107
ENGRAVE_SKU = "ENGRAVE"
BOARD_SKU = "BOARD-ENGRAVE"
VERSION = "BC instructions v"
VERSION_VALUE = "1"

TEXT_FIELDS = (
    ("For SKU", "forSku"),
    ("Item", "item"),
    ("Name", "name"),
    ("Phone", "phone"),
    ("Font", "font"),
    ("Custom font", "customFont"),
    ("Placement", "placement"),
    ("Engraving text", "engravingText"),
    ("What to engrave", "whatToEngrave"),
    ("Description", "description"),
    ("Instructions", "instructions"),
    ("Engraving size", "engravingSize"),
)


def option_map(item):
    raw = item.get("selectedOptions") or item.get("options") or []
    found = {}
    if isinstance(raw, dict):
        for key, value in raw.items():
            found[str(key)] = "" if value is None else str(value)
        return found
    for entry in raw:
        if not isinstance(entry, dict) or not entry.get("name"):
            continue
        value = entry.get("value")
        if value is None:
            value = entry.get("selectionTitle") or ""
        found[str(entry["name"])] = str(value)
    return found


def _product_id(item):
    product = item.get("product") or {}
    return item.get("productId", product.get("id"))


def _sku(item):
    product = item.get("product") or {}
    return item.get("sku") or product.get("sku") or ""


def _role(item):
    product_id = _product_id(item)
    sku = _sku(item)
    if product_id == ENGRAVE_ID or sku == ENGRAVE_SKU:
        return "knife"
    if product_id == BOARD_ID or sku == BOARD_SKU:
        return "board"
    return ""


def instruction_items(order):
    items = []
    skipped = 0
    for item in order.get("items") or []:
        role = _role(item)
        if not role:
            continue
        options = option_map(item)
        if options.get(VERSION) != VERSION_VALUE:
            skipped += 1
            continue
        row = {
            "orderItemId": item.get("id"),
            "role": role,
            "productId": _product_id(item),
            "sku": _sku(item),
            "quantity": item.get("quantity") or 0,
        }
        for option_name, field in TEXT_FIELDS:
            row[field] = options.get(option_name, "")
        row["options"] = options
        items.append(row)
    items.sort(key=lambda row: (row.get("forSku") or "", str(row.get("orderItemId") or "")))
    return items, skipped


def order_public_id(order):
    public = order.get("id")
    if isinstance(public, str) and public.strip():
        chosen = public.strip()
    else:
        vendor = order.get("vendorOrderNumber")
        if isinstance(vendor, str) and vendor.strip():
            chosen = vendor.strip()
        elif order.get("orderNumber") is not None and str(order.get("orderNumber")).strip():
            chosen = str(order.get("orderNumber")).strip()
        else:
            raise ValueError("order id missing")
    if chosen in {".", ".."} or "/" in chosen or "\\" in chosen:
        raise ValueError("order id cannot be a path")
    return chosen


def _customer_email(order):
    if order.get("email"):
        return str(order["email"])
    customer = order.get("customer") or {}
    return str(customer.get("email") or "")


def _section(row):
    lines = [
        "----- engraving item -----",
        "Line: %s" % row["role"],
        "Order item id: %s" % (row.get("orderItemId") if row.get("orderItemId") is not None else ""),
        "Product: %s (%s)" % (row.get("sku") or "", row.get("productId") if row.get("productId") is not None else ""),
        "Quantity: %s" % row.get("quantity"),
        "For SKU: %s" % row.get("forSku", ""),
        "Item: %s" % row.get("item", ""),
        "Name: %s" % row.get("name", ""),
        "Phone: %s" % row.get("phone", ""),
        "Font: %s" % row.get("font", ""),
        "Custom font: %s" % row.get("customFont", ""),
        "Placement: %s" % row.get("placement", ""),
        "Engraving text: %s" % row.get("engravingText", ""),
        "What to engrave: %s" % row.get("whatToEngrave", ""),
        "Description: %s" % row.get("description", ""),
        "Instructions: %s" % row.get("instructions", ""),
        "Engraving size: %s" % row.get("engravingSize", ""),
    ]
    return "\n".join(lines)


def build_payload(order):
    items, skipped = instruction_items(order)
    order_id = order_public_id(order)
    body = "\n".join([
        "Order: %s" % order_id,
        "Payment: %s" % (order.get("paymentStatus") or ""),
        "Customer email: %s" % _customer_email(order),
        "Items: %s" % len(items),
        "",
        "\n\n".join(_section(row) for row in items),
    ])
    return {
        "schema": SCHEMA,
        "orderId": order_id,
        "paymentStatus": order.get("paymentStatus") or "",
        "to": TO,
        "customerEmail": _customer_email(order),
        "dispatchState": "queued",
        "browserFormSubmit": False,
        "authority": "server-queue",
        "orderComments": order.get("orderComments") or "",
        "extraFields": order.get("extraFields") or {},
        "skippedUnversionedLines": skipped,
        "items": items,
        "message": {
            "to": TO,
            "subject": "Engraving order %s" % order_id,
            "body": body,
        },
    }


def assess(order):
    if (order.get("paymentStatus") or "") != "PAID":
        return "not_paid"
    items, _skipped = instruction_items(order)
    if not items:
        return "no_instructions"
    return "ready"


def enqueue(order, outbox):
    """Write the queue file once. An existing file is not rewritten."""
    status = assess(order)
    if status != "ready":
        return {"result": status, "path": None}
    directory = Path(outbox)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / ("%s.json" % order_public_id(order))
    payload = build_payload(order)
    try:
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o644)
    except FileExistsError:
        return {"result": "already_queued", "path": str(path)}
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")
    return {"result": "queued", "path": str(path)}


def claim(path):
    """Parent Gmail routine: return the message once, and only when PAID.

    No SMTP. The caller sends ``message`` and treats every other result as
    do-not-send.
    """
    target = Path(path)
    lock = target.with_name(target.name + ".lock")
    try:
        fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o644)
    except FileExistsError:
        return {"result": "busy", "message": None}
    os.close(fd)
    try:
        payload = json.loads(target.read_text(encoding="utf-8"))
        if payload.get("paymentStatus") != "PAID":
            return {"result": "not_paid", "message": None}
        if payload.get("dispatchState") == "sent":
            return {"result": "already_sent", "message": None}
        if payload.get("dispatchState") != "queued":
            return {"result": "not_sendable", "message": None}
        message = payload.get("message")
        payload["dispatchState"] = "sent"
        temporary = target.with_name(target.name + ".tmp")
        temporary.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        os.replace(temporary, target)
        return {"result": "send", "message": message}
    finally:
        try:
            lock.unlink()
        except FileNotFoundError:
            pass


def main(argv):
    command = argv[1]
    if command == "enqueue":
        order = json.loads(Path(argv[2]).read_text(encoding="utf-8"))
        print(json.dumps(enqueue(order, Path(argv[3]))))
        return 0
    if command == "claim":
        print(json.dumps(claim(Path(argv[2]))))
        return 0
    raise SystemExit("usage: queue_contract.py enqueue ORDER.json OUTBOX | claim FILE")


if __name__ == "__main__":
    raise SystemExit(main(__import__("sys").argv))
