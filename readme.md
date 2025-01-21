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

# run dev server
pnpm dev
```

## Building

To create a production version of your app:

```bash
pnpm build
```

You can preview the production build with `pnpm preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
