# ══════════════════════════════════════════════════════════════════════════════
# Stage 1 — Build React (CRA)
# ══════════════════════════════════════════════════════════════════════════════
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# CI=false : ne pas échouer sur les warnings ESLint en build
# REACT_APP_API_URL peut être surchargé au build via --build-arg si besoin
ENV CI=false
ARG REACT_APP_API_URL=/api
ENV REACT_APP_API_URL=$REACT_APP_API_URL

RUN npm run build && npm cache clean --force


# ══════════════════════════════════════════════════════════════════════════════
# Stage 2 — Nginx unprivileged (non-root, écoute sur 8080)
# ══════════════════════════════════════════════════════════════════════════════
FROM nginxinc/nginx-unprivileged:1.27-alpine

# L'image nginxinc/nginx-unprivileged tourne déjà en USER nginx (uid 101)
# et écoute sur 8080 par défaut (pas besoin de CAP_NET_BIND_SERVICE).
USER root
RUN apk add --no-cache wget
USER nginx

COPY --chown=nginx:nginx --from=build /app/build /usr/share/nginx/html
COPY --chown=nginx:nginx nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
