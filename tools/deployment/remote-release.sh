#!/usr/bin/env bash
set -Eeuo pipefail

action="${1:-}"
deploy_root="${2:-}"
release_id="${3:-}"
observability="${4:-false}"

if [[ "$action" != "deploy" && "$action" != "rollback" ]]; then
  echo "action은 deploy 또는 rollback이어야 합니다." >&2
  exit 2
fi
if [[ ! "$deploy_root" =~ ^/[A-Za-z0-9._/-]+$ || "$deploy_root" == "/" || "$deploy_root" =~ (^|/)\.\.?(/|$) ]]; then
  echo "안전한 절대 배포 경로가 필요합니다." >&2
  exit 2
fi
if [[ ! "$release_id" =~ ^[0-9a-f]{40}$ ]]; then
  echo "40자리 Git commit SHA가 필요합니다." >&2
  exit 2
fi
if [[ "$observability" != "true" && "$observability" != "false" ]]; then
  echo "observability는 true 또는 false여야 합니다." >&2
  exit 2
fi

releases_dir="$deploy_root/releases"
shared_dir="$deploy_root/shared"
backups_dir="$deploy_root/backups"
env_file="$shared_dir/.env.demo"
archive="/tmp/techzone-$release_id.tar.gz"

mkdir -p "$releases_dir" "$shared_dir" "$backups_dir"
if [[ ! -f "$env_file" ]]; then
  echo "$env_file 파일이 없습니다. 서버에서 먼저 demo:env를 실행하세요." >&2
  exit 1
fi

compose() {
  local release_dir="$1"
  shift
  local args=(
    docker compose
    --project-name techzone-demo
    --env-file "$env_file"
    -f "$release_dir/docker-compose.yml"
    -f "$release_dir/infra/docker/compose.demo.yml"
  )
  if [[ "$observability" == "true" ]]; then
    args+=(--profile observability)
  fi
  "${args[@]}" "$@"
}

smoke() {
  local release_dir="$1"
  node "$release_dir/tools/deployment/smoke.mjs" --env="$env_file"
}

activate() {
  local release_dir="$1"
  (
    cd "$release_dir"
    node tools/deployment/preflight.mjs --env="$env_file"
  ) || return 1
  compose "$release_dir" up -d --build --remove-orphans || return 1
  smoke "$release_dir"
}

resolve_release_link() {
  local link="$1"
  local target
  target="$(readlink -f "$link" 2>/dev/null || true)"
  if [[ -n "$target" && "$target" == "$releases_dir/"* && -d "$target" ]]; then
    printf '%s' "$target"
  fi
}

set_release_link() {
  local name="$1"
  local target="$2"
  local temporary="$deploy_root/.${name}-$release_id"
  ln -sfn "$target" "$temporary"
  mv -Tf "$temporary" "$deploy_root/$name"
}

backup_database() {
  local release_dir="$1"
  local timestamp
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  if compose "$release_dir" ps --status running postgres --quiet | grep -q .; then
    compose "$release_dir" exec -T postgres pg_dumpall -U canvas | gzip -9 > "$backups_dir/$timestamp.sql.gz"
  fi
}

if [[ "$action" == "rollback" ]]; then
  current_release="$(resolve_release_link "$deploy_root/current")"
  previous_release="$(resolve_release_link "$deploy_root/previous")"
  if [[ -z "$current_release" || -z "$previous_release" ]]; then
    echo "롤백할 현재/이전 릴리스가 없습니다." >&2
    exit 1
  fi

  backup_database "$current_release"
  activate "$previous_release"
  set_release_link previous "$current_release"
  set_release_link current "$previous_release"
  echo "rollback_complete release=$(basename "$previous_release")"
  exit 0
fi

if [[ ! -f "$archive" ]]; then
  echo "$archive 배포 아카이브가 없습니다." >&2
  exit 1
fi

release_dir="$releases_dir/$release_id"
if [[ -e "$release_dir" ]]; then
  echo "이미 존재하는 릴리스입니다: $release_id" >&2
  exit 1
fi
mkdir "$release_dir"
tar --extract --gzip --file "$archive" --directory "$release_dir" --no-same-owner
ln -s "$env_file" "$release_dir/.env.demo"
rm -f "$archive"

current_release="$(resolve_release_link "$deploy_root/current")"
if [[ -n "$current_release" ]]; then
  backup_database "$current_release"
fi

if ! activate "$release_dir"; then
  echo "새 릴리스 검증 실패, 이전 릴리스를 복구합니다." >&2
  if [[ -n "$current_release" ]]; then
    activate "$current_release"
  fi
  exit 1
fi

if [[ -n "$current_release" && "$current_release" != "$release_dir" ]]; then
  set_release_link previous "$current_release"
fi
set_release_link current "$release_dir"
echo "deployment_complete release=$release_id"
