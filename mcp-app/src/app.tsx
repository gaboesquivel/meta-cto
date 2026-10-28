import { useApp, useHostStyleVariables } from "@modelcontextprotocol/ext-apps/react";
import type { CompositionEnvelope } from "@/lib/genui";
import { GenuiRenderer } from "@/lib/genui/react";
import { useMemo } from "react";

const parseEnvelope = (data: unknown): CompositionEnvelope | null => {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const { envelope } = record;
  if (!envelope || typeof envelope !== "object") return null;
  const e = envelope as CompositionEnvelope;
  if (!e.openuiText || !e.fallbackText) return null;
  return e;
};

export const App = () => {
  useHostStyleVariables();
  const { toolResult } = useApp();

  const envelope = useMemo(
    () => parseEnvelope(toolResult?.structuredContent),
    [toolResult?.structuredContent],
  );

  if (!envelope)
    return (
      <main className="p-4 text-sm">
        <p>
          Run <code>compose_ui</code> to render a GenUI preview here.
        </p>
      </main>
    );

  return (
    <main className="p-4">
      <GenuiRenderer envelope={envelope} />
    </main>
  );
};
