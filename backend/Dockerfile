# Consolidated backend image for Render (one container, one public $PORT).
# Runs admin + ai-agents + mcp-data + mcp-capability behind nginx via supervisord.
# Build context = backend/.  Local multi-container dev still uses docker/Dockerfile +
# docker-compose.yml (one container per service); this image is the single-box deploy.
#
#   docker build -f Dockerfile -t aptura-backend .
#   docker run -e PORT=8080 -e MONGO_URI=… -e REDIS_URL=… -e RABBITMQ_URL=… \
#              -e JWT_SECRET=… -e GEMINI_API_KEY=… -e CORS_ALLOW_ORIGIN=… -p 8080:8080 aptura-backend
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app

# nginx (reverse proxy), supervisor (process manager), gettext-base (envsubst for $PORT).
RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx supervisor gettext-base \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/nginx/sites-enabled/default

# Shared lib first — cached layer across rebuilds.
COPY lib ./lib
RUN pip install --no-cache-dir ./lib

# All four services in one image.
COPY services ./services
RUN pip install --no-cache-dir \
    ./services/admin \
    ./services/ai-agents \
    ./services/mcp-data \
    ./services/mcp-capability

# Process + proxy config.
COPY deploy/render/supervisord.conf /etc/supervisord.conf
COPY deploy/render/nginx.conf.template /etc/nginx/nginx.conf.template
COPY deploy/render/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Render overrides PORT at runtime; default for local `docker run`.
ENV PORT=8080
EXPOSE 8080
CMD ["/entrypoint.sh"]
