#!/bin/sh
# Builds the prod image, serves it, and reads the Cache-Control nginx sends: the HTML is
# no-cache, a hashed bundle is immutable. usage: sh scripts/check-prod-headers.sh
set -eu
IMAGE="app-prod-headers:$$"
NAME="app-prod-headers-$$"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; docker rmi "$IMAGE" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker build -q --target prod -t "$IMAGE" . >/dev/null
docker run -d --name "$NAME" "$IMAGE" >/dev/null
header() { docker exec "$NAME" wget -qS -O /dev/null "http://127.0.0.1$1" 2>&1 | tr -d '\r' | sed -n 's/^ *[Cc]ache-[Cc]ontrol: //p'; }
for _ in 1 2 3 4 5 6 7 8 9 10; do docker exec "$NAME" wget -q -O /dev/null http://127.0.0.1/ 2>/dev/null && break; sleep 1; done

ASSET=$(docker exec "$NAME" sh -c 'ls /usr/share/nginx/html/assets/*.js | head -1' | sed 's#/usr/share/nginx/html##')
fail=0
expect() {
	got=$(header "$1")
	if [ "$got" = "$2" ]; then echo "ok   $1 -> $got"; else echo "FAIL $1 -> '$got' (want '$2')"; fail=1; fi
}
expect / "no-cache"
expect /index.html "no-cache"
expect "$ASSET" "public, max-age=31536000, immutable"
exit "$fail"
