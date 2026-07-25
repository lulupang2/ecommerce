FROM node:22-alpine AS build
ARG APP_NAME
WORKDIR /app
COPY package.json package-lock.json turbo.json ./
COPY apps/${APP_NAME}/package.json ./apps/${APP_NAME}/package.json
COPY packages/api-client/package.json ./packages/api-client/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/tsconfig/package.json ./packages/tsconfig/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json
RUN npm ci
COPY apps/${APP_NAME} ./apps/${APP_NAME}
COPY packages/api-client ./packages/api-client
COPY packages/ui ./packages/ui
COPY packages/tsconfig ./packages/tsconfig
COPY packages/eslint-config ./packages/eslint-config
ENV NEXT_PUBLIC_API_BASE_URL=/api
RUN npm run build -w @techzone/${APP_NAME}

FROM node:22-alpine
ARG APP_NAME
WORKDIR /app
ENV NODE_ENV=production
ENV APP_NAME=${APP_NAME}
COPY --from=build /app/apps/${APP_NAME}/.next/standalone ./
COPY --from=build /app/apps/${APP_NAME}/.next/static ./apps/${APP_NAME}/.next/static
EXPOSE 3000
CMD ["sh", "-c", "node apps/${APP_NAME}/server.js"]
