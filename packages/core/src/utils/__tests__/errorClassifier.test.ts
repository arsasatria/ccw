import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyError } from "../errorClassifier";

test("401 is advance (chain to next account/entry)", () => {
  assert.equal(classifyError({ status: 401, body: "" }), "advance");
});

test("429 is advance", () => {
  assert.equal(classifyError({ status: 429, body: "" }), "advance");
});

test("500 is advance", () => {
  assert.equal(classifyError({ status: 500, body: "" }), "advance");
});

test("502/503/504 is advance", () => {
  assert.equal(classifyError({ status: 502, body: "" }), "advance");
  assert.equal(classifyError({ status: 503, body: "" }), "advance");
  assert.equal(classifyError({ status: 504, body: "" }), "advance");
});

test("408 timeout is advance", () => {
  assert.equal(classifyError({ status: 408, body: "" }), "advance");
});

test("400 with function name empty is advance (provider rejected malformed tool)", () => {
  assert.equal(
    classifyError({ status: 400, body: 'function name or parameters is empty' }),
    "advance"
  );
});

test("400 with other body is stop (probably user error)", () => {
  assert.equal(classifyError({ status: 400, body: "missing required field" }), "stop");
});

test("403 is stop (account is fine, just not authorized)", () => {
  assert.equal(classifyError({ status: 403, body: "" }), "stop");
});

test("network error / no status is advance", () => {
  assert.equal(classifyError({ code: "ECONNRESET" }), "advance");
});

test("null/undefined is stop (defensive)", () => {
  assert.equal(classifyError(undefined), "stop");
  assert.equal(classifyError(null), "stop");
});

test("all four network error codes are advance", () => {
  for (const code of ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "ECONNREFUSED"]) {
    assert.equal(classifyError({ code }), "advance", `code=${code}`);
  }
});

test("unknown error code falls through to stop", () => {
  assert.equal(classifyError({ code: "WEIRD_ERROR" }), "stop");
});

test("empty error object is stop", () => {
  assert.equal(classifyError({}), "stop");
});
