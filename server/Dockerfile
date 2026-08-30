# ══════════════════════════════════════════════════════════════════════════════
# Stage 1 — Build des dépendances
# ══════════════════════════════════════════════════════════════════════════════
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force


# ══════════════════════════════════════════════════════════════════════════════
# Stage 2 — Image de production
# ══════════════════════════════════════════════════════════════════════════════
FROM node:20-alpine AS production

WORKDIR /app

# Utilisateur non-root pour la sécurité
RUN addgroup -S blancbleu && adduser -S blancbleu -G blancbleu

# Copier les dépendances depuis le stage build
COPY --from=deps /app/node_modules ./node_modules

# Copier le code source (exclure les fichiers de dev via .dockerignore)
COPY . .

# Donner les droits à l'utilisateur applicatif
RUN chown -R blancbleu:blancbleu /app

USER blancbleu

EXPOSE 5000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/health || exit 1

# Seed au premier démarrage (idempotent) puis lancement du CMD.
# Le fichier est déjà présent via le COPY du code source ; on s'assure juste
# qu'il est exécutable, y compris si le dépôt a été cloné sous Windows.
ENTRYPOINT ["/bin/sh", "/app/docker-entrypoint.sh"]
CMD ["node", "Server.js"]