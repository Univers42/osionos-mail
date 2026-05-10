# osionos Mail

Standalone local mail bridge prototype for osionos.

The app mirrors the osionos sidebar and page rhythm while staying independently runnable for interface work. It includes a mock mail database, local connector settings for Gmail, Outlook, or generic IMAP, configurable view menus, filters, properties, and hover actions.

## Run locally

```sh
npm install
npm run dev
```

Open `http://localhost:3002`.

## Docker

```sh
docker compose up --build
```

The dev container serves the app at `http://localhost:3002` and reads `VITE_MAIL_BRIDGE_URL`, defaulting to `http://localhost:4100`.

## Connector bridge shape

The current bridge is intentionally local-first. Provider buttons and sync actions update local app state, and the endpoint field is prepared for a localhost service that can later expose provider OAuth or IMAP flows without changing the UI contract.# osionos-mail
