FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY next.config.mjs postcss.config.mjs jsconfig.json ./
ENV NEXT_PUBLIC_API_BASE_URL=http://localhost:18080/api
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
