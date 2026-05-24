# ══════════════════════════════════════════════════════════════════════════════
# Stage 1 — Builder : compile les dépendances Python dans un virtualenv
# ══════════════════════════════════════════════════════════════════════════════
FROM python:3.11-slim AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# build-essential nécessaire pour compiler certaines wheels (e.g. pyclipper)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Virtualenv isolé — sera copié dans le stage runtime
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /build

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && \
    python -m spacy download fr_core_news_sm


# ══════════════════════════════════════════════════════════════════════════════
# Stage 2 — Runtime : image minimale, utilisateur non-root
# ══════════════════════════════════════════════════════════════════════════════
FROM python:3.11-slim AS runtime

LABEL maintainer="BlancBleu Transport Sanitaire"
LABEL description="Microservice IA — PMT extraction, dispatch scoring, routage"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

# Dépendances runtime uniquement (pas de build-essential)
# curl est nécessaire pour le HEALTHCHECK
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-fra \
    tesseract-ocr-eng \
    poppler-utils \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Utilisateur non-root
RUN groupadd -r blancbleu && \
    useradd -r -g blancbleu -d /app -s /sbin/nologin blancbleu

WORKDIR /app

# Copie du virtualenv compilé depuis le builder
COPY --from=builder /opt/venv /opt/venv

# Code source
COPY --chown=blancbleu:blancbleu . .

USER blancbleu

EXPOSE 5002

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD curl -fsS http://localhost:5002/health >/dev/null || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5002", "--workers", "2"]
