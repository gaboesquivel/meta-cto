"use client";

import { Button } from "@/components/button";
import { Input } from "@/components/input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function OperatorAccessPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center gap-4 p-8">
      <h1 className="text-lg font-semibold tracking-tight">Operator access</h1>
      <p className="text-muted-foreground text-sm">
        Enter the deployment operator token to open the protected console.
      </p>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setLoading(true);
          setError(null);
          const response = await fetch("/api/operator/session", {
            body: JSON.stringify({ token }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          });
          setLoading(false);
          if (!response.ok) {
            const body = (await response.json()) as { message?: string };
            setError(body.message ?? "Access denied");
            return;
          }
          router.replace("/operator");
          router.refresh();
        }}
      >
        <Input
          autoComplete="off"
          placeholder="Operator token"
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <Button disabled={loading || token.length === 0} type="submit">
          {loading ? "Verifying…" : "Continue"}
        </Button>
      </form>
      <Link className="text-primary text-sm underline-offset-4 hover:underline" href="/">
        Back to Assistant
      </Link>
    </main>
  );
}
