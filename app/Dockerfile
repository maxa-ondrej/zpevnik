# Reader webapp — Expo Web static export served via nginx.
#
# Build context MUST be the repo root, not app/, because the bundled songs
# corpus lives at <repo>/songs (which the dev setup symlinks via
# app/public/songs → ../../songs):
#   docker build -f app/Dockerfile -t zpevnik-reader .
#
# Run:
#   docker run --rm -p 8080:80 zpevnik-reader
#   → http://localhost:8080/
#
# The corpus is baked into the image at build time. To deploy with a fresh
# corpus, rebuild — there is no runtime volume for songs on the web path
# (see HANDOVER next-step #4 for the native offline-asset story).

# ---------------------------------------------------------------- builder ---
FROM node:20-alpine AS builder
WORKDIR /build

# Install deps first so this layer survives source edits.
COPY app/package.json app/package-lock.json ./app/
RUN cd app && npm ci

# Copy the rest of the app sources + the corpus.
COPY app ./app
COPY songs ./songs

# The repo uses app/public/songs as a dev-only symlink → ../../songs. In the
# image we replace it with a real copy so `expo export` picks the files up
# (the symlink target lives outside the COPY of app/ on its own).
RUN rm -f app/public/songs && cp -r songs app/public/songs

# Produces /build/app/dist with the static export.
RUN cd app && npm run build:web

# Expo SDK 54's static export emits `<script src="…entry-….js" defer>`
# for the entry chunk — classic script. The bundle uses `import.meta`,
# which is only legal inside a module script, so the browser throws
# `SyntaxError: Cannot use 'import.meta' outside a module` and the app
# never boots. Inject `type="module"` into every entry tag the export
# generated (one per precompiled HTML page).
RUN find /build/app/dist -name "*.html" -exec sed -i \
    's|<script src="\(/_expo/static/js/web/entry-[^"]*\)" defer></script>|<script type="module" src="\1" defer></script>|g' \
    {} \;

# ---------------------------------------------------------------- runtime ---
FROM nginx:alpine AS runtime
# curl for the Coolify healthcheck. nginx:alpine has BusyBox wget but
# Coolify's healthcheck input field rejects multi-token commands;
# curl keeps the test a plain one-liner.
RUN apk add --no-cache curl
COPY --from=builder /build/app/dist /usr/share/nginx/html
# SPA fallback so dynamic routes like /song/[id] don't 404 against nginx.
COPY app/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
# nginx:alpine's default CMD already serves /usr/share/nginx/html.
