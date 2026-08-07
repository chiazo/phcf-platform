#!/bin/bash
set -e

MODE=${1:-dev}

SERVER_DIR="./server"
WEB_DIR="./www"

cleanup() {
  echo "🧹 Cleaning up background processes..."
  if [ ! -z "$ASTRO_PID" ]; then
    kill "$ASTRO_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

kill -9 $(lsof -t -i:4321) 2>/dev/null || true
rm -rf "$WEB_DIR/.astro"

# ---------------------------------------
# DEV MODE
# ---------------------------------------
if [ "$MODE" = "dev" ]; then
  echo "🚧 Starting DEV mode..."

  export DEV_MODE=true
  export PUBLIC_PB_URL=http://localhost:8090
  export PUBLIC_API_URL=http://localhost:4321

  # Start PocketBase FIRST
  echo "📦 Starting PocketBase..."
  (cd "$SERVER_DIR" && go run export.go main.go serve) &
  PB_PID=$!

  # wait for PocketBase
  sleep 2

  # Start Astro
  echo "🌐 Starting Astro..."
  (cd "$WEB_DIR" && npm run dev) &
  ASTRO_PID=$!

  echo "Astro PID: $ASTRO_PID"
  echo "PocketBase PID: $PB_PID"

  wait

# ---------------------------------------
# PROD MODE
# ---------------------------------------
elif [ "$MODE" = "prod" ]; then
  echo "🚀 Building production release..."

  export DEV_MODE=false

  # build frontend
  (cd "$WEB_DIR" && npm run build)

  # copy dist
  rm -rf "$SERVER_DIR/dist"
  cp -r "$WEB_DIR/dist" "$SERVER_DIR/dist"

  # build backend
  (cd "$SERVER_DIR" && go build -o app main.go)

  # run server
  "$SERVER_DIR/app" serve

else
  echo "Usage: ./run.sh [dev|prod]"
  exit 1
fi