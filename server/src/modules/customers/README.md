# Customers module (scaffold)

No implementation yet. When built, this module owns its own:

- `customer.model.js`     – Mongoose schema
- `customer.service.js`   – business logic
- `customer.controller.js` – request/response shaping
- `customer.routes.js`    – Express router (mounted from `index.js` via `shared/constants/routerMounts.js`)
- `customer.validation.js` – input validation

Keep all customers-domain logic inside this folder; depend on other modules only
through their exported service functions, and on integrations only through the
`integrations/` layer.
