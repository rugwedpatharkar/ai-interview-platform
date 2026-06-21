#!/bin/sh
# Render injects $PORT; bake it into the nginx server block, then hand off to supervisord
# (which runs the 4 Python services + nginx). Only ${PORT} is substituted so nginx's own
# $host / $proxy_* variables survive.
set -e

: "${PORT:=8080}"
export PORT

envsubst '${PORT}' < /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf

exec supervisord -c /etc/supervisord.conf
