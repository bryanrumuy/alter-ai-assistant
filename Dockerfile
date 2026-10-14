FROM node:24-slim

# Chromium for whatsapp-web.js (puppeteer's own download is skipped).
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-liberation ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    DATA_DIR=/data \
    NODE_ENV=production

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

# Run as the unprivileged "node" user; /data is the only place that has to be writable.
RUN mkdir -p /data && chown -R node:node /data
USER node

VOLUME /data
# Default: the WhatsApp bot. docker-compose.yml starts the Telegram bot and the dashboard from the same image.
CMD ["node", "bot.js"]
