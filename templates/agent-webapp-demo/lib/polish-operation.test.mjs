import test from "node:test";
import assert from "node:assert/strict";

import {
  createPolishOperation,
  parsePolishOperation,
  resolveStoredPolishOperation,
} from "./polish-operation.mjs";

test("pending operation keeps one immutable input and valid key", () => {
  const operation = createPolishOperation("original input", "principal-a");
  const parsed = parsePolishOperation(JSON.stringify(operation), "principal-a");

  assert.equal(parsed.input, "original input");
  assert.match(parsed.id, /^polish:[A-Za-z0-9._:-]+$/);
  assert.equal(parsed.principalId, "principal-a");
});

test("useful unknown output is preserved without replacing replay input", () => {
  const parsed = parsePolishOperation(
    JSON.stringify({
      id: "polish:operation-123",
      input: "original input",
      principalId: "principal-a",
      result: "valid provider output",
    }),
    "principal-a"
  );

  assert.equal(parsed.input, "original input");
  assert.equal(parsed.result, "valid provider output");
});

test("pending operation cannot cross principals or accept a fresh malformed key", () => {
  const serialized = JSON.stringify({
    id: "polish:operation-123",
    input: "original input",
    principalId: "principal-a",
  });
  assert.equal(parsePolishOperation(serialized, "principal-b"), null);
  assert.equal(
    parsePolishOperation(
      JSON.stringify({ id: "fresh key", input: "original input", principalId: "principal-a" }),
      "principal-a"
    ),
    null
  );
});

test("stored operation cleanup distinguishes absence from stale cross-principal state", () => {
  assert.deepEqual(resolveStoredPolishOperation(null, "principal-b"), {
    operation: null,
    shouldClear: false,
  });
  const stale = resolveStoredPolishOperation(
    JSON.stringify({
      id: "polish:operation-123",
      input: "original input",
      principalId: "principal-a",
    }),
    "principal-b"
  );
  assert.equal(stale.operation, null);
  assert.equal(stale.shouldClear, true);
});
