import type { SignalService } from "../contracts";
import { requireFeatureRequest, toContext } from "./context";
import type { SignalServiceDeps } from "./context";
import { runCheck } from "./check";
import { runCreate } from "./create";
import { runComment, runSupport } from "./engagement";
import { runMetrics, runSearch } from "./read";
import { buildDetail } from "./views";

export type { SignalServiceDeps } from "./context";
export { createReviewService } from "./review";
export type { ReviewServiceDeps } from "./review";

/** The Signal service behind REST, MCP and the UI; ports are injected so tests use fakes. */
export const createSignalService = (deps: SignalServiceDeps): SignalService => {
  const context = toContext(deps);
  return {
    check: async (input) => await runCheck(context, input),
    comment: async (id, input) => await runComment(context, id, input),
    create: async (input) => await runCreate(context, input),
    get: async (id) => await buildDetail(context, await requireFeatureRequest(context, id)),
    metrics: async () => await runMetrics(context),
    search: async (input) => await runSearch(context, input),
    support: async (id, input) => await runSupport(context, id, input),
  };
};
