import { resolveSiteOrigin } from "@/lib/site-url";

export const dynamic = "force-dynamic";

const publicRoutes = ["/", "/genui", "/dev"];

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

export const GET = (request: Request) => {
  const origin = resolveSiteOrigin(request);
  const lastmod = new Date().toISOString();
  const urls = publicRoutes
    .map((path) => {
      const loc = escapeXml(`${origin}${path}`);
      const priority = path === "/" ? "1.0" : "0.8";
      return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>`;
    })
    .join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
};
