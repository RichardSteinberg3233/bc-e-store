import json
import tempfile
import unittest
from pathlib import Path

from queue_contract import assess, build_payload, claim, enqueue


def line(product_id, sku, options, item_id, text_name="Engraving text", text="HELLO"):
    selected = [{"name": "BC instructions v", "type": "TEXT", "value": "1"}]
    selected.extend({"name": name, "type": "TEXT", "value": value} for name, value in options.items())
    selected.append({"name": text_name, "type": "TEXT", "value": text})
    return {
        "id": item_id,
        "productId": product_id,
        "sku": sku,
        "quantity": 1,
        "selectedOptions": selected,
    }


def paid_order():
    return {
        "id": "ORDAVTEST",
        "orderNumber": 999001,
        "paymentStatus": "PAID",
        "email": "buyer@example.com",
        "orderComments": "ENGRAVING ORDER: send item to engraving before shipping.\n\nSKU-OTHER should not win",
        "extraFields": {"Font": "FROM EXTRA FIELD"},
        "items": [
            line(865178331, "ENGRAVE", {
                "For SKU": "SKU-1",
                "Item": "Knife One",
                "Name": "Ada",
                "Phone": "4325550100",
                "Font": "1 Allura",
                "Placement": "Blade",
            }, 11, text="AAA"),
            line(865178331, "ENGRAVE", {
                "For SKU": "SKU-2",
                "Item": "Knife Two",
                "Name": "Bea",
                "Phone": "4325550199",
                "Font": "Shop Script",
                "Custom font": "Shop Script",
                "Placement": "Handle",
            }, 12, text="BBB"),
            {
                "id": 13,
                "productId": 111,
                "sku": "KNIFE-1",
                "quantity": 1,
                "selectedOptions": [],
            },
        ],
    }


class QueueContractTest(unittest.TestCase):
    def test_per_item_association_ignores_global_fields(self):
        payload = build_payload(paid_order())
        self.assertEqual([row["forSku"] for row in payload["items"]], ["SKU-1", "SKU-2"])
        self.assertEqual(payload["items"][0]["engravingText"], "AAA")
        self.assertEqual(payload["items"][1]["engravingText"], "BBB")
        self.assertEqual(payload["items"][0]["font"], "1 Allura")
        self.assertEqual(payload["items"][1]["customFont"], "Shop Script")
        body = payload["message"]["body"]
        first = body.split("----- engraving item -----")[1]
        second = body.split("----- engraving item -----")[2]
        self.assertIn("For SKU: SKU-1", first)
        self.assertIn("Engraving text: AAA", first)
        self.assertNotIn("BBB", first)
        self.assertIn("For SKU: SKU-2", second)
        self.assertIn("Engraving text: BBB", second)
        self.assertNotIn("AAA", second)
        self.assertNotIn("FROM EXTRA FIELD", body)
        self.assertNotIn("SKU-OTHER", first)
        self.assertEqual(payload["extraFields"]["Font"], "FROM EXTRA FIELD")
        self.assertFalse(payload["browserFormSubmit"])
        self.assertEqual(payload["message"]["to"], "engraving@bcknife.com")

    def test_async_payment_and_no_duplicate_dispatch(self):
        order = paid_order()
        order["paymentStatus"] = "AWAITING_PAYMENT"
        with tempfile.TemporaryDirectory() as tmp:
            outbox = Path(tmp)
            waiting = enqueue(order, outbox)
            self.assertEqual(waiting["result"], "not_paid")
            self.assertEqual(list(outbox.glob("*.json")), [])
            order["paymentStatus"] = "PAID"
            first = enqueue(order, outbox)
            self.assertEqual(first["result"], "queued")
            second = enqueue(order, outbox)
            self.assertEqual(second["result"], "already_queued")
            self.assertEqual(len(list(outbox.glob("*.json"))), 1)
            sent = claim(first["path"])
            self.assertEqual(sent["result"], "send")
            self.assertIn("SKU-1", sent["message"]["body"])
            self.assertIn("SKU-2", sent["message"]["body"])
            again = claim(first["path"])
            self.assertEqual(again["result"], "already_sent")
            self.assertIsNone(again["message"])
            stored = json.loads(Path(first["path"]).read_text(encoding="utf-8"))
            self.assertEqual(stored["dispatchState"], "sent")

    def test_incomplete_paid_stays_pending_without_backfill(self):
        order = {
            "id": "ORDAVH4W",
            "paymentStatus": "PAID",
            "email": "buyer@example.com",
            "orderComments": "Font: Secret Script",
            "extraFields": {"Font": "FROM EXTRA FIELD"},
            "items": [{
                "id": 1,
                "productId": 865178331,
                "sku": "ENGRAVE",
                "quantity": 1,
                "selectedOptions": [],
            }],
        }
        self.assertEqual(assess(order), "pending")
        with tempfile.TemporaryDirectory() as tmp:
            first = enqueue(order, tmp)
            self.assertEqual(first["result"], "pending")
            stored = json.loads(Path(first["path"]).read_text(encoding="utf-8"))
            self.assertEqual(stored["dispatchState"], "pending")
            self.assertIsNone(stored["message"])
            self.assertEqual(stored["items"][0]["font"], "")
            self.assertIn("version", stored["alert"][0]["problems"])
            self.assertIn("font", stored["alert"][0]["problems"])
            held = claim(first["path"])
            self.assertEqual(held["result"], "pending")
            self.assertIsNone(held["message"])
            order["items"][0]["selectedOptions"] = [
                {"name": "BC instructions v", "value": "1"},
                {"name": "For SKU", "value": "SKU-1"},
                {"name": "Name", "value": "Ada"},
                {"name": "Phone", "value": "4325550100"},
                {"name": "Font", "value": "1 Allura"},
                {"name": "Placement", "value": "Blade"},
                {"name": "Engraving text", "value": "AAA"},
            ]
            again = enqueue(order, tmp)
            self.assertEqual(again["result"], "already_pending")
            stored = json.loads(Path(first["path"]).read_text(encoding="utf-8"))
            self.assertIsNone(stored["message"])
            self.assertEqual(stored["items"][0]["font"], "")

    def test_claim_refuses_unpaid_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "HOLD.json"
            path.write_text(json.dumps({
                "paymentStatus": "AWAITING_PAYMENT",
                "dispatchState": "queued",
                "message": {"to": "engraving@bcknife.com", "subject": "x", "body": "y"},
            }), encoding="utf-8")
            result = claim(path)
            self.assertEqual(result["result"], "not_paid")
            self.assertIsNone(result["message"])


if __name__ == "__main__":
    unittest.main()
