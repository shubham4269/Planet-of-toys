# Cloudflare integration (scaffold)

No Cloudflare service is wired yet. Product/media assets are currently stored on
local disk and served via the media module. When Cloudflare (R2 object storage,
Images, or CDN purge) is adopted, implement it here as:

- `client.js`   – Cloudflare API/S3-compatible client (credentials from System Settings → env)
- `service.js`  – upload/serve/purge helpers consumed by the media module

Keep all provider-specific logic in this folder.
