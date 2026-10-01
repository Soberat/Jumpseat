# Jumpseat

A self-hosted travel helper (web app + installable PWA): plan trips, check the weather at your
destination, and keep a log of standby seat loads for the flights you're trying to get on.

It's built to run on your own server and stay private to your Tailscale network. Trips can be
shared with people outside it through read-only links.

## What's here so far

- **Trips** with a destination, dates and a 7-day forecast from [Open-Meteo](https://open-meteo.com/)
  (free, no API key).
- **Flights** per trip, each marked as booked or standby.
- **Standby loads**: log open seats and listed passengers per cabin, as often as you check.
  You enter loads by hand. Jumpseat never logs into or scrapes staff-travel tools.
- **Share links**: a read-only page with the trip, flights and weather. Notes and standby loads are
  not included. You can revoke a link at any time.
- **Offline**: a service worker caches the app and every page you've opened, so trips you've viewed
  still load with no signal.

## Stack

SvelteKit (Node adapter) · TypeScript · SQLite via Drizzle ORM · Tailwind CSS · Docker Compose
with a Tailscale sidecar.

## Running it on your server

You need Docker with Compose, and a Tailscale account with **MagicDNS** and **HTTPS certificates**
turned on (Tailscale admin console → DNS).

```sh
git clone https://github.com/Soberat/jumpseat.git && cd jumpseat
cp .env.example .env
# Optional: put an auth key from https://login.tailscale.com/admin/settings/keys in TS_AUTHKEY
docker compose up -d --build
```

Without an auth key, run `docker compose logs tailscale` and open the login link it prints to
add the machine to your tailnet. The login is kept in the `tailscale-state` volume.

Jumpseat will be at `https://jumpseat.<your-tailnet>.ts.net` on any device in your tailnet.
Open it on your phone and use "Add to Home Screen" to install it.

The container publishes no ports. The only way in is through Tailscale. The SQLite database
lives in the `jumpseat-data` volume, and migrations run automatically on start.

On Proxmox, run it in a VM, or in an LXC container with nesting enabled and `/dev/net/tun`
passed through (needed by the Tailscale sidecar).

### Sharing trips with people outside your tailnet

Share links only work for others once you switch on
[Tailscale Funnel](https://tailscale.com/kb/1223/funnel), which makes this one machine reachable
from the internet:

1. Allow Funnel for the node in your tailnet policy (`nodeAttrs` with `"attr": ["funnel"]`).
2. In `.env`, set `TS_SERVE_CONFIG=serve-with-funnel.json` and
   `PUBLIC_ORIGIN=https://jumpseat.<your-tailnet>.ts.net`.
3. `docker compose up -d`

Tailscale tags every Funnel request with a `Tailscale-Funnel-Request` header (and strips any copy
a client sends). Jumpseat answers those requests only for share pages (`/s/…`) and static
files. Everything else returns 404, so the rest of the app stays private.

## Development

```sh
npm install
cp .env.example .env
npm run dev
```

| Command               | What it does                                          |
| --------------------- | ----------------------------------------------------- |
| `npm run dev`         | Dev server with hot reload                            |
| `npm run check`       | Type-check Svelte and TypeScript                      |
| `npm run lint`        | Prettier + ESLint                                     |
| `npm test`            | Unit tests (Vitest)                                   |
| `npm run build`       | Production build into `build/`                        |
| `npm run db:generate` | Create a migration in `drizzle/` after editing schema |

The schema is in `src/lib/server/db/schema.ts`. After changing it, run `npm run db:generate` and
commit the new file in `drizzle/`.
