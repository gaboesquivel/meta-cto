/** Signal (spec 001) public MCP tool names and descriptions, shared by registration and the catalog. */

export const signalMcpToolNames = [
  "check_feature_request",
  "create_feature_request",
  "support_feature_request",
  "comment_on_feature_request",
  "search_feature_requests",
  "get_feature_request",
] as const;

export const signalToolDescriptions = {
  check_feature_request:
    "Check a draft feature request against existing ones. Always call this before create_feature_request. Returns a checkId (valid 30 minutes), the draft's underlying need, candidates with verdicts (same_need, related_need, unknown) and a nextAction. On a same_need candidate, prefer support_feature_request or comment_on_feature_request over creating a duplicate.",
  comment_on_feature_request:
    "Add a comment to an existing feature request by id, for example extra context when check_feature_request returned a same_need candidate.",
  create_feature_request:
    "Create a new feature request. Call check_feature_request first with the same draft and pass its checkId; without it the call fails with check_required. If the check returned a same_need candidate, prefer support_feature_request or comment_on_feature_request; creating anyway requires a skipReason explaining why the need differs.",
  get_feature_request:
    "Get one feature request by id with its underlying need, supports by account, comments and related links.",
  search_feature_requests:
    "Search or list feature requests (q is semantic) with support and account counts. To decide whether to create a new request, use check_feature_request instead.",
  support_feature_request:
    "Add a customer account's support to an existing feature request by id. Preferred over creating when check_feature_request returned a same_need candidate; pass its checkId. Returns the feature request to cite to the customer.",
} as const satisfies Record<(typeof signalMcpToolNames)[number], string>;
