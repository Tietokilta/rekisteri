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

## Building

To create a production version of your app:

```bash
pnpm build
```

You can preview the production build with `pnpm preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
