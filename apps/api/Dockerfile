FROM node:22-alpine AS base
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm install

FROM base AS build
COPY . .
RUN npm run build --workspace @9darters/shared && npm run build --workspace @9darters/api

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/drizzle ./apps/api/drizzle
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
CMD ["node", "apps/api/dist/index.js"]
