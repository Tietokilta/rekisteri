# rekisteri

New project for a membership registry. [Live production deployment at rekisteri.tietokilta.fi](https://rekisteri.tietokilta.fi).

## Developing

Pre-requisites [Node.js v24](https://nodejs.org/en/download).

```bash
# enable corepack (pnpm)
corepack enable

# install deps
pnpm install

# setup env
cp .env.example .env

# start db
pnpm db:start
# or in the background
pnpm db:start -d

# migrate db schema
pnpm db:migrate

# seed data
pnpm db:seed

# run dev server (includes i18n type generation in watch mode)
pnpm dev

# quickly clear, migrate, and re-seed
pnpm db:reset
```

Login with `root@tietokilta.fi` to check the admin view, and any other account to check the regular user view.

**Note:** i18n types are auto-generated from `src/lib/i18n/{fi,en}/index.ts` and git-ignored. The dev server automatically watches for translation changes and regenerates types.

### Testing payments with Stripe

Pre-prequisites: [Stripe CLI](https://docs.stripe.com/stripe-cli#install)

1. Add your Stripe sandbox API key to `.env`:

```bash
STRIPE_API_KEY=sk_test_...
```

2. Start listening to webhooks

```bash
# required only on the first time
stripe login

stripe listen --forward-to localhost:"$PORT"/api/webhook/stripe
```

3. Set the webhook signing secret from the output of `stripe listen` to `.env`

```bash
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Building

To create a production version of your app:

```bash
pnpm build

pnpm flake:build
```

You can preview the production build with `pnpm preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## License

MIT
