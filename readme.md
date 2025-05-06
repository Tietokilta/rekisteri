# rekisteri

New project for a membership registry.

## Developing

Pre-requisites [Node.js v22](https://nodejs.org/en/download).

```bash
# enable corepack (pnpm)
corepack enable

# install deps
pnpm install

# setup env
cp .env.example .env

# start db
pnpm db:start

# push schema
pnpm db:push

# seed data
pnpm db:seed

# run dev server
pnpm dev
```

Login with `root@tietokilta.fi` to check the admin view, and any other account to check the regular user view.

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

stripe listen --forward-to localhost:"$PORT"/api/webhooks/stripe
```

3. Set the webhook signing secret from the output of `stripe listen` to `.env`

```bash
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Building

To create a production version of your app:

```bash
pnpm build
```

You can preview the production build with `pnpm preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
