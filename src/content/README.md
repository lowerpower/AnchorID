These HTML files are served verbatim via Cloudflare Workers.

Source of truth: edit here in git.
Deploy: sync to KV (do not inline into TS).

Check that production KV matches these files (run after any upload, and before
trusting a page that "looks wrong"):

  npm run pages:check

Each page carries a hard-coded "Last updated/modified" stamp and a JSON-LD
`dateModified`; bump them with the content, then re-upload. The sitemap's
`<lastmod>` entries are the same dates.

Publish pages:
  npx wrangler kv key put --remote --binding ANCHOR_KV "page:about" --path ./src/content/about.html
  npx wrangler kv key put --remote --binding ANCHOR_KV "page:faq" --path ./src/content/faq.html
  npx wrangler kv key put --remote --binding ANCHOR_KV "page:guide" --path ./src/content/guide.html
  npx wrangler kv key put --remote --binding ANCHOR_KV "page:proofs" --path ./src/content/proofs.html
  npx wrangler kv key put --remote --binding ANCHOR_KV "page:proofs-website" --path ./src/content/proofs-website.html
  npx wrangler kv key put --remote --binding ANCHOR_KV "page:proofs-dns" --path ./src/content/proofs-dns.html
  npx wrangler kv key put --remote --binding ANCHOR_KV "page:proofs-github" --path ./src/content/proofs-github.html
  npx wrangler kv key put --remote --binding ANCHOR_KV "page:proofs-social" --path ./src/content/proofs-social.html
  npx wrangler kv key put --remote --binding ANCHOR_KV "page:proofs-x" --path ./src/content/proofs-x.html
  npx wrangler kv key put --remote --binding ANCHOR_KV "page:privacy" --path ./src/content/privacy.html
  npx wrangler kv key put --remote --binding ANCHOR_KV "page:sitemap" --path ./src/content/sitemap.xml
  npx wrangler kv key put --remote --binding ANCHOR_KV "page:robots" --path ./src/content/robots.txt
  npx wrangler kv key put --remote --binding ANCHOR_KV "page:humans" --path ./src/content/humans.txt


