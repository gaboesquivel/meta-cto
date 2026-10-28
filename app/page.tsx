import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 p-8">
      <h1 className="text-lg font-semibold tracking-tight">Home</h1>
      <Link className="text-primary text-sm underline-offset-4 hover:underline" href="/genui">
        GenUI playground
      </Link>
    </main>
  );
}
