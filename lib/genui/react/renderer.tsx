"use client";

import { Renderer } from "@openuidev/react-lang";

import { validateCompositionEnvelope } from "../contract/compiler";
import type { CompositionEnvelope } from "../core/envelope";
import { flowGenuiReactLibrary } from "./library";
import { GenuiRecordContext } from "./record-context";

export const GenuiRenderer = ({
  complete = true,
  envelope,
  isStreaming = false,
}: {
  complete?: boolean;
  envelope: CompositionEnvelope;
  isStreaming?: boolean;
}) => {
  const validated = validateCompositionEnvelope({ envelope });
  if (!validated.ok)
    return <p role="alert">{envelope.fallbackText || "This composition could not be shown."}</p>;

  return (
    <GenuiRecordContext.Provider value={envelope.records}>
      <Renderer
        isStreaming={isStreaming || !complete}
        library={flowGenuiReactLibrary}
        onError={(errors) => {
          if (errors.length > 0) console.warn("OpenUI parse errors", errors);
        }}
        response={envelope.openuiText}
      />
    </GenuiRecordContext.Provider>
  );
};
