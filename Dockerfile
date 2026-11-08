FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache curl \
 && curl -fsSL https://raw.githubusercontent.com/blackciouz/broll-dashboard/main/server.js -o server.js \
 && mkdir -p public \
 && for f in index.html app.js style.css; do curl -fsSL https://raw.githubusercontent.com/blackciouz/broll-dashboard/main/public/$f -o public/$f; done \
 && apk del curl
ENV PORT=3000 HOST=0.0.0.0
EXPOSE 3000
CMD ["node", "server.js"]
