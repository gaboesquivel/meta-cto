import { z } from "zod";

/** Privileged actions never deserialized from model output — registered by the host app. */
export const registeredActionKinds = [
  "navigate",
  "ui-state",
  "filter",
  "sort",
  "submit-form",
  "agent-follow-up",
  "server-tool",
] as const;

export type RegisteredActionKind = (typeof registeredActionKinds)[number];

export interface ActionSecurityPolicy {
  requiresApproval: boolean;
  requiresAuth: boolean;
}

/** Untrusted invocation. Security flags are not accepted from the caller. */
export const actionInvocationSchema = z.strictObject({
  actionId: z.string().min(1),
  input: z.record(z.string(), z.unknown()).default({}),
});

export type ActionInvocation = z.infer<typeof actionInvocationSchema>;

export interface ActionPrincipal {
  approved?: boolean;
  userId: string | null;
}

export interface RegisteredAction {
  description: string;
  id: string;
  inputSchema: z.ZodType;
  kind: RegisteredActionKind;
  policy: ActionSecurityPolicy;
}

export type ActionExecutor = (input: {
  action: RegisteredAction;
  invocation: ActionInvocation;
  principal: ActionPrincipal;
}) => Promise<{ ok: true } | { code: string; ok: false }>;

const policyReady = (policy: ActionSecurityPolicy | undefined) =>
  typeof policy?.requiresAuth === "boolean" && typeof policy.requiresApproval === "boolean";

export const createActionRegistry = () => {
  const actions = new Map<string, RegisteredAction>();
  return {
    get: (id: string) => actions.get(id),
    list: () => [...actions.values()],
    register: (action: RegisteredAction) => {
      if (!policyReady(action.policy)) throw new Error(`missing-action-policy:${action.id}`);
      if (actions.has(action.id)) throw new Error(`duplicate-action:${action.id}`);
      actions.set(action.id, action);
    },
  };
};

export const validateActionInvocation = ({
  invocation,
  principal = { userId: null },
  registry,
}: {
  invocation: unknown;
  principal?: ActionPrincipal;
  registry: ReturnType<typeof createActionRegistry>;
}) => {
  const parsed = actionInvocationSchema.safeParse(invocation);
  if (!parsed.success) return { code: "invalid_invocation", ok: false as const };
  const action = registry.get(parsed.data.actionId);
  if (!action) return { code: "unknown_action", ok: false as const };
  const input = action.inputSchema.safeParse(parsed.data.input);
  if (!input.success) return { code: "invalid_action_input", ok: false as const };
  if (action.policy.requiresAuth && !principal.userId)
    return { code: "auth_required", ok: false as const };
  if (action.policy.requiresApproval && principal.approved !== true)
    return { code: "approval_required", ok: false as const };
  return {
    action,
    input: input.data,
    invocation: parsed.data,
    ok: true as const,
  };
};
