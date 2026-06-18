# Email integration (scaffold)

No email provider is wired yet. When transactional email is added (order
confirmations, shipping updates, password reset, etc.), implement it here as:

- `client.js`     – provider SDK/transport setup (credentials from System Settings → env)
- `service.js`    – high-level send functions consumed by feature modules
- `templates/`    – message templates

Keep all provider-specific logic in this folder; feature modules should depend
only on the exported service functions.
