#!/usr/bin/env bash
set -euo pipefail
[[ $# == 1 && -f "$1" ]] || exit 2
[[ "$(id -u)" == 0 && -d /run/systemd/system ]] || exit 2
# Load an unstarted copy: systemd itself interprets the production unit.
# No provider call, timer, environment-file read or collection is started.
test_unit_path="$(mktemp /run/systemd/system/kordevteam-seo-restart-test-XXXXXX.service)"
cleanup() {
  rm -- "$test_unit_path"
  systemctl daemon-reload
}
trap cleanup EXIT
install -m 0644 -- "$1" "$test_unit_path"
systemd-analyze verify "$test_unit_path"
systemctl daemon-reload
test_unit_name="${test_unit_path##*/}"
actual_restart="$(systemctl show "$test_unit_name" --property=Restart --value)"
actual_pid="$(systemctl show "$test_unit_name" --property=MainPID --value)"
[[ "$actual_pid" == 0 ]] || exit 1
if [[ "$actual_restart" != no ]]; then
  echo "A failed source would restart the entire free collection: Restart=$actual_restart" >&2
  exit 1
fi
echo 'Effective systemd policy: Restart=no; test unit never started.'
