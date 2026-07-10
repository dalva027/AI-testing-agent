# Backend + Playwright runner in one image.
FROM mcr.microsoft.com/playwright:v1.61.0-noble

# Python for the FastAPI app (noble/24.04 ships Python 3.12).
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps in a venv — noble marks the system interpreter externally managed.
COPY requirements.txt ./
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt
ENV PATH="/opt/venv/bin:$PATH"

# Node deps for the isolated test-runner workspace. @playwright/test is a
# devDependency, so no --omit=dev here.
COPY playwright_runner/package.json playwright_runner/package-lock.json ./playwright_runner/
RUN cd playwright_runner && npm ci

# Application code (specs are written into playwright_runner/tests at runtime).
COPY app ./app
COPY playwright_runner/playwright.config.js ./playwright_runner/

# Browsers preinstalled by the base image.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV HEADLESS=true

EXPOSE 8000

# Render injects PORT; default to 8000 for local `docker run`.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
