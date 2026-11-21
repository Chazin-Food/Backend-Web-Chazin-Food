FROM node:20-alpine

WORKDIR /app

# Copiar manifests de dependencias
COPY package*.json ./

# Instalar solo dependencias de producción
RUN npm ci --omit=dev && chown -R node:node /app

# Copiar el código del backend con propietario no-root
COPY --chown=node:node . .

ENV NODE_ENV=production

USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 5000) + '/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
