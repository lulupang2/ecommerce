FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY backend ./backend
COPY scripts ./scripts
COPY contracts ./contracts
EXPOSE 3000
CMD ["node", "backend/services/gateway/server.js"]
