# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
	npm ci --ignore-scripts --prefer-offline --no-audit --no-fund

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

FROM node:22-alpine AS dev
WORKDIR /app
ENV npm_config_fund=false npm_config_audit=false npm_config_update_notifier=false npm_config_ignore_scripts=true
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
	npm ci --ignore-scripts --prefer-offline --no-audit --no-fund
COPY . .
EXPOSE 3002
CMD ["npm", "run", "dev"]

FROM nginx:1.27-alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]