#!/bin/sh
set -eu

lead_temp_root="${LEAD_TEMP_ROOT:-/tmp/kordev-leads}"
if [ "$lead_temp_root" != /tmp/kordev-leads ]; then
  echo 'LEAD_TEMP_ROOT must be /tmp/kordev-leads' >&2
  exit 1
fi
if [ ! -d "$lead_temp_root" ] || [ -L "$lead_temp_root" ]; then
  echo 'Private lead temp root is missing or unsafe' >&2
  exit 1
fi
if [ "$(stat -c '%u:%a' "$lead_temp_root")" != '1000:700' ]; then
  echo 'Private lead temp root must be owned by uid 1000 with mode 0700' >&2
  exit 1
fi
exec "$@"
