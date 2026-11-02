FROM node:24-bookworm

ENV NODE_ENV=production \
    YTDLP_BGUTIL_MODE=script \
    YTDLP_PATH=/app/media-tools/yt-dlp \
    FFPROBE_PATH=/usr/bin/ffprobe \
    HOME=/tmp \
    XDG_CACHE_HOME=/tmp/.cache

# ffprobe/fontconfig required by the existing FFmpeg pipeline.
# Native build libraries are required by the BGUtil server dependencies (canvas).
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    ffmpeg \
    fontconfig \
    fonts-dejavu-core \
    build-essential \
    python3 \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Build the worker bundle. The Nuxt #server alias is mapped to /app/server.
COPY workers/reel-worker/package.json workers/reel-worker/package-lock.json /app/workers/reel-worker/
WORKDIR /app/workers/reel-worker
RUN npm ci --include=dev

COPY workers/reel-worker/src/ /app/workers/reel-worker/src/
COPY server/global/engine/instagram/reel/ /app/server/global/engine/instagram/reel/
COPY server/global/engine/instagram/scripts-yt-bgutil/ /app/server/global/engine/instagram/scripts-yt-bgutil/
RUN npm run build && npm prune --omit=dev

# Runtime assets read by the existing video renderer.
WORKDIR /app
COPY public/instagram/ /app/public/instagram/

# yt-dlp plugin: keep the script provider and remove the HTTP provider so the
# provider selection matches the existing production preparation script.
COPY bgutil-ytdlp-pot-provider/plugin/ /app/media-tools/yt-dlp-plugins/bgutil-ytdlp-pot-provider/
RUN rm -f /app/media-tools/yt-dlp-plugins/bgutil-ytdlp-pot-provider/yt_dlp_plugins/extractor/getpot_bgutil_http.py

# Script provider runtime. generate_once.js imports the adjacent build files
# and dependencies from this directory; no BGUtil HTTP service is started.
COPY bgutil-ytdlp-pot-provider/server/package.json bgutil-ytdlp-pot-provider/server/package-lock.json /app/media-tools/bgutil-ytdlp-pot-provider/server/
COPY bgutil-ytdlp-pot-provider/server/build/ /app/media-tools/bgutil-ytdlp-pot-provider/server/build/
WORKDIR /app/media-tools/bgutil-ytdlp-pot-provider/server
RUN npm ci --omit=dev

# Match the pinned yt-dlp version used by scripts/prepareMediaTools.mjs.
WORKDIR /app
RUN mkdir -p /app/media-tools \
    && curl -fsSL \
       https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp_linux \
       -o /app/media-tools/yt-dlp \
    && chmod 755 /app/media-tools/yt-dlp \
    && /app/media-tools/yt-dlp --version \
    && test -f /app/media-tools/bgutil-ytdlp-pot-provider/server/build/generate_once.js

CMD ["node", "/app/workers/reel-worker/dist/index.js"]
