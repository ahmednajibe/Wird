#!/usr/bin/env bash
# Wird launcher: installs, builds if needed, opens the browser, runs the server.
cd "$(dirname "$0")"

wait_for_enter() {
  if [ -t 0 ]; then
    printf 'Press Enter to close.'
    # shellcheck disable=SC2162
    read -r _
  fi
}

fail() {
  echo "$1"
  wait_for_enter
  exit 1
}

if ! command -v node >/dev/null 2>&1; then
  fail "Wird needs Node.js 24 or newer. Install it from https://nodejs.org and run this again."
fi
NODE_MAJOR="$(node -e 'process.stdout.write(process.versions.node.split(".")[0])')"
if [ "$NODE_MAJOR" -lt 24 ]; then
  fail "Wird needs Node.js 24 or newer. Install it from https://nodejs.org and run this again."
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install || fail "npm install failed. See the messages above."
fi

if [ ! -f dist/server/index.js ] || [ ! -f dist/web/index.html ]; then
  echo "Building..."
  npm run build || fail "Build failed. See the messages above."
fi

PORT="${PORT:-4545}"
export PORT

# Run npm start in its own process group so cleanup kills the whole tree
# (npm -> sh -> node), not just the npm wrapper.
set -m
npm start &
SERVER_PID=$!

cleanup() {
  kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup INT TERM HUP EXIT

# Wait for the server to answer before opening the browser (up to 30 s).
health_ok() {
  if command -v curl >/dev/null 2>&1; then
    curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1
  else
    node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1
  fi
}

i=0
while [ "$i" -lt 60 ]; do
  if health_ok; then
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    fail "Wird failed to start. See the messages above."
  fi
  sleep 0.5
  i=$((i + 1))
done

URL="http://127.0.0.1:$PORT"
if [ "$(uname -s)" = "Darwin" ]; then
  open "$URL" 2>/dev/null || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 || true
else
  echo "Open $URL in your browser."
fi

echo "Wird is running at $URL"
echo "Close this window to quit."
wait "$SERVER_PID"
