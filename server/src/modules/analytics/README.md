# Analytics module (scaffold)

No implementation yet. When built, this module owns its own:

- `analytic.model.js`     – Mongoose schema
- `analytic.service.js`   – business logic
- `analytic.controller.js` – request/response shaping
- `analytic.routes.js`    – Express router (mounted from `index.js` via `shared/constants/routerMounts.js`)
- `analytic.validation.js` – input validation

Keep all analytics-domain logic inside this folder; depend on other modules only
through their exported service functions, and on integrations only through the
`integrations/` layer.
