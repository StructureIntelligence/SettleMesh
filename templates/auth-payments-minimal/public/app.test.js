const test = require("node:test");
const assert = require("node:assert/strict");

const { formatQuote, formatQuoteDetails, operationAfterKnownPreEffect } = require("./app.js");

test("quote display distinguishes exact, representative floor, and actual-usage hold ceiling", () => {
  assert.equal(
    formatQuote({ quote_kind: "exact", total_credits: 0.0001 }),
    "0.0001 Aev exact"
  );
  assert.match(
    formatQuote({ quote_kind: "representative_floor", total_credits: 2, price_label: "2 aev/s" }),
    /representative|floor/i
  );
  assert.match(
    formatQuote({
      quote_kind: "hold_ceiling",
      total_credits: 11,
      capture_ceiling_credits: 11,
      capture_basis: "actual_usage",
    }),
    /11 Aev hold ceiling \(actual usage, not a final charge\)/
  );
});

test("quote details preserve note, required fields, and availability recovery", () => {
  const details = formatQuoteDetails({
    note: "input-priced",
    required_fields: ["prompt", "duration"],
    availability: {
      status: "unavailable",
      reason: "provider binding is missing",
      fix: "configure the provider binding",
    },
  });
  assert.match(details, /input-priced/);
  assert.match(details, /prompt, duration/);
  assert.match(details, /availability: unavailable/);
  assert.match(details, /configure the provider binding/);
});

test("known pre-effect failure clears only a fresh operation and preserves prior recovery identity", () => {
  const pending = {
    id: "web-test-operation",
    input: { prompt: "same input" },
    effect_may_have_started: true,
  };
  assert.equal(operationAfterKnownPreEffect(pending, false), null);
  assert.equal(operationAfterKnownPreEffect(pending, true), pending);
});
