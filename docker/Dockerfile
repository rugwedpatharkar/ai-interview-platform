# Generic image for any Python service in this monorepo (build context = repo root).
#   docker build -f docker/Dockerfile --build-arg SERVICE=admin -t ip-admin .
# admin + ai-agents run `app.main` (the default CMD); the MCP servers override the
# compose `command:` to `app.server`.
FROM python:3.12-slim

ARG SERVICE
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app

# Shared library first — its own layer, cached across all service builds.
COPY lib ./lib
RUN pip install --no-cache-dir ./lib

# Then the target service. (COPY all of src for builder portability; install just one.)
COPY src ./src
RUN pip install --no-cache-dir ./src/${SERVICE}

WORKDIR /app/src/${SERVICE}
CMD ["python", "-m", "app.main"]
