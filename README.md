# osionos Mail

Standalone local mail bridge prototype for osionos.

The app mirrors the osionos sidebar and page rhythm while staying independently runnable for interface work. It includes a mock mail database, a localhost Gmail bridge, provider-shaped connector settings for Outlook or IMAP, configurable view menus, filters, properties, and hover actions.

## Run with Docker

From the repository root:

```sh
docker compose up --build mail mail-bridge
```

Or use the root convenience targets:

```sh
make all
make mail-up
npm run dev:all
```

Open `http://localhost:3002`. The bridge runs on `http://localhost:4100`.

If port `3002` is already held by an older host Vite process, stop that process first or run with another host port:

```sh
MAIL_HOST_PORT=3003 docker compose up --build mail mail-bridge
```

The root stack builds stable local images named `track-binocle/mail:local` and `track-binocle/mail-bridge:local` unless overridden through Compose image variables.

## Connect Gmail from localhost

Create a Google OAuth client with this redirect URI:

```txt
http://localhost:4100/auth/gmail/callback
```

The redirect URI in Google Console must match `GMAIL_REDIRECT_URI` exactly. By default the bridge accepts only the callback path from that one redirect URI:

```txt
http://localhost:4100/auth/gmail/callback
```

Vite also proxies `/auth`, `/api/auth`, `/mail/bridge`, and `/api/mail/bridge` to the bridge in development. If you intentionally want Google to return through the UI port, set both Google Console and `.env.local` to the same value, then add that callback path to `GMAIL_CALLBACK_PATHS`, for example:

```sh
GMAIL_REDIRECT_URI=http://localhost:3002/api/auth/callback/google
GMAIL_CALLBACK_PATHS=/api/auth/callback/google
```

Then create `apps/mail/.env.local` from `.env.example` and set:

```sh
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
```

Large mailboxes are synced in pages. The default local dev settings pull up to 2,000 messages and allow raising the cap to 5,000:

```sh
GMAIL_SYNC_LIMIT=2000
GMAIL_MAX_SYNC_LIMIT=5000
VITE_GMAIL_SYNC_LIMIT=2000
VITE_GMAIL_SYNC_PAGE_SIZE=100
```

Raise both `GMAIL_SYNC_LIMIT` and `VITE_GMAIL_SYNC_LIMIT` when you want the UI refresh button to pull deeper into Gmail.

Start the bridge and UI from the repository root:

```sh
docker compose up --build mail mail-bridge
```

Open the connector modal and click **Connect Gmail**. The bridge requests Gmail API access only, stores OAuth tokens in the ignored `.mail-bridge-tokens.json` file, then exposes normalized messages to the app through localhost endpoints.

OAuth state is stored in the ignored `.mail-bridge-state.json` file while authorization is in progress, so restarting the bridge during the Google consent screen is less likely to produce an invalid-state callback.

## BaaS security integration

The bridge keeps Google credentials and OAuth tokens server-side. For local security parity with the BaaS stack, you can load Google OAuth client credentials from the BaaS Vault secret seeded by `apps/baas/mini-baas-infra/docker/services/vault/scripts/init-vault.sh`:

```sh
MAIL_BRIDGE_VAULT_ENABLED=true
VAULT_ADDR=http://127.0.0.1:8200
MAIL_BRIDGE_VAULT_OAUTH_PATH=secret/data/mini-baas/oauth
```

Provide either `VAULT_TOKEN` for local development or `VAULT_ROLE_ID` plus `VAULT_SECRET_ID` from a service AppRole. Direct `.env.local` values still work and take precedence for quick local tests.

## Docker

```sh
docker compose up --build mail mail-bridge
```

The dev stack serves the app at `http://localhost:3002` and the bridge at `http://localhost:4100`. Put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `apps/mail/.env.local`, or enable the Vault lookup described above.

## Connector bridge shape

The bridge is intentionally local-first. Gmail OAuth, token refresh, message list sync, message content extraction, star/archive/trash/read actions, and disconnect are implemented in `bridge/server.mjs`. Outlook and IMAP can use the same UI and endpoint shape next.
