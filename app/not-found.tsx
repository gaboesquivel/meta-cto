import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg space-y-4 p-8">
      <h1 className="font-heading text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">
        That page is not part of this app. Agents can read <Link href="/llms.txt">llms.txt</Link>{" "}
        for instructions.
      </p>
      <Link className="text-primary underline" href="/">
        Back to home
      </Link>
    </div>
  );
}
