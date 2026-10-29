import type { FeatureRequestSummary, SearchInput } from "../contracts";
import { searchInputSchema } from "../contracts";
import type { ServiceContext } from "./context";
import { embedOrUnavailable, parseInput } from "./context";
import { withholdBlindNeeds } from "./blind-detail";
import { summarize } from "./views";

const DEFAULT_LIMIT = 20;

const fetchPage = async (context: ServiceContext, input: SearchInput, take: number) => {
  const offset = input.cursor ?? 0;
  if (!input.q) {
    return await context.repo.listFeatureRequests({
      limit: take,
      offset,
      workspaceId: context.workspaceId,
    });
  }
  const embedding = await embedOrUnavailable(context, input.q);
  const rows = await context.repo.nearestFeatureRequests({
    embedding,
    limit: offset + take,
    workspaceId: context.workspaceId,
  });
  return rows.slice(offset);
};

/** Semantic search when `q` is given, otherwise newest first; the cursor is an offset. */
export const runSearch = async (
  context: ServiceContext,
  raw: SearchInput,
): Promise<{ items: FeatureRequestSummary[]; nextCursor: number | null }> => {
  const input = parseInput(searchInputSchema, raw);
  const limit = input.limit ?? DEFAULT_LIMIT;
  const rows = await fetchPage(context, input, limit + 1);
  const page = rows.slice(0, limit);
  return {
    items: await withholdBlindNeeds(context, page, await summarize(context, page)),
    nextCursor: rows.length > limit ? (input.cursor ?? 0) + limit : null,
  };
};
