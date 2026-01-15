/**
 * AnchorID Worker v1: minimal homepage + UUID resolver.
 */

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Route: homepage
    if (path === "/" || path === "/index.html") {
      return new Response(
        `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>AnchorID</title>
</head>
<body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; line-height: 1.45;">
  <h1>AnchorID</h1>
  <p>Canonical UUID identity anchors and resolvers.</p>
  <p>Try: <code>/resolve/&lt;uuid&gt;</code></p>
</body>
</html>`,
        {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "x-content-type-options": "nosniff",
            "referrer-policy": "no-referrer",
          },
        }
      );
    }

    // Route: resolver (v1)
    // Expected: /resolve/<uuid>
    if (path.startsWith("/resolve/")) {
      const uuid = path.slice("/resolve/".length).trim();

      // minimal UUID v4-ish check (keeps logs cleaner)
      const uuidRe =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      if (!uuidRe.test(uuid)) {
        return json({ error: "invalid_uuid" }, 400, { "cache-control": "no-store" });
      }

      // TODO: replace this lookup with DB later.
      // For now, we only resolve the founder UUID.
      const founderUuid = "4ff7ed97-b78f-4ae6-9011-5af714ee241c";

      if (uuid.toLowerCase() !== founderUuid) {
        return json({ error: "not_found" }, 404, {
          "cache-control": "public, max-age=60, s-maxage=300",
        });
      }

      const body = {
        "@context": "https://schema.org",
        "@type": "Person",
        "@id": `https://anchorid.net/resolve/${founderUuid}`,
        identifier: {
          "@type": "PropertyValue",
          propertyID: "canonical-uuid",
          value: `urn:uuid:${founderUuid}`,
        },
        name: "Mycal",
        alternateName: ["Mike Johnson", "マイカル"],
        url: "https://blog.mycal.net/about/",
        sameAs: ["https://github.com/lowerpower", "https://blog.mycal.net/"],
        dateCreated: "2026-01-13T00:00:00Z",
        dateModified: "2026-01-13T00:00:00Z",
//        dateModified: new Date().toISOString(),
      };

      // Strong caching: public resolver can be cached at edge
      return json(body, 200, {
        "cache-control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      });
    }

    return new Response("Not Found", { status: 404 });
  },
};

function json(obj: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  const text = JSON.stringify(obj, null, 2);
  const etag = `W/"${text.length}-${status}"`;

  return new Response(text, {
    status,
    headers: {
      "content-type": "application/ld+json; charset=utf-8",
      etag,
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      ...extraHeaders,
    },
  });
}
