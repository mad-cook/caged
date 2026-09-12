# Builds and serves the Next.js app in web/. The Anchor program is not built here.
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY web/package.json web/package-lock.json ./
COPY web/scripts ./scripts
RUN npm ci --no-audit --no-fund

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY web ./
# NEXT_PUBLIC_* values are baked in at build time. Railway passes service
# variables as build args when they are declared with ARG.
ARG NEXT_PUBLIC_RPC_URL
ARG NEXT_PUBLIC_CLUSTER=mainnet-beta
ARG NEXT_PUBLIC_PROGRAM_ID=65cX8gGch8x4vQvU4gnpPcepwKadDSAtJ4ZgZg3hp61t
ARG NEXT_PUBLIC_BRAND_MINT
ARG NEXT_PUBLIC_BRAND_NAME
ARG NEXT_PUBLIC_SITE_NAME
ENV NEXT_PUBLIC_RPC_URL=$NEXT_PUBLIC_RPC_URL \
    NEXT_PUBLIC_CLUSTER=$NEXT_PUBLIC_CLUSTER \
    NEXT_PUBLIC_PROGRAM_ID=$NEXT_PUBLIC_PROGRAM_ID \
    NEXT_PUBLIC_BRAND_MINT=$NEXT_PUBLIC_BRAND_MINT \
    NEXT_PUBLIC_BRAND_NAME=$NEXT_PUBLIC_BRAND_NAME \
    NEXT_PUBLIC_SITE_NAME=$NEXT_PUBLIC_SITE_NAME \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app ./
EXPOSE 3000
CMD ["sh", "-c", "npx next start -p ${PORT:-3000}"]
