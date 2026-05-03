# Production image for the LeaseOS API.
# Used by Render via render.yaml; also builds locally with:
#     docker build -t leaseos-api .
#     docker run -p 8000:8000 -e ANTHROPIC_API_KEY=... leaseos-api

FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# System deps for psycopg + PyMuPDF
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
COPY src ./src
RUN pip install --upgrade pip && pip install .

# Non-root user
RUN useradd --create-home --shell /bin/bash app && chown -R app:app /app
USER app

EXPOSE 8000

# Render injects PORT — fall back to 8000 locally
CMD ["sh", "-c", "uvicorn leaseos.api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
