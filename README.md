# 9Darters Losice

Platforma webowa do wspolnych rozgrywek w darta: offline, 1v1 online, turnieje, live spectating, trening, ranking i social.

## Stack

- Frontend: Svelte 5 + Vite + TypeScript + PWA
- Backend: Node.js + Fastify + Socket.IO
- Baza: MySQL 8 + Drizzle ORM
- Deployment: Docker Compose + Caddy

## Start lokalny

1. Skopiuj `.env.example` do `.env`.
2. Zainstaluj zaleznosci: `npm.cmd install`
3. Uruchom baze: `docker compose up -d mysql`
4. Zastosuj migracje: `npm.cmd run db:migrate`
5. Frontend dev: `npm.cmd run dev:web`
6. Backend dev: `npm.cmd run dev:api`
7. Build produkcyjny calego repo: `npm.cmd run build`
8. Testy i typecheck: `npm.cmd test`

`DATABASE_URL` i `APP_ORIGIN` sluza do lokalnego trybu developerskiego (`dev:api`, `dev:web`).

## Deployment lokalny przez Docker Compose

- Pelny stack: `docker compose up --build`
- Docker Compose korzysta z osobnych zmiennych `DOCKER_*`, zeby lokalny `.env` dla trybu dev nie nadpisywal polaczenia API z kontenerem `mysql`.
- Front jest serwowany przez Nginx, backend przez Fastify, a reverse proxy robi Caddy.
- Endpoint healthcheck backendu: `/api/health`

## Workspace

- `apps/api` - backend i realtime
- `apps/web` - frontend PWA
- `packages/shared` - wspoldzielone typy i silnik regul gry
