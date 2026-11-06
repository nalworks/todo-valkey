# Node.js 24 on Alpine, multi-arch (amd64 + arm64).
FROM node:24-alpine

ENV NODE_ENV=production

WORKDIR /app

# Install only runtime dependencies using the lockfile for reproducible builds.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy the application source.
COPY src ./src

EXPOSE 8080

CMD ["node", "src/server.js"]
