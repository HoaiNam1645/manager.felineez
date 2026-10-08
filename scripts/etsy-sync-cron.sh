#!/usr/bin/env bash
# nh-media → feline Etsy order sync (cron safety net).
# Pushes PENDING/FAILED Etsy orders. Reads CRON_SECRET from .env.
# No-op while FELINE_SYNC_URL is empty. Installed in root crontab every 15 min.
cd /var/www/nh-media || exit 0
SECRET=$(grep '^CRON_SECRET=' .env | sed -E 's/^CRON_SECRET="?([^"]+)"?/\1/')
[ -z "$SECRET" ] && exit 0
curl -s -H "X-Cron-Secret: $SECRET" http://127.0.0.1:3030/api/export/sync-cron >/dev/null 2>&1
