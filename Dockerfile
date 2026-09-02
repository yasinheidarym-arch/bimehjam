# Bimeh Jam - Production Dockerfile
FROM node:20-alpine AS build

WORKDIR /app

RUN apk add --no-cache openssl libc6-compat

COPY package.json ./
RUN npm install

# Keep versioned migrations in the build context explicitly. Runtime migrations
# are deliberately explicit-only, but Prisma must be able to see their files.
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY prisma/migrations ./prisma/migrations
RUN npx prisma generate

COPY . .

ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN npm run build


FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN apk add --no-cache openssl libc6-compat curl

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:3000/api/webhook/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/server.cjs"]
