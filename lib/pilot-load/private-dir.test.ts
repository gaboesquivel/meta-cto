import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "vitest";

import {
  gitTopLevel,
  missingPrivateFiles,
  PRIVATE_DATA_ENV,
  PRIVATE_LAYOUT,
  privateDataDir,
  resolvePrivateDataDir,
} from "./private-dir";

/** A fake checkout and a sibling folder outside it, both real directories. */
const setup = () => {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), "private-dir-")));
  const repo = path.join(base, "repo");
  const outside = path.join(base, "private");
  mkdirSync(path.join(repo, "data"), { recursive: true });
  mkdirSync(outside);
  return { base, outside, repo };
};

describe("resolvePrivateDataDir", () => {
  it("accepts a folder outside the working tree and lays out pilot and eval paths", () => {
    const { outside, repo } = setup();
    const result = resolvePrivateDataDir(outside, { topLevel: repo });
    assert.ok(result.ok);
    assert.equal(result.root, outside);
    assert.equal(result.pilotDir, path.join(outside, PRIVATE_LAYOUT.pilot));
    assert.equal(result.evalDir, path.join(outside, PRIVATE_LAYOUT.evals));
    assert.equal(result.pilotDir, path.join(outside, "pilot"));
    assert.equal(result.evalDir, path.join(outside, "evals"));
  });

  it("refuses a missing or blank variable, naming it", () => {
    const { repo } = setup();
    for (const value of [undefined, "", "   "]) {
      const result = resolvePrivateDataDir(value, { topLevel: repo });
      assert.ok(!result.ok);
      assert.equal(result.code, "unset");
      assert.match(result.message, new RegExp(PRIVATE_DATA_ENV, "u"));
    }
  });

  it("refuses a folder that does not exist", () => {
    const { base, repo } = setup();
    const result = resolvePrivateDataDir(path.join(base, "nope"), { topLevel: repo });
    assert.ok(!result.ok);
    assert.equal(result.code, "missing");
    assert.match(result.message, /does not exist/u);
  });

  it("refuses a file instead of a folder", () => {
    const { base, repo } = setup();
    const file = path.join(base, "file.json");
    writeFileSync(file, "{}");
    const result = resolvePrivateDataDir(file, { topLevel: repo });
    assert.ok(!result.ok);
    assert.equal(result.code, "not_directory");
  });

  it("refuses the working tree itself and any folder inside it, saying why", () => {
    const { repo } = setup();
    for (const dir of [repo, path.join(repo, "data")]) {
      const result = resolvePrivateDataDir(dir, { topLevel: repo });
      assert.ok(!result.ok);
      assert.equal(result.code, "inside_repo");
      assert.match(result.message, /inside the git working tree/u);
      assert.match(result.message, /outside/u);
    }
  });

  it("refuses a symlink outside the tree that resolves inside it", () => {
    const { base, repo } = setup();
    const link = path.join(base, "link");
    symlinkSync(path.join(repo, "data"), link);
    const result = resolvePrivateDataDir(link, { topLevel: repo });
    assert.ok(!result.ok);
    assert.equal(result.code, "inside_repo");
  });

  it("accepts a symlink inside the tree only by where it resolves", () => {
    const { outside, repo } = setup();
    const link = path.join(repo, "private-link");
    symlinkSync(outside, link);
    const result = resolvePrivateDataDir(link, { topLevel: repo });
    assert.ok(result.ok);
    assert.equal(result.root, outside);
  });

  it("does not mistake a sibling whose name starts with the repo's for inside", () => {
    const { base, repo } = setup();
    const sibling = path.join(base, "repo-private");
    mkdirSync(sibling);
    assert.ok(resolvePrivateDataDir(sibling, { topLevel: repo }).ok);
  });

  it("resolves a relative path against cwd", () => {
    const { base, repo } = setup();
    const result = resolvePrivateDataDir("private", { cwd: base, topLevel: repo });
    assert.ok(result.ok);
    assert.equal(result.root, path.join(base, "private"));
  });

  it("refuses when the working tree cannot be determined", () => {
    const { outside } = setup();
    const result = resolvePrivateDataDir(outside, { topLevel: null });
    assert.ok(!result.ok);
    assert.equal(result.code, "no_repo");
  });
});

describe("privateDataDir", () => {
  it("reads the variable and git's top level of this checkout", () => {
    const top = gitTopLevel(process.cwd());
    assert.ok(top);
    const inside = privateDataDir({ [PRIVATE_DATA_ENV]: path.join(top, "data") });
    assert.ok(!inside.ok);
    assert.equal(inside.code, "inside_repo");
    const { outside } = setup();
    assert.ok(privateDataDir({ [PRIVATE_DATA_ENV]: outside }).ok);
    const unset = privateDataDir({});
    assert.ok(!unset.ok);
    assert.equal(unset.code, "unset");
  });

  it("finds no top level outside a git checkout", () => {
    const { outside } = setup();
    assert.equal(gitTopLevel(outside), null);
  });
});

describe("missingPrivateFiles", () => {
  it("names each file absent from the private folder, with the template to copy", () => {
    const { outside } = setup();
    writeFileSync(path.join(outside, "a.json"), "[]");
    assert.equal(missingPrivateFiles(outside, ["a.json"], "data/pilot"), null);
    const message = missingPrivateFiles(outside, ["a.json", "b.json"], "data/pilot");
    assert.ok(message);
    assert.match(message, /b\.json/u);
    assert.doesNotMatch(message, /a\.json/u);
    assert.match(message, /data\/pilot/u);
  });
});
