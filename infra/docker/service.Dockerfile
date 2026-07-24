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
EXPOSE 3000
CMD ["node", "apps/api-gateway/dist/main.js"]
