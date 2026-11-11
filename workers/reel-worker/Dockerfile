# =============================================================================
# Stage 1: FFmpeg with the `whisper` audio filter.
#
# Neither apt (Debian bookworm ships FFmpeg 5.1) nor the prebuilt BtbN builds
# contain the filter (BtbN has it switched off in scripts.d/50-whisper.sh), so
# it is compiled here: whisper.cpp (static, CPU only) + FFmpeg 8.1 with
# --enable-whisper. Only the `ffmpeg` binary is copied into the final image.
#
# Sources are pinned by tag AND commit. The stage fails the build, not the
# production run, if the filter or the options the subtitle module uses
# (model, language, queue, use_gpu, max_len, destination, format) are missing.
# =============================================================================
FROM node:24-bookworm AS whisper-ffmpeg

ARG WHISPER_CPP_TAG=v1.9.5
ARG WHISPER_CPP_COMMIT=d1be6fde11ac6e0407606b4e42fe72d34add8037
ARG FFMPEG_TAG=n8.1.3
ARG FFMPEG_COMMIT=1041abdc962f4cc4f394aa8de9dc5236c0c3b9e7

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    git \
    cmake \
    ninja-build \
    nasm \
    pkg-config \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# whisper.cpp: static libraries, CPU backend only. GGML_NATIVE=OFF plus explicit
# AVX2 flags keeps the binary independent of the CPU of the build machine
# (every Cloud Run x86 host supports AVX2/FMA). OpenMP is off so no libgomp is
# needed at run time.
RUN git clone --depth 1 --branch "${WHISPER_CPP_TAG}" \
        https://github.com/ggml-org/whisper.cpp.git /src/whisper.cpp \
    && test "$(git -C /src/whisper.cpp rev-parse HEAD)" = "${WHISPER_CPP_COMMIT}" \
    && cmake -S /src/whisper.cpp -B /src/whisper.cpp/build -G Ninja \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_INSTALL_PREFIX=/opt/whisper \
        -DCMAKE_INSTALL_LIBDIR=lib \
        -DCMAKE_POSITION_INDEPENDENT_CODE=ON \
        -DBUILD_SHARED_LIBS=OFF \
        -DWHISPER_BUILD_TESTS=OFF \
        -DWHISPER_BUILD_EXAMPLES=OFF \
        -DWHISPER_BUILD_SERVER=OFF \
        -DWHISPER_USE_SYSTEM_GGML=OFF \
        -DGGML_CCACHE=OFF \
        -DGGML_OPENMP=OFF \
        -DGGML_NATIVE=OFF \
        -DGGML_SSE42=ON \
        -DGGML_AVX=ON \
        -DGGML_F16C=ON \
        -DGGML_AVX2=ON \
        -DGGML_BMI2=ON \
        -DGGML_FMA=ON \
    && cmake --build /src/whisper.cpp/build -j"$(nproc)" \
    && cmake --install /src/whisper.cpp/build

# The installed whisper.pc lists the static libraries in an order that does not
# link (and omits ggml-cpu), so it is written again with a complete, correctly
# ordered Libs line. Missing archives fail the build right here.
RUN for lib in libwhisper.a libggml.a libggml-cpu.a libggml-base.a; do \
        test -f "/opt/whisper/lib/${lib}" || { echo "Missing /opt/whisper/lib/${lib}"; ls -la /opt/whisper/lib; exit 1; }; \
    done \
    && mkdir -p /opt/whisper/lib/pkgconfig \
    && printf '%s\n' \
        'prefix=/opt/whisper' \
        'libdir=${prefix}/lib' \
        'includedir=${prefix}/include' \
        '' \
        'Name: whisper' \
        'Description: whisper.cpp (static, CPU backend)' \
        "Version: ${WHISPER_CPP_TAG#v}" \
        'Libs: -L${libdir} -lwhisper -lggml -lggml-cpu -lggml-base -lstdc++ -lm -lpthread' \
        'Cflags: -I${includedir}' \
        > /opt/whisper/lib/pkgconfig/whisper.pc \
    && PKG_CONFIG_PATH=/opt/whisper/lib/pkgconfig pkg-config --exists "whisper >= 1.7.5" \
    && PKG_CONFIG_PATH=/opt/whisper/lib/pkgconfig pkg-config --libs whisper

# FFmpeg: only what the subtitle module needs (the whisper filter, wav/pcm and
# raw video output, scale/fps filters, mp4/h264/aac decoding, all native).
# --disable-autodetect keeps the binary from picking up optional system
# libraries that would be missing at run time.
RUN git clone --depth 1 --branch "${FFMPEG_TAG}" \
        https://github.com/FFmpeg/FFmpeg.git /src/ffmpeg \
    && test "$(git -C /src/ffmpeg rev-parse HEAD)" = "${FFMPEG_COMMIT}"
WORKDIR /src/ffmpeg
RUN PKG_CONFIG_PATH=/opt/whisper/lib/pkgconfig ./configure \
        --prefix=/opt/ffmpeg-whisper \
        --disable-debug \
        --disable-doc \
        --disable-ffplay \
        --disable-ffprobe \
        --disable-shared \
        --enable-static \
        --disable-autodetect \
        --enable-zlib \
        --enable-whisper \
    && make -j"$(nproc)" \
    && make install \
    && strip /opt/ffmpeg-whisper/bin/ffmpeg

