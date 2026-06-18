# Planet of Toys — Architecture

A single monorepo, single backend, single database. No microservices.

```
planet-of-toys/
├── apps/
│   ├── client/            # storefront SPA  → www.planetoftoys.in   (@planet-of-toys/client)
│   └── admin/             # admin SPA       → admin.planetoftoys.in (@planet-of-toys/admin)
├── packages/
│   └── shared-web/        # @planet-of-toys/shared-web — apiClient + format, consumed by both apps
├── server/                # Express API (@planet-of-toys/server)
│   └── src/
│       ├── modules/       # MODULE-FIRST: each owns model · service · controller · routes (+ tests)
│       │   ├── products/  orders/  payments/  shipping/
│       │   ├── auth/      media/   settings/  webhooks/
│       │   └── customers/ coupons/ memberships/ analytics/   (scaffolds — no code yet)
│       ├── integrations/  # external providers, isolated from business logic
│       │   ├── razorpay/  shiprocket/  whatsapp/
│       │   └── email/  cloudflare/                            (scaffolds — no code yet)
│       ├── shared/        # config · middleware · constants · utils · errors
│       ├── models/        # Mongoose model registry (re-exports each module's model)
│       ├── app.js         # createApp() — application factory
│       └── index.js       # composition root (wires routers from modules → mount paths)
└── deploy/                # nginx (two vhosts, one backend)
```

## Conventions

- **Backend is module-first.** A feature lives entirely inside `modules/<name>/`:
  its Mongoose model, service (business logic), controller (request/response
  shaping), router, and co-located tests. Modules depend on each other only
  through exported service functions, and on third parties only through the
  `integrations/` layer.
- **Integrations are isolated.** All provider-specific code (HTTP clients,
  auth tokens, webhook verification, templates) lives in `integrations/<name>/`.
  Modules never talk to a provider SDK directly.
- **`shared/`** holds cross-cutting infrastructure only: configuration/env,
  Express middleware, the `AppError` model + helpers (`shared/errors`), generic
  constants (`shared/constants`, e.g. router mount paths), and utilities
  (`shared/utils`, e.g. the atomic counter used for order numbering).
- **`models/index.js`** is a thin registry. Models physically live in their
  modules; the registry re-exports them so cross-cutting consumers (and tests)
  have one import and every model is registered with Mongoose.
- **Frontend is two independent apps** consuming the same backend API. Shared
  client code (`apiClient`, `format`) lives in `@planet-of-toys/shared-web` and
  is imported via subpaths (`@planet-of-toys/shared-web/apiClient`,
  `.../format`). App-specific concerns stay in their app: Meta Pixel + UTM in
  `apps/client`, admin auth/session in `apps/admin`.

## Scripts (run from the repo root)

| Command | Effect |
|---|---|
| `npm run dev` | storefront + server in watch mode |
| `npm run dev:admin` | admin app dev server (port 5174) |
| `npm run build` | build every app workspace |
| `npm test` | run every workspace's test suite |
| `npm run test:server` / `:client` / `:admin` / `:shared` | run one workspace |

## Notes

- The admin SPA keeps its internal `/admin/*` route prefix; only the
  application boundary changed (it is no longer bundled with the storefront).
- Media uploads are still stored on local disk at `server/media` (served by the
  media module). Cloudflare R2/Images is scaffolded for a future migration.
