export const wantsMarkdown = (acceptHeader: string | null) =>
  (acceptHeader ?? "").toLowerCase().includes("text/markdown");

export const markdownResponse = (body: string, status = 200) =>
  new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Vary: "Accept",
    },
    status,
  });
