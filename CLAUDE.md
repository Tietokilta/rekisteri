# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is "rekisteri", a membership registry application for Tietokilta. It manages user memberships, payments via Stripe, and authentication via email OTP.

**Tech Stack:**

- SvelteKit (Svelte 5) with adapter-node for production
- TypeScript
- PostgreSQL via Drizzle ORM
- Stripe for payments
- Mailgun for emails
- typesafe-i18n for i18n (Finnish & English)
- Tailwind CSS with shadcn-svelte components
- Playwright for e2e tests

## Development Commands

```bash
# Setup
pnpm install
cp .env.example .env
pnpm db:start       # Start PostgreSQL in Docker
pnpm db:push        # Push schema to database
pnpm db:seed        # Seed with test data

# Development
pnpm dev            # Start dev server
pnpm check          # Type-check
pnpm check:watch    # Type-check in watch mode
pnpm lint           # Run eslint and prettier checks
pnpm format         # Format code with prettier

# Testing
pnpm test           # Run e2e tests (Playwright)
pnpm test:e2e       # Same as above

# Database
pnpm db:reset       # Delete database volume
pnpm db:migrate     # Run migrations
pnpm db:studio      # Open Drizzle Studio

# Internationalization
pnpm typesafe-i18n  # Generate i18n types from translations

# Building
pnpm build          # Build for production
pnpm preview        # Preview production build
pnpm flake:build    # Build Docker image with Nix
```

**Test account:** Login with `root@tietokilta.fi` to access admin view.

## Architecture

### Authentication System

Custom session-based authentication (no external libraries):

- Email-only authentication with OTP codes (no passwords)
- Session tokens stored in cookies and hashed in database (`src/lib/server/auth/session.ts`)
- Sessions expire after 30 days, auto-renewed at 15 days
- Email OTP codes expire after 10 minutes
- Rate limiting implemented via `ExpiringTokenBucket` in `src/lib/server/auth/rate-limit.ts`
- Auth state injected via `hooks.server.ts` into `event.locals.user` and `event.locals.session`

### Database Schema (`src/lib/server/db/schema.ts`)

Core tables:

- `user`: User accounts with email, admin status, personal details, Stripe customer ID
- `session`: Active sessions linked to users
- `email_otp`: One-time password codes for email authentication
- `membership`: Membership types with Stripe price IDs, time ranges, and pricing
- `member`: Links users to memberships with status tracking

Member statuses: `awaiting_payment`, `awaiting_approval`, `active`, `expired`, `cancelled`

Database configuration in `drizzle.config.ts` uses snake_case for column names.

### Internationalization (i18n)

Uses typesafe-i18n for translations:

- Base locale: Finnish (`fi`)
- Supported locales: Finnish and English
- Translation files in `src/lib/i18n/{locale}/index.ts`
- Configuration in `.typesafe-i18n.json`
- URL pattern: `/{locale}/{path}` (e.g., `/fi/admin/members`, `/en/admin/members`)
- Locale detection in `src/lib/i18n/routing.ts` via `getLocaleFromPathname()`
- Middleware in `hooks.server.ts` handles locale detection and HTML lang attribute injection
- Client-side: Use reactive `$LL` store from `$lib/i18n/i18n-svelte` (e.g., `{$LL.user.welcome()}`)
- Server-side: Use `i18nObject(locale)` and `loadLocale(locale)` from `$lib/i18n/i18n-util.sync`
- Generated types ensure compile-time safety for all translations

### Payment Integration

Stripe integration for membership payments:

- Checkout sessions created in page servers
- Webhooks handled at `/api/webhook/stripe/+server.ts`
- Stripe customer IDs stored on user records
- Member status updated based on payment events

### Route Structure

- `/(auth)/sign-in/*`: Authentication flows
- `/new`: Purchase new membership
- `/admin/members`: Admin view for managing members
- `/admin/members/import`: CSV import for bulk member uploads
- `/admin/memberships`: Admin view for managing membership types
- `/api/webhook/stripe`: Stripe webhook endpoint

Route type safety via `vite-plugin-kit-routes` generates `$lib/ROUTES.ts`.

### UI Components

Shadcn-svelte components in `src/lib/components/ui/`:

- Built on bits-ui primitives
- Form handling via sveltekit-superforms and formsnap
- Styling with Tailwind CSS and tailwind-variants

### Environment Variables

Required for development:

- `DATABASE_URL`: PostgreSQL connection string
- `STRIPE_API_KEY`: Stripe API key (sandbox for dev)
- `STRIPE_WEBHOOK_SECRET`: Stripe webhook signing secret (get via `stripe listen`)
- `MAILGUN_*`: Mailgun credentials (optional in dev mode, logs to console)
- `PORT`: Server port (optional)

## Important Notes

- Node.js version: `^24.5.0` (specified in package.json engines)
- Package manager: pnpm (`10.16.1`)
- Using `rolldown-vite` instead of standard Vite (via overrides)
- Schema changes require `pnpm db:push` or `pnpm db:push:force`
- For Stripe webhook testing, run `stripe listen --forward-to localhost:$PORT/api/webhook/stripe` in parallel with dev server
- All server-side code lives in `src/lib/server/` or route `+page.server.ts`/`+server.ts` files
- Type safety enforced with Zod schemas (often co-located with routes in `schema.ts` files)
