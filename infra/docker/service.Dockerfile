FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json turbo.json ./
COPY apps/api-gateway/package.json ./apps/api-gateway/package.json
COPY apps/services/admin-query/package.json ./apps/services/admin-query/package.json
COPY apps/services/auth/package.json ./apps/services/auth/package.json
COPY apps/services/cart/package.json ./apps/services/cart/package.json
COPY apps/services/catalog/package.json ./apps/services/catalog/package.json
COPY apps/services/fulfillment/package.json ./apps/services/fulfillment/package.json
COPY apps/services/inventory/package.json ./apps/services/inventory/package.json
COPY apps/services/media/package.json ./apps/services/media/package.json
COPY apps/services/notification/package.json ./apps/services/notification/package.json
COPY apps/services/order/package.json ./apps/services/order/package.json
COPY apps/services/payment/package.json ./apps/services/payment/package.json
COPY apps/services/procurement/package.json ./apps/services/procurement/package.json
COPY apps/services/search/package.json ./apps/services/search/package.json
COPY packages/api-client/package.json ./packages/api-client/package.json
COPY packages/auth/package.json ./packages/auth/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json
COPY packages/messaging/package.json ./packages/messaging/package.json
COPY packages/observability/package.json ./packages/observability/package.json
COPY packages/testing/package.json ./packages/testing/package.json
COPY packages/tsconfig/package.json ./packages/tsconfig/package.json
COPY packages/ui/package.json ./packages/ui/package.json
RUN npm ci
COPY apps ./apps
COPY packages ./packages
COPY tools ./tools
RUN npm run build -w @techzone/contracts
RUN npm run build -w @techzone/api-gateway
RUN npm run build -w @techzone/auth
RUN npm run build -w @techzone/order
RUN npm run build -w @techzone/payment
RUN npm run build -w @techzone/inventory
RUN npm run build -w @techzone/catalog
RUN npm run build -w @techzone/cart
RUN npm run build -w @techzone/notification
RUN npm run build -w @techzone/search
RUN npm run build -w @techzone/media
RUN npm run build -w @techzone/fulfillment
RUN npm run build -w @techzone/procurement
RUN npm run build -w @techzone/admin-query
EXPOSE 3000
CMD ["node", "apps/api-gateway/dist/main.js"]