# Build-time verification of the exact things the subtitle module relies on.
# The grep patterns mirror the check in subtitle/transcription/whisper.ts.
RUN /opt/ffmpeg-whisper/bin/ffmpeg -hide_banner -filters 2>&1 \
        | grep -E '^[[:space:]]*[^[:space:]]+[[:space:]]+whisper[[:space:]]+A->A' \
    && /opt/ffmpeg-whisper/bin/ffmpeg -hide_banner -h filter=whisper > /tmp/whisper-filter-help.txt 2>&1 \
    && for option in model language queue use_gpu max_len destination format; do \
        grep -Eq "^[[:space:]]+${option}[[:space:]]" /tmp/whisper-filter-help.txt \
            || { echo "FFmpeg whisper filter has no option '${option}'"; cat /tmp/whisper-filter-help.txt; exit 1; }; \
    done


# =============================================================================
# Stage 2: the reel worker image.
# =============================================================================
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

# Whisper-enabled FFmpeg (stage 1). Used only for transcription / voice
# analysis; the reel itself is still rendered with ffmpeg-static.
COPY --from=whisper-ffmpeg /opt/ffmpeg-whisper/bin/ffmpeg /usr/local/bin/ffmpeg-whisper
RUN if ldd /usr/local/bin/ffmpeg-whisper | grep -q 'not found'; then \
        ldd /usr/local/bin/ffmpeg-whisper; echo 'ffmpeg-whisper has unresolved libraries'; exit 1; \
    fi \
    && ffmpeg-whisper -hide_banner -filters 2>&1 | grep -E '[[:space:]]whisper[[:space:]]+A->A'

WORKDIR /app

# Whisper model (ggml-small, ~488 MB). It sits in its own early layer so a
# normal code change does not upload or rebuild it. The file is copied into the
# build context by scripts/prepareReelWorkerBuildContext.mjs.
COPY server/models/ggml-small.bin /app/server/models/ggml-small.bin

# Build the worker bundle. The Nuxt #server alias is mapped to /app/server.
COPY workers/reel-worker/package.json workers/reel-worker/package-lock.json /app/workers/reel-worker/
WORKDIR /app/workers/reel-worker
RUN npm ci --include=dev

COPY workers/reel-worker/src/ /app/workers/reel-worker/src/
COPY server/global/engine/instagram/reel/ /app/server/global/engine/instagram/reel/
COPY server/global/engine/instagram/scripts-yt-bgutil/ /app/server/global/engine/instagram/scripts-yt-bgutil/
RUN npm run build && npm prune --omit=dev

# Runtime assets read by the existing video renderer (fonts for libass and for
# the subtitle layout measurements).
WORKDIR /app
COPY public/instagram/ /app/public/instagram/

# Dynamic subtitles. Transcription: Gemini text, timings from the local Whisper
# filter (ffmpeg-whisper + model above). The reel is still produced without
# captions if any subtitle step fails (prepareReel.ts), so these are safe
# defaults; each can be overridden with a Cloud Run Job environment variable.
ENV REEL_SUBTITLES_ENABLED=true \
    REEL_SUBTITLE_TRANSCRIPTION_PROVIDER=gemini \
    WHISPER_FFMPEG_PATH=/usr/local/bin/ffmpeg-whisper \
    WHISPER_MODEL_PATH=/app/server/models/ggml-small.bin \
    SUBTITLE_FONT_PATH=/app/public/instagram/fonts/Montserrat-ExtraBold.ttf

# Everything the subtitle module needs must exist, or the build stops here.
RUN test -f "$WHISPER_MODEL_PATH" \
    && test "$(stat -c %s "$WHISPER_MODEL_PATH")" -gt 100000000 \
    && test -f "$SUBTITLE_FONT_PATH" \
    && test -f /app/workers/reel-worker/node_modules/fontkit/package.json \
    && node -e "const {createRequire}=require('node:module'); const r=createRequire('/app/workers/reel-worker/dist/index.js'); const f=r('fontkit').openSync(process.env.SUBTITLE_FONT_PATH); if(!(f.unitsPerEm>0&&f.capHeight>0)) process.exit(1); console.log('[fontkit OK]', f.familyName, f.unitsPerEm, f.capHeight)"

# Real run of the whisper filter on two seconds of silence: loads the model and
# executes the inference path of the compiled binary, so a corrupt model file
# or an unsupported CPU fails the build instead of the first production reel.
# Pass --build-arg WHISPER_SMOKE_TEST=0 only if the build machine cannot run it.
ARG WHISPER_SMOKE_TEST=1
RUN if [ "$WHISPER_SMOKE_TEST" = "1" ]; then \
        ffmpeg-whisper -hide_banner -nostdin -y \
            -f lavfi -i anullsrc=r=16000:cl=mono -t 2 \
            -af "whisper=model=${WHISPER_MODEL_PATH}:language=ru:queue=3s:use_gpu=0:max_len=1:destination=/tmp/whisper-smoke.json:format=json" \
            -f null - \
        && rm -f /tmp/whisper-smoke.json; \
    fi

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
       https://github.com/yt-dlp/yt-dlp/releases/download/2026.10.26/yt-dlp_linux \
       -o /app/media-tools/yt-dlp \
    && chmod 755 /app/media-tools/yt-dlp \
    && /app/media-tools/yt-dlp --version \
    && test -f /app/media-tools/bgutil-ytdlp-pot-provider/server/build/generate_once.js

CMD ["node", "/app/workers/reel-worker/dist/index.js"]
