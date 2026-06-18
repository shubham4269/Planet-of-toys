# Memberships module (scaffold)

No implementation yet. When built, this module owns its own:

- `membership.model.js`     – Mongoose schema
- `membership.service.js`   – business logic
- `membership.controller.js` – request/response shaping
- `membership.routes.js`    – Express router (mounted from `index.js` via `shared/constants/routerMounts.js`)
- `membership.validation.js` – input validation

Keep all memberships-domain logic inside this folder; depend on other modules only
through their exported service functions, and on integrations only through the
`integrations/` layer.
