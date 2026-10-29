import { describe, expect, it } from "vitest";

import { SignalError } from "@/lib/signal/contracts";

import { toErrorResponse } from "./index";

const errorWith = (details: unknown) =>
  new SignalError({
    code: "invalid_input",
    details,
    message: "The request is invalid.",
    resolution: "Fix it.",
    status: 400,
  });

const bodyOf = async (details: unknown) => {
  const response = await toErrorResponse(errorWith(details));
  return (await response.json()) as Record<string, unknown>;
};

describe("toErrorResponse", () => {
  it("puts array details (zod issues) under issues instead of spreading indexes", async () => {
    const issues = [{ code: "too_small", message: "Too short", path: ["title"] }];
    const body = await bodyOf(issues);
    expect(body.issues).toEqual(issues);
    expect(body).not.toHaveProperty("0");
    expect(body.code).toBe("invalid_input");
  });

  it("spreads object details into the body", async () => {
    const body = await bodyOf({ existing: { id: "s1" } });
    expect(body.existing).toEqual({ id: "s1" });
  });

  it("drops string details", async () => {
    const body = await bodyOf("secret internals");
    expect(body).not.toHaveProperty("0");
    expect(JSON.stringify(body)).not.toContain("secret internals");
  });
});
