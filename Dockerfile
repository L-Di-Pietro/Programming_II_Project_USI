# Backend Docker image — Python 3.11 slim, FastAPI app.
# Built and run by docker-compose.yml.

FROM python:3.11-slim

# Avoid .pyc clutter and force unbuffered stdout for clean docker logs.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install system deps needed for compiled wheels (numpy, scipy, psycopg).
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python deps first so the layer is cached when only app code changes.
COPY requirements.txt .
RUN pip install -r requirements.txt

# Copy app source.
COPY backend ./backend
COPY scripts ./scripts
COPY pyproject.toml .

EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
