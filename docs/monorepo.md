# TECHZONE monorepo

The repository uses npm workspaces and Turborepo. Public HTTP routes, database
names, event names, and event envelope `schemaVersion: 1` remain stable.

## Ownership

- `apps/storefront`: customer Next.js SSR app and Capacitor static source.
- `apps/admin`: administrator Next.js app served with `basePath=/admin`.
- `apps/api-gateway`: public API gateway.
- `apps/services/*`: one independently deployable NestJS domain service.
- `packages/contracts`: the single source of truth for HTTP DTOs, OpenAPI, and
  event envelopes.
- `packages/database`: connection and transaction primitives only.
- `packages/messaging`: outbox, inbox, retry, and DLQ primitives.
- `infra`: Docker, Kubernetes, PostgreSQL, and observability deployment assets.
- `tools`: code generation, migrations, Kubernetes rendering, and boundary
  validation.
- `tests`: contract, integration, security, E2E, and resilience suites.

An application may import a package. A package may import another package. An
application must never import another application's source or its persistence
schema. `npm run lint` enforces these boundaries.

## Commands

```sh
npm ci
npm run typecheck
npm run build
npm run test:unit
npm run test:contract
npm run ms:up
```

Migrations are adoptable baselines. Each service owns `drizzle/`, while the
shared reliability fragment is installed from
`packages/messaging/migrations/0000_reliability.sql`. Seeds run only through an
explicit development or test command.
