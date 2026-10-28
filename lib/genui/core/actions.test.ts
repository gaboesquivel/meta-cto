import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { z } from "zod";

import { createActionRegistry, validateActionInvocation } from "./actions";

const registerFilter = (policy: { requiresApproval: boolean; requiresAuth: boolean }) => {
  const registry = createActionRegistry();
  registry.register({
    description: "Filter table",
    id: "filter-table",
    inputSchema: z.object({ column: z.string() }),
    kind: "filter",
    policy,
  });
  return registry;
};

describe("action registry", () => {
  it("rejects unknown actions", () => {
    const registry = createActionRegistry();
    const result = validateActionInvocation({
      invocation: { actionId: "missing", input: {} },
      registry,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "unknown_action");
  });

  it("validates registered action input", () => {
    const registry = registerFilter({
      requiresApproval: false,
      requiresAuth: false,
    });
    const result = validateActionInvocation({
      invocation: { actionId: "filter-table", input: { column: "name" } },
      registry,
    });
    assert.equal(result.ok, true);
  });

  it("does not let a caller turn off auth or approval", () => {
    const registry = registerFilter({
      requiresApproval: true,
      requiresAuth: true,
    });
    const bypass = validateActionInvocation({
      invocation: {
        actionId: "filter-table",
        input: { column: "name" },
        requiresApproval: false,
        requiresAuth: false,
      },
      principal: { approved: true, userId: "user-1" },
      registry,
    });
    assert.equal(bypass.ok, false);
    if (!bypass.ok) assert.equal(bypass.code, "invalid_invocation");

    const unauthenticated = validateActionInvocation({
      invocation: { actionId: "filter-table", input: { column: "name" } },
      principal: { approved: true, userId: null },
      registry,
    });
    assert.equal(unauthenticated.ok, false);
    if (!unauthenticated.ok) assert.equal(unauthenticated.code, "auth_required");

    const unapproved = validateActionInvocation({
      invocation: {
        actionId: "filter-table",
        input: { column: "name", requiresAuth: false },
      },
      principal: { approved: false, userId: "user-1" },
      registry,
    });
    assert.equal(unapproved.ok, false);
    if (!unapproved.ok) assert.equal(unapproved.code, "approval_required");

    const allowed = validateActionInvocation({
      invocation: { actionId: "filter-table", input: { column: "name" } },
      principal: { approved: true, userId: "user-1" },
      registry,
    });
    assert.equal(allowed.ok, true);
  });
});
