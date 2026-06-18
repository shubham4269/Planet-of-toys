# Coupons module (scaffold)

No implementation yet. When built, this module owns its own:

- `coupon.model.js`     – Mongoose schema
- `coupon.service.js`   – business logic
- `coupon.controller.js` – request/response shaping
- `coupon.routes.js`    – Express router (mounted from `index.js` via `shared/constants/routerMounts.js`)
- `coupon.validation.js` – input validation

Keep all coupons-domain logic inside this folder; depend on other modules only
through their exported service functions, and on integrations only through the
`integrations/` layer.
