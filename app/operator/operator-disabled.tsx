import Link from "next/link";

export const OperatorDisabled = () => (
  <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-4 p-8">
    <h1 className="text-lg font-semibold tracking-tight">Operator unavailable</h1>
    <p className="text-muted-foreground text-sm">
      Protected Operator surfaces are disabled until{" "}
      <code className="text-foreground">OPERATOR_SECRET</code> is configured (minimum 16
      characters). This deployment fails closed.
    </p>
    <Link className="text-primary text-sm underline-offset-4 hover:underline" href="/">
      Return to Assistant
    </Link>
  </main>
);
