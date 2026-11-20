# Anti-blokir front door

Lean Cloudflare Pages site (`koleksidrpinguin.pages.dev`) that lists the latest videos from the public RSS feed at https://koleksidrpinguin.com/rss.xml.

- No new Worker env vars, no KV writes, no paid domain.
- Pages are `noindex, follow` and canonical to koleksidrpinguin.com.
- Share cards live at `/v/<id>`.
- Thumbnails are proxied from the origin through `/media/<id>.jpg` so the list still loads when the main domain is blocked for the visitor.

Deploy is done with the Cloudflare API (Pages Direct Upload). This folder is not part of the main `koleksi-dr-pinguinn` Worker.
