FROM node:22-alpine AS base

FROM base AS deps
WORKDIR /app
COPY ../w1-system-device-info/package.json ../w1-system-device-info/package-lock.json* /w1-system-device-info/
RUN cd /w1-system-device-info && npm ci --ignore-scripts
COPY ../w1-system-gsap-gesture/package.json ../w1-system-gsap-gesture/package-lock.json* /w1-system-gsap-gesture/
RUN cd /w1-system-gsap-gesture && npm ci --ignore-scripts
COPY ../w1-system-gsap-scroll/package.json ../w1-system-gsap-scroll/package-lock.json* /w1-system-gsap-scroll/
RUN cd /w1-system-gsap-scroll && npm ci --ignore-scripts
COPY ../w1-system-timeline-engine/package.json ../w1-system-timeline-engine/package-lock.json* /w1-system-timeline-engine/
RUN cd /w1-system-timeline-engine && npm ci --ignore-scripts
COPY ../w1-system-imageblock/package.json ../w1-system-imageblock/package-lock.json* /w1-system-imageblock/
RUN cd /w1-system-imageblock && npm ci --ignore-scripts
COPY ../w1-system-media-manager/package.json ../w1-system-media-manager/package-lock.json* /w1-system-media-manager/
RUN cd /w1-system-media-manager && npm ci --ignore-scripts
COPY ../w1-system-carouselblock/package.json ../w1-system-carouselblock/package-lock.json* /w1-system-carouselblock/
RUN cd /w1-system-carouselblock && npm ci --ignore-scripts
COPY ../w1-system-font-manager/package.json ../w1-system-font-manager/package-lock.json* /w1-system-font-manager/
RUN cd /w1-system-font-manager && npm ci --ignore-scripts
COPY ../w1-system-formrecorder/package.json ../w1-system-formrecorder/package-lock.json* /w1-system-formrecorder/
RUN cd /w1-system-formrecorder && npm ci --ignore-scripts
COPY ../w1-system-flipbook/package.json ../w1-system-flipbook/package-lock.json* /w1-system-flipbook/
RUN cd /w1-system-flipbook && npm ci --ignore-scripts
COPY ../w1-system-ui/package.json ../w1-system-ui/package-lock.json* /w1-system-ui/
RUN cd /w1-system-ui && npm ci --ignore-scripts
COPY ../w1-system-widgets/package.json ../w1-system-widgets/package-lock.json* /w1-system-widgets/
RUN cd /w1-system-widgets && npm ci --ignore-scripts
COPY ../w1-system-calendar/package.json ../w1-system-calendar/package-lock.json* /w1-system-calendar/
RUN cd /w1-system-calendar && npm ci --ignore-scripts

COPY ../w1-system-font-manager /w1-system-font-manager
RUN cd /w1-system-font-manager && npm install --no-audit --no-fund --loglevel=error && npm run build
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/../w1-system-device-info /w1-system-device-info/
COPY --from=deps /app/../w1-system-gsap-gesture /w1-system-gsap-gesture/
COPY --from=deps /app/../w1-system-gsap-scroll /w1-system-gsap-scroll/
COPY --from=deps /app/../w1-system-timeline-engine /w1-system-timeline-engine/
COPY --from=deps /app/../w1-system-imageblock /w1-system-imageblock/
COPY --from=deps /app/../w1-system-media-manager /w1-system-media-manager/
COPY --from=deps /app/../w1-system-carouselblock /w1-system-carouselblock/
COPY --from=deps /app/../w1-system-font-manager /w1-system-font-manager/
COPY --from=deps /app/../w1-system-formrecorder /w1-system-formrecorder/
COPY --from=deps /app/../w1-system-flipbook /w1-system-flipbook/
COPY --from=deps /app/../w1-system-ui /w1-system-ui/
COPY --from=deps /app/../w1-system-widgets /w1-system-widgets/
COPY --from=deps /app/../w1-system-calendar /w1-system-calendar/
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run generate:importmap && \
    npm run generate:types && \
    npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1


# Module runtime tools (lib/resolve-deps.mjs MODULE_RUNTIME_APK).
RUN apk add --no-cache poppler-utils fontconfig font-dejavu font-liberation

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/assets ./public/assets
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@imagemagick/magick-wasm/dist/magick.wasm ./magick.wasm
RUN node -e "const fs=require('fs');const p='package.json';if(fs.existsSync(p)){const pkg=JSON.parse(fs.readFileSync(p,'utf8'));delete pkg.type;fs.writeFileSync(p,JSON.stringify(pkg,null,2)+'\n')}"
# Payload media lives on the ./media volume (MEDIA_STORAGE_ROOT, default /app/media),
# never under public/. Remove any public/media copy or symlink from the build context.
RUN rm -rf /app/public/media &&     mkdir -p /app/media /app/app-font-assets &&     chown -R nextjs:nodejs /app/media /app/app-font-assets

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
