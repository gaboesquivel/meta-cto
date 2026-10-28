"use client";

import type { CompositionEnvelope } from "@/lib/genui";
import { consumeNdjsonResponse } from "@/lib/genui";
import { GenuiRenderer } from "@/lib/genui/react";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { ScrollArea } from "@/components/scroll-area";
import { Textarea } from "@/components/textarea";
import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import { useCallback, useRef, useState } from "react";

const starters = [
  "Generate a customer support dashboard",
  "Create a pricing comparison for two plans",
  "Design an onboarding form for new users",
  "Show revenue metrics dashboard",
  "Compare orbit and nova plans",
];

interface ChatMessage {
  content: string;
  role: "assistant" | "user";
}

export const StudioClient = () => {
  const [queryParam, setQueryParam] = useQueryState("q", parseAsString.withDefault(""));
  const [landingDraft, setLandingDraft] = useState<string | null>(null);
  const landingInput = landingDraft ?? queryParam;
  const [refineInput, setRefineInput] = useState("");
  const [envelope, setEnvelope] = useState<CompositionEnvelope | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const generationRef = useRef(0);
  const latestRequestIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const resetComposition = useCallback(async () => {
    abortRef.current?.abort();
    setEnvelope(null);
    setMessages([]);
    setError(null);
    setLandingDraft(null);
    setRefineInput("");
    await setQueryParam(null);
  }, [setQueryParam]);

  const runCompose = useCallback(
    async (text: string, mode: "create" | "refine" = "create") => {
      const query = text.trim();
      if (!query) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      generationRef.current += 1;
      const clientRequestId = `studio-${generationRef.current}`;
      latestRequestIdRef.current = clientRequestId;
      const priorEnvelope = mode === "refine" ? envelope : null;
      const priorMessages = mode === "refine" ? messages : [];
      setError(null);
      setLoading(true);
      setMessages((prev) => [...prev, { content: query, role: "user" }]);

      const streamState = {
        latest: null as CompositionEnvelope | null,
        message: null as string | null,
        outcome: "success" as "failed" | "success",
      };

      try {
        const response = await fetch("/api/genui/compose", {
          body: JSON.stringify({
            clientRequestId,
            mode,
            priorEnvelope: priorEnvelope ?? undefined,
            query,
            turns: [...priorMessages, { content: query, role: "user" as const }].map((message) => ({
              content: message.content,
              role: message.role,
            })),
            version: 1,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
          signal: controller.signal,
        });

        const result = await consumeNdjsonResponse({
          onEvent: (event) => {
            if (event.requestId !== clientRequestId) return;
            if (event.type === "error") streamState.message = event.message;
            if (event.type === "partial") streamState.latest = event.envelope;
            if (event.type === "complete") {
              streamState.latest = event.envelope;
              if (event.metadata?.outcome === "failed") streamState.outcome = "failed";
            }
          },
          response,
        });

        if (latestRequestIdRef.current !== clientRequestId) return;

        if (!result.ok && result.reason !== "aborted") setError(`Stream error: ${result.reason}`);
        else if (streamState.message) setError(streamState.message);
        else if (streamState.latest) {
          const composed = streamState.latest;
          if (streamState.outcome === "failed") {
            setError(composed.fallbackText);
            setEnvelope(composed);
          } else {
            setEnvelope(composed);
            setMessages((prev) => [...prev, { content: composed.fallbackText, role: "assistant" }]);
          }
        } else setError("No composition returned.");
        setLoading(false);
      } catch (error_) {
        if (latestRequestIdRef.current !== clientRequestId) return;
        const aborted =
          controller.signal.aborted ||
          (error_ instanceof DOMException && error_.name === "AbortError");
        if (!aborted) setError("Could not reach compose service.");
        setLoading(false);
      }
    },
    [envelope, messages],
  );

  const submit = async (text: string, mode: "create" | "refine" = "create") => {
    const query = text.trim();
    if (!query) return;
    setLandingDraft(null);
    setRefineInput("");
    await setQueryParam(query);
    await runCompose(query, mode);
  };

  const showLanding = !envelope && !loading && messages.length === 0;

  return (
    <main className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="flex w-full flex-col border-b lg:w-80 lg:border-r lg:border-b-0">
        <div className="border-b p-4">
          <p className="text-sm font-medium">Chat</p>
          <p className="text-muted-foreground text-xs">
            Refine the generated UI with follow-up prompts.
          </p>
        </div>
        <ScrollArea className="min-h-48 flex-1 p-4">
          <ul className="space-y-3 text-sm">
            {messages.map((message, index) => (
              <li
                key={`${message.role}-${index}`}
                className={message.role === "user" ? "text-foreground" : "text-muted-foreground"}
              >
                <span className="font-medium capitalize">{message.role}: </span>
                {message.content}
              </li>
            ))}
            {loading ? <li className="text-muted-foreground text-xs">Generating…</li> : null}
          </ul>
        </ScrollArea>
        <form
          className="flex gap-2 border-t p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(refineInput, "refine");
          }}
        >
          <Textarea
            className="min-h-10 resize-none"
            onChange={(event) => setRefineInput(event.target.value)}
            placeholder="Ask for changes…"
            rows={2}
            value={refineInput}
          />
          <Button disabled={loading || !refineInput.trim()} type="submit">
            Send
          </Button>
        </form>
      </aside>

      <section className="flex flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Studio</h1>
            <p className="text-muted-foreground text-sm">
              Agentic UI generation with OpenUI Lang and the Porcelain theme.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {envelope || messages.length > 0 ? (
              <Button
                onClick={() => {
                  void resetComposition();
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                New composition
              </Button>
            ) : null}
            <Link className="text-primary text-sm underline-offset-4 hover:underline" href="/">
              Home
            </Link>
            <Link className="text-primary text-sm underline-offset-4 hover:underline" href="/dev">
              MCP &amp; API
            </Link>
          </div>
        </header>

        {showLanding ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
            <div className="w-full max-w-xl space-y-3 text-center">
              <h2 className="text-2xl font-semibold tracking-tight">What should we build?</h2>
              <p className="text-muted-foreground text-sm">
                Describe a screen, dashboard, or flow. Sample data is synthetic.
              </p>
            </div>
            <form
              className="flex w-full max-w-xl gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void submit(landingInput);
              }}
            >
              <Input
                className="h-11"
                onChange={(event) => setLandingDraft(event.target.value)}
                placeholder="Generate a customer support dashboard…"
                value={landingInput}
              />
              <Button className="h-11" disabled={loading} type="submit">
                Generate
              </Button>
            </form>
            <ul className="flex max-w-xl flex-wrap justify-center gap-2">
              {starters.map((starter) => (
                <li key={starter}>
                  <Button
                    onClick={() => {
                      void submit(starter);
                    }}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    {starter}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex-1 space-y-4 p-4 md:p-6">
            {error ? (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            ) : null}
            {envelope ? <GenuiRenderer envelope={envelope} /> : null}
            {!envelope && loading ? (
              <p className="text-muted-foreground text-sm">Composing…</p>
            ) : null}
          </div>
        )}
      </section>
    </main>
  );
};
