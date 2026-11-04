#!/bin/sh
set -eu
cd -- "$(dirname -- "$0")"
exec node --use-env-proxy lan.mjs
