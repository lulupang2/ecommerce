FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json turbo.json ./
COPY apps ./apps
COPY packages ./packages
COPY tools ./tools
RUN npm ci
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
