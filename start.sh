#!/bin/bash
set -e
cd "$(dirname "$0")"
[ -f .env ] || cp .env.example .env
python3 -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8080}"
