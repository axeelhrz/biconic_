FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

FROM base AS deps
COPY backend/package.json backend/package-lock.json* ./backend/
WORKDIR /app/backend
RUN npm ci || npm install

FROM base AS builder
COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY backend/ ./backend/
COPY lib/ ./lib/
# lib/ vive en /app/lib; TypeScript resuelve imports (postgres, chart.js) desde /app/node_modules
RUN ln -s /app/backend/node_modules /app/node_modules
WORKDIR /app/backend
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY --from=builder /app/backend/package.json ./backend/
COPY --from=builder /app/lib ./lib/
WORKDIR /app/backend
EXPOSE 4000
# Railway inyecta PORT; Nest lee process.env.PORT
CMD ["node", "dist/backend/src/main.js"]
