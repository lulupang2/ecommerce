FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY next.config.mjs postcss.config.mjs jsconfig.json ./
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/out /usr/share/nginx/html
EXPOSE 80
