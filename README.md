# JellyoSplit

A real-time expense splitting app for group gatherings. Create events, add participants, assign cost categories, and calculate who owes what — all with live collaboration.

## Features

- **Gatherings** — Create events (dinners, trips, BBQs) and track shared costs
- **Categories & Sources** — Break down expenses into categories with itemised sources
- **Participants** — Add participants with emoji avatars, assign them to categories
- **Adjustments** — Apply percentage or fixed discounts per participant (e.g. "birthday boy pays less")
- **Payments** — Record who has already paid
- **Settlement** — Auto-compute optimised settlement transactions
- **Real-time Collaboration** — Multiple users can edit the same gathering via Socket.IO
- **Import / Export** — Backup and restore gatherings as JSON
- **PDF Reports** — Generate settlement summaries
- **Authentication** — Local username/password, OIDC/SSO, or both
- **Admin Panel** — Manage users, settings, and OIDC providers

## Quick Start (Docker)

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)

### 1. Clone the repo

```bash
git clone https://github.com/yourusername/JellyoSplit.git
cd JellyoSplit
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

| Variable | Description |
|---|---|
| `DB_PASSWORD` | PostgreSQL password (change from default) |
| `SESSION_SECRET` | A long random string for session encryption |

Optional settings:

| Variable | Default | Description |
|---|---|---|
| `BASE_URL` | `http://localhost:3000` | Public URL of the app |
| `EXTERNAL_PORT` | `3000` | Host port exposed by Docker |
| `AUTH_MODE` | `local` | `local`, `oidc`, or `both` |
| `OIDC_ISSUER` | — | OIDC provider URL (e.g. `https://accounts.google.com`) |
| `OIDC_CLIENT_ID` | — | OIDC client ID |
| `OIDC_CLIENT_SECRET` | — | OIDC client secret |
| `OIDC_CALLBACK_URL` | auto-derived | OIDC redirect URI (defaults to `BASE_URL/api/auth/oidc/callback`) |

### 3. Start

```bash
docker compose up -d
```

The app will be available at **http://localhost:3000** (or whatever `BASE_URL` you configured).

The first user to register automatically becomes the admin.

### Stopping

```bash
docker compose down
```

To also remove the database volume:

```bash
docker compose down -v
```

## Development

### Prerequisites

- Node.js 20+
- PostgreSQL 16+

### Setup

```bash
npm install
cp .env.example .env
```

Update `DATABASE_URL` in `.env` to point to your local PostgreSQL:

```
DATABASE_URL=postgresql://user:password@localhost:5432/jellyosplit
```

Run migrations and start the dev server:

```bash
npx prisma migrate deploy
npm run dev
```

This starts both the Vite frontend dev server and the Express backend with hot reload.

### Build

```bash
npm run build
npm start
```

## Tech Stack

- **Frontend** — React 19, TypeScript, Tailwind CSS 4, Vite, Framer Motion
- **Backend** — Express 5, TypeScript, Prisma ORM, Passport.js
- **Database** — PostgreSQL 16
- **Real-time** — Socket.IO
- **Auth** — Local (bcrypt) + OpenID Connect

## License

ISC
