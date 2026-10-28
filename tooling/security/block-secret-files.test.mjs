import assert from "node:assert/strict";
import test from "node:test";

import { isBlocked } from "./block-secret-files.mjs";

test("allows env example templates", () => {
  assert.equal(isBlocked(".env.example"), false);
  assert.equal(isBlocked(".env.defaults.example"), false);
  assert.equal(isBlocked(".env.schema"), false);
  assert.equal(isBlocked("apps/web/.env.local.example"), false);
  assert.equal(isBlocked("docs/env-setup.md"), false);
  assert.equal(isBlocked("src/environment.ts"), false);
});

test("blocks real env files at any depth", () => {
  assert.equal(isBlocked(".env"), true);
  assert.equal(isBlocked(".env.local"), true);
  assert.equal(isBlocked(".env.production"), true);
  assert.equal(isBlocked(".env.staging"), true);
  assert.equal(isBlocked(".env.development"), true);
  assert.equal(isBlocked(".env.test"), true);
  assert.equal(isBlocked("apps/web/.env.production"), true);
  assert.equal(isBlocked("config/.env.staging"), true);
  assert.equal(isBlocked("services/api/.env"), true);
  assert.equal(isBlocked("prod.env"), true);
});

test("blocks keys, certificates, and similar-looking names", () => {
  assert.equal(isBlocked("certs/server.pem"), true);
  assert.equal(isBlocked("id_rsa"), true);
  assert.equal(isBlocked("nested/id_rsa.pub"), true);
  assert.equal(isBlocked("app/server.key"), true);
  assert.equal(isBlocked(".env.production.backup"), true);
  assert.equal(isBlocked(".env.example.key"), true);
  assert.equal(isBlocked("secrets/.env.test.txt"), true);
});
