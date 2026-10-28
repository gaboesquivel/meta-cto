import assert from "node:assert/strict";
import { test } from "vitest";

import { GET as getLlmsTxt } from "../app/llms.txt/route";
import { resolveSiteOrigin, resolveSiteOriginFromHeaderList } from "../lib/site-url";

const withoutPublicOrigin = <T>(run: () => T) => {
  const prior = process.env.NEXT_PUBLIC_APP_ORIGIN;
  delete process.env.NEXT_PUBLIC_APP_ORIGIN;
  try {
    return run();
  } finally {
    if (prior === undefined) delete process.env.NEXT_PUBLIC_APP_ORIGIN;
    else process.env.NEXT_PUBLIC_APP_ORIGIN = prior;
  }
};

test("resolveSiteOriginFromHeaderList uses host and forwarded proto", () => {
  withoutPublicOrigin(() => {
    const headerList = new Headers({
      host: "meta-cto.localhost",
      "x-forwarded-proto": "http",
    });
    assert.equal(resolveSiteOriginFromHeaderList(headerList), "http://meta-cto.localhost");
  });
});

test("resolveSiteOrigin uses request URL when Vercel x-forwarded-host is deployment id", () => {
  withoutPublicOrigin(() => {
    const request = new Request("https://meta-cto-two.vercel.app/llms.txt", {
      headers: {
        host: "meta-cto-two.vercel.app",
        "x-forwarded-host": "meta-1sxvffl0p-gaboesquivel.vercel.app",
        "x-forwarded-proto": "https",
      },
    });
    assert.equal(resolveSiteOrigin(request), "https://meta-cto-two.vercel.app");
  });
});

test("llms.txt lists agent URLs on the request origin", async () => {
  await withoutPublicOrigin(async () => {
    const request = new Request("https://meta-cto-two.vercel.app/llms.txt", {
      headers: {
        host: "meta-cto-two.vercel.app",
        "x-forwarded-host": "meta-1sxvffl0p-gaboesquivel.vercel.app",
        "x-forwarded-proto": "https",
      },
    });
    const response = getLlmsTxt(request);
    const body = await response.text();
    assert.match(body, /https:\/\/meta-cto-two\.vercel\.app\/api\/mcp/u);
    assert.doesNotMatch(body, /meta-1sxvffl0p-gaboesquivel\.vercel\.app/u);
  });
});
