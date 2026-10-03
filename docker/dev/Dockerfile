# Development-only toolchain image for docker-compose.dev.yml.
#
# Bakes the tools that scripts/docker-dev-app.sh would otherwise install with
# apk/npm on every container start. Those tools live in the container
# filesystem, not in a volume, so they were reinstalled after every
# down/up cycle.
#
# The build context is this directory on purpose: it needs no project files, and
# using the repository root would upload the multi-GB .next and node_modules
# trees on every build.
#
# scripts/docker-dev-app.sh keeps its own guards, so it still works unchanged on
# a plain node:22-alpine image.

FROM node:22-alpine

# python3/make/g++/build-base: native module builds (sharp, @parcel/watcher).
RUN apk add --no-cache python3 make g++ build-base

# Module runtime tools (lib/resolve-deps.mjs MODULE_RUNTIME_APK in the creator),
# e.g. flipbook: pdfinfo/pdftoppm plus fonts for the PDF conversion.
RUN apk add --no-cache poppler-utils fontconfig font-dejavu font-liberation

# Must match TARGET_NPM_VERSION in scripts/docker-dev-app.sh.
ARG NPM_VERSION=11.2.0
RUN npm install -g "npm@${NPM_VERSION}"
