FROM node:22-bookworm
ARG OBSIDIAN_VERSION=1.14.4
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb ffmpeg ca-certificates curl libgtk-3-0 libnss3 libasound2 \
    libgbm1 libxss1 libatk-bridge2.0-0 libdrm2 libx11-xcb1 \
    fonts-dejavu-core fonts-liberation && rm -rf /var/lib/apt/lists/*
RUN case "$TARGETARCH" in arm64) suffix=-arm64 ;; amd64) suffix= ;; *) exit 1 ;; esac \
    && curl -fL "https://github.com/obsidianmd/obsidian-releases/releases/download/v${OBSIDIAN_VERSION}/Obsidian-${OBSIDIAN_VERSION}${suffix}.AppImage" -o /tmp/obsidian.AppImage \
    && chmod +x /tmp/obsidian.AppImage \
    && cd /opt && /tmp/obsidian.AppImage --appimage-extract >/dev/null \
    && rm /tmp/obsidian.AppImage
RUN apt-get update && apt-get install -y --no-install-recommends xdotool && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV HTOC_DOCKER=1 DISPLAY=:99 OBSIDIAN_EXECUTABLE=/opt/squashfs-root/obsidian OBSIDIAN_VERSION=${OBSIDIAN_VERSION}
CMD ["bash", "docker/entrypoint.sh", "check"]
