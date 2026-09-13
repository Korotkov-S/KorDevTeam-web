#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/deploy-common.sh"
[[ $# == 2 && "$1" =~ ^[a-f0-9]{40}$ ]] || fail 'Usage: build-content-migration.sh EXACT_SHA TOOL_IMAGE:EXACT_SHA'
[[ "$2" == *":$1" ]] || fail 'Tool image tag must equal checkout SHA'
image_valid "$2"
[[ "$(git -C "$REPO_ROOT" rev-parse HEAD)" == "$1" && -z "$(git -C "$REPO_ROOT" status --porcelain --untracked-files=all)" ]] || fail 'Clean exact checkout required'
docker build --target content-migration --build-arg "RELEASE_SHA=$1" -t "$2" "$REPO_ROOT"
