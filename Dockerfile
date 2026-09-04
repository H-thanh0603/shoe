# Multi-stage: build frontend (Vite) + chạy Express phục vụ API & static dist/.
# Scale ngang: docker compose up --scale app=3 (kèm Redis shared cache/rate-limit).
# Tách worker jobs: WORKER_ONLY=true (đã có sẵn service `worker` trong compose).
FROM node:22-alpine AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.js ./
COPY public/ public/
COPY src/ src/
RUN npm run build

FROM node:22-alpine AS api
WORKDIR /app/api
ENV NODE_ENV=production
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server/*.js ./
COPY server/middleware/ middleware/
COPY server/routes/ routes/
COPY server/services/ services/
COPY server/migrations/ migrations/
COPY --from=frontend /app/dist/ /app/dist/
EXPOSE 3000
CMD ["sh", "-c", "node migrate.js && node server.js"]
