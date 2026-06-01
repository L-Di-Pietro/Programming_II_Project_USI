# Backend Docker image — Python 3.11 slim, FastAPI app.
# Built and run by docker-compose.yml.

# Pinned to bookworm (Debian 12) on purpose: the floating `python:3.11-slim` tag
# now resolves to trixie (Debian 13), where Playwright 1.49's `playwright install
# --with-deps chromium` (below) fails on renamed font packages. Don't un-pin.
FROM python:3.11-slim-bookworm

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

# Headless Chromium for server-side PDF rendering of the AI report
# (backend/analytics/report_pdf_render.py). `--with-deps` pulls the required
# system libraries; browsers install to a world-readable path so the app finds
# them regardless of the runtime user. This noticeably enlarges the image and
# build time — the trade-off for pixel-faithful PDF export.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

# Copy app source.
COPY backend ./backend
COPY scripts ./scripts
COPY pyproject.toml .

EXPOSE 8000

# Shell form (exec) so Railway's injected $PORT expands while keeping uvicorn as PID 1.
# docker-compose overrides this command, so local dev is unaffected.
CMD exec uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}
