FROM node:22-alpine AS base
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm install

FROM base AS build
COPY . .
RUN npm run build --workspace @9darters/shared && npm run build --workspace @9darters/web

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
