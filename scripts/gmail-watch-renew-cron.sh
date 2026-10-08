#!/usr/bin/env bash
# nh-media Gmail watch renewal. Reads CRON_SECRET from .env.
cd /var/www/nh-media || exit 0
SECRET=$(grep '^CRON_SECRET=' .env | sed -E 's/^CRON_SECRET="?([^"]+)"?/\1/')
[ -z "$SECRET" ] && exit 0
curl -s -H "X-Cron-Secret: $SECRET" http://127.0.0.1:3030/api/gmail-watch/renew >/dev/null 2>&1
