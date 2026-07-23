# Backend image — serves BOTH the REST/app API and the MCP server.
# The two are deployed as separate Container Apps from this one image, each
# overriding the start command:
#   API:  uvicorn app.main:app        --host 0.0.0.0 --port 8000
#   MCP:  uvicorn mcp_server.server:app --host 0.0.0.0 --port 8100
FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /srv

# Install deps first (better layer caching). psycopg[binary] needs no system libs.
COPY pyproject.toml ./
COPY app ./app
COPY mcp_server ./mcp_server
COPY migrations ./migrations
COPY alembic.ini ./
COPY scripts ./scripts
RUN pip install --upgrade pip && pip install .

EXPOSE 8000
# Default command runs the REST API; the MCP Container App overrides it.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
