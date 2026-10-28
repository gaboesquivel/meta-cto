"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/button";
import { Input } from "@/components/input";
import type { FeatureRequestSummary } from "@/lib/signal/contracts";

import { callApi } from "./api";
import { ErrorNotice } from "./error-notice";
import type { ApiError } from "./view";

interface Page {
  items: FeatureRequestSummary[];
  nextCursor: number | null;
}

class ApiFailureError extends Error {
  readonly apiError: ApiError;
  constructor(apiError: ApiError) {
    super(apiError.message);
    this.name = "ApiFailureError";
    this.apiError = apiError;
  }
}

const PAGE_SIZE = 20;

const fetchPage = async (q: string, cursor: number | null): Promise<Page> => {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (q) params.set("q", q);
  if (cursor !== null) params.set("cursor", String(cursor));
  const result = await callApi<Page>(`/api/feature-requests?${params.toString()}`);
  if (!result.ok) throw new ApiFailureError(result.error);
  return result.data;
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

const RequestRow = ({ item }: { item: FeatureRequestSummary }) => (
  <li>
    <Link
      className="hover:bg-muted/60 focus-visible:ring-ring/50 flex flex-col gap-1.5 rounded-xl border p-4 transition-colors outline-none focus-visible:ring-3"
      href={`/requests/${encodeURIComponent(item.id)}`}
    >
      <span className="font-semibold text-balance">{item.title}</span>
      {item.underlyingNeed ? (
        <span className="text-muted-foreground line-clamp-2 text-sm">{item.underlyingNeed}</span>
      ) : null}
      <span className="text-muted-foreground flex gap-3 text-xs">
        <span>{plural(item.supportCount, "Support")}</span>
        <span aria-hidden>·</span>
        <span>{plural(item.accountCount, "Account")}</span>
      </span>
    </Link>
  </li>
);

/** Feature Requests with semantic search over the REST API. */
export const RequestList = () => {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const list = useInfiniteQuery({
    getNextPageParam: (page: Page) => page.nextCursor,
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => fetchPage(query, pageParam),
    queryKey: ["signal", "feature-requests", query],
    retry: 1,
  });

  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const error = list.error instanceof ApiFailureError ? list.error.apiError : null;

  return (
    <div className="flex flex-col gap-5">
      <search>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(input.trim());
          }}
        >
          <Input
            aria-label="Search Feature Requests by need"
            maxLength={200}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Search by need, e.g. shift trades not syncing"
            type="search"
            value={input}
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
      </search>
      <ErrorNotice error={error} />
      {list.isPending ? (
        <p className="text-muted-foreground text-sm">Loading Feature Requests…</p>
      ) : null}
      {!list.isPending && items.length === 0 && !error ? (
        <p className="text-muted-foreground text-sm">No Feature Requests found.</p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <RequestRow item={item} key={item.id} />
        ))}
      </ul>
      {list.hasNextPage ? (
        <Button
          className="self-center"
          disabled={list.isFetchingNextPage}
          onClick={() => list.fetchNextPage()}
          variant="ghost"
        >
          {list.isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      ) : null}
    </div>
  );
};
