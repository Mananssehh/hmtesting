import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classify } from "./index.ts";

Deno.test("paid session -> succeeded", () => {
  assertEquals(classify({ status: "complete", payment_status: "paid" }), "succeeded");
});

Deno.test("no_payment_required -> succeeded", () => {
  assertEquals(classify({ status: "complete", payment_status: "no_payment_required" }), "succeeded");
});

Deno.test("expired session -> expired", () => {
  assertEquals(classify({ status: "expired", payment_status: "unpaid" }), "expired");
});

Deno.test("expired session with processing PI -> unresolved (never guess)", () => {
  assertEquals(
    classify({ status: "expired", payment_status: "unpaid", payment_intent_status: "processing" }),
    "unresolved",
  );
});

Deno.test("open session -> still live", () => {
  assertEquals(classify({ status: "open", payment_status: "unpaid" }), "pending_live");
});

Deno.test("complete but unpaid with processing PI -> still live (delayed payment)", () => {
  assertEquals(
    classify({ status: "complete", payment_status: "unpaid", payment_intent_status: "processing" }),
    "pending_live",
  );
});

Deno.test("complete but unpaid with canceled PI -> failed", () => {
  assertEquals(
    classify({ status: "complete", payment_status: "unpaid", payment_intent_status: "canceled" }),
    "failed",
  );
});

Deno.test("complete session with succeeded PI -> succeeded", () => {
  assertEquals(
    classify({ status: "complete", payment_status: "unpaid", payment_intent_status: "succeeded" }),
    "succeeded",
  );
});

Deno.test("session unreachable -> unresolved, never mutated", () => {
  assertEquals(classify(null), "unresolved");
});

Deno.test("complete + unpaid + unknown PI state -> unresolved", () => {
  assertEquals(classify({ status: "complete", payment_status: "unpaid" }), "unresolved");
});
