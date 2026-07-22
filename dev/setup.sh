#!/bin/sh
# exjsx dev-stack provisioner — idempotent. Run from anywhere:  sh dev/setup.sh
#
# Requires: docker. Optional env:
#   EXJSX_ULTRA_ZIP        path to elementor-ultra-mcp.zip (REQUIRED for deploys — the
#                          deploy endpoints live in that companion plugin)
#   EXJSX_ELEMENTOR_VER    Elementor version to pin (default 4.2.0; suite certified 4.1.4/4.2.0)
#   EXJSX_PORT             host port (default 8918; must match dev/docker-compose.yml)
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$DIR")"
PORT="${EXJSX_PORT:-8918}"
URL="http://localhost:$PORT"
VER="${EXJSX_ELEMENTOR_VER:-4.2.0}"
CLI="docker exec exjsx-dev-cli wp"

echo "== stack up"
docker compose -f "$DIR/docker-compose.yml" up -d

echo "== wait for WordPress files"
i=0; until docker exec exjsx-dev-cli test -f /var/www/html/wp-load.php 2>/dev/null; do
  i=$((i+1)); [ $i -gt 60 ] && { echo "wp files never appeared"; exit 1; }; sleep 2; done

echo "== core install (idempotent)"
if ! $CLI core is-installed 2>/dev/null; then
  $CLI core install --url="$URL" --title="exjsx dev" \
    --admin_user=admin --admin_password=exjsx-dev-admin --admin_email=dev@example.test --skip-email
fi
$CLI option update permalink_structure '/%postname%/' >/dev/null
$CLI rewrite flush >/dev/null 2>&1 || true

echo "== Elementor $VER"
$CLI plugin is-installed elementor 2>/dev/null || $CLI plugin install elementor --version="$VER"
$CLI plugin activate elementor >/dev/null 2>&1 || true

echo "== elementor-ultra companion plugin"
if $CLI plugin is-installed elementor-ultra-mcp 2>/dev/null; then
  echo "   already installed"
elif [ -n "$EXJSX_ULTRA_ZIP" ] && [ -f "$EXJSX_ULTRA_ZIP" ]; then
  docker cp "$EXJSX_ULTRA_ZIP" exjsx-dev-cli:/tmp/ultra.zip
  $CLI plugin install /tmp/ultra.zip --activate
else
  echo "   !! EXJSX_ULTRA_ZIP not set — deploys will fail (no /elementor-ultra/v1 routes)"
fi
$CLI plugin activate elementor-ultra-mcp >/dev/null 2>&1 || true

echo "== mu-plugins writable (SEO runtime needs PHP-writable dir)"
docker exec -u root exjsx-dev-cli sh -c 'mkdir -p /var/www/html/wp-content/mu-plugins && chown -R 33:33 /var/www/html/wp-content/mu-plugins /var/www/html/wp-content/uploads'

echo "== fixtures"
docker cp "$DIR/fixtures/sample.mp4" exjsx-dev-wp:/var/www/html/wp-content/uploads/exjsx-sample.mp4
docker exec -u root exjsx-dev-wp chown 33:33 /var/www/html/wp-content/uploads/exjsx-sample.mp4
IMG_ID=$($CLI post list --post_type=attachment --name=exjsx-fixture-a --format=ids 2>/dev/null | tr -d ' ')
if [ -z "$IMG_ID" ]; then
  docker cp "$DIR/fixtures/sample-a.png" exjsx-dev-cli:/tmp/exjsx-fixture-a.png
  IMG_ID=$($CLI media import /tmp/exjsx-fixture-a.png --title=exjsx-fixture-a --porcelain)
fi
echo "   fixture image id: $IMG_ID"

echo "== app password"
APP_PASS=$($CLI user application-password create admin exjsx-dev --porcelain 2>/dev/null || true)
if [ -z "$APP_PASS" ]; then echo "   (app password 'exjsx-dev' exists — keeping the .env you already have)"; fi

echo "== .env"
if [ -n "$APP_PASS" ] || [ ! -f "$ROOT/.env" ]; then
  cat > "$ROOT/.env" <<EOF
WP_URL=$URL
WP_USER=admin
WP_APP_PASSWORD=${APP_PASS:-<run setup again after deleting the exjsx-dev app password>}
EXJSX_WPCLI=docker exec exjsx-dev-cli wp
EXJSX_FIXTURE_IMG=$IMG_ID
# integration-harness plumbing (DB snapshot/restore)
EXJSX_IT_DB_EXEC=docker exec exjsx-dev-db sh -c
EXJSX_IT_DB_AUTH=-uroot -prootpass
EXJSX_IT_DB_NAME=wp_exjsx
# optional (browser tiers): point at a playwright install + the elementor-ultra cli
#EXJSX_IT_PLAYWRIGHT=/path/to/node_modules/playwright/index.mjs
#EXJSX_ULTRA_CLI=/path/to/elementor-ultra/lib/cli.mjs
EOF
  echo "   wrote $ROOT/.env"
fi

echo "== done: $URL  (admin / exjsx-dev-admin)"
echo "   npm test           # offline suite"
echo "   EXJSX_IT=1 npm run test:it   # live suite against this stack"
