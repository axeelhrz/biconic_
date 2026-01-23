# Copilot instructions for this repo

Use these repo-specific notes to align with existing patterns. Keep suggestions concrete and pragmatic for this codebase.

## Stack and layout

- Next.js App Router (React 19), Tailwind + shadcn/ui, Supabase Auth via cookies (SSR-safe).
- Key dirs:
  - `app/` UI pages and API handlers. API routes respond with `{ ok: boolean, ... }` and Spanish messages.
  - `lib/supabase/`: `client.ts` (browser), `server.ts` (server/RSC), `middleware.ts` (cookie/session sync + routing).
  - `hooks/`: custom hooks like `useUserRole` reading `profiles.role`.
  - `components/`: UI composed with shadcn/ui; use `cn` from `lib/utils.ts`.
- Path alias: `@/*` (see `tsconfig.json`).

## Supabase auth and clients (critical)

- Create a new client per usage; never a global singleton.
  - Client components: `import { createClient } from '@/lib/supabase/client'`.
  - Server/route handlers: `const supabase = await (await import('@/lib/supabase/server')).createClient()`.
- Middleware is centralized in `lib/supabase/middleware.ts` and invoked from `middleware.ts`:
  - Refreshes cookies with Supabase on every request.
  - Role-aware routing: authenticated admins are kept under `/admin`; non-admins are redirected away from `/admin`. Visiting `/` or `/auth/login` redirects to a role-appropriate home (`/admin` or `/dashboard`).
  - When redirecting, copy cookies from the Supabase response to the redirect (prefer `response.cookies.setAll(...)`, else loop through `getAll()`).
- Do not run code between `createServerClient(...)` and `supabase.auth.getClaims()`; it can cause random logouts.

## API route conventions

- Always authorize first: `const { data: { user } } = await supabase.auth.getUser()`; otherwise return 401 `{ ok: false, error: 'No autorizado' }`.
- Fetch DB credentials by `connectionId` from Supabase table `conections` (intentional spelling) and scope by `user.id`.
- SQL safety and dialect specifics:
  - Postgres: `$1..$n`, case-insensitive match via `ILIKE`, quote identifiers as `"col"`.
  - MySQL: `?` placeholders, `LIKE`, quote identifiers as `` `col` ``.
  - Accept `schema.table` with default schema `public`.
  - Dialect autodetect by `port`; Postgres supports optional `ssl`.
- Response shape is consistent: success `{ ok: true, ... }`; failure `{ ok: false, error: '... (español)' }`.
- Examples to mirror:
  - Filtering/pagination: `app/api/connection/query/route.ts` (bounds: `limit` [1..1000], `offset >= 0`).
  - Metadata introspection: `app/api/connection/metadata/route.ts`.
  - Derived columns via arithmetic: `app/api/connection/arithmetic-query/route.ts`.

## UI and config

- Tailwind + shadcn/ui; compose classes via `cn()` from `lib/utils.ts`.
- Remote images must be whitelisted in `next.config.ts` (GitHub, Google, Unsplash, Gravatar domains are allowed).

## Env and workflows

- Required envs: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY` (note the exact name). Middleware skips checks if missing via `hasEnvVars` in `lib/utils.ts`.
- Scripts (pnpm preferred): dev `pnpm dev` (Turbopack), build `pnpm build`, start `pnpm start`, lint `pnpm lint`.
- ESLint is ignored during production builds (`next.config.ts: eslint.ignoreDuringBuilds = true`); fix lint locally when possible.

## When adding a new API handler

- Validate the JSON body; require `table`. Bound `limit` to [1..1000] and ensure `offset >= 0`.
- Authorize with Supabase, load connection by `connectionId`, parameterize SQL (no string interpolation), and follow the response shape above.
- Keep error messages in Spanish to match the UI.

## Gotchas

- Always copy Supabase cookies on redirects (see `lib/supabase/middleware.ts`).
- Respect `@/*` imports and the client/server split in `lib/supabase`.
- Import the generated `Database` type from `lib/supabase/supabase.types.ts` when typing Supabase clients.
