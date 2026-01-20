These HTML files are served verbatim via Cloudflare Workers.

Source of truth: edit here in git.
Deploy: sync to KV (do not inline into TS).

Publish pages:
  npx wrangler kv key put --remote --binding ANCHOR_KV "page:about" --path ./src/content/about.html
  npx wrangler kv key put --remote --binding ANCHOR_KV "page:faq" --path ./src/content/faq.html
  npx wrangler kv key put --remote --binding ANCHOR_KV "page:guide" --path ./src/content/guide.html
  npx wrangler kv key put --remote --binding ANCHOR_KV "page:proofs" --path ./src/content/proofs.html
  npx wrangler kv key put --remote --binding ANCHOR_KV "page:privacy" --path ./src/content/privacy.html


