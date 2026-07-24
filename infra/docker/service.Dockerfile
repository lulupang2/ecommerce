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
EXPOSE 3000
CMD ["node", "apps/api-gateway/dist/main.js"]
