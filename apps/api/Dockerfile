FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci
COPY tsconfig.base.json .
COPY apps/api apps/api
COPY packages/contracts packages/contracts
RUN npm run build --workspace=@chat2/contracts && npm run build --workspace=@chat2/api

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci --omit=dev
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/packages/contracts/dist packages/contracts/dist
COPY db db
EXPOSE 3000
CMD ["sh", "-c", "node apps/api/dist/migrate.js && node apps/api/dist/server.js"]
