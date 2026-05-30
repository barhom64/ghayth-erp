#!/usr/bin/env bash
set -euo pipefail

APP_DOMAIN="${1:-erp.door.sa}"
APP_DIR="/opt/ghayth-erp"
ARCHIVE_URL="${GHAYTH_ARCHIVE_URL:?Set GHAYTH_ARCHIVE_URL to a downloadable .tar.gz or .zip archive URL}"
TMP_DIR="$(mktemp -d)"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root."
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl unzip tar

rm -rf "${APP_DIR}"
mkdir -p "${APP_DIR}"

case "${ARCHIVE_URL}" in
  *.zip)
    curl -L "${ARCHIVE_URL}" -o "${TMP_DIR}/repo.zip"
    unzip -q "${TMP_DIR}/repo.zip" -d "${TMP_DIR}/repo"
    FIRST_DIR="$(find "${TMP_DIR}/repo" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
    cp -a "${FIRST_DIR}/." "${APP_DIR}/"
    ;;
  *.tar.gz|*.tgz)
    curl -L "${ARCHIVE_URL}" -o "${TMP_DIR}/repo.tar.gz"
    tar -xzf "${TMP_DIR}/repo.tar.gz" -C "${TMP_DIR}"
    FIRST_DIR="$(find "${TMP_DIR}" -mindepth 1 -maxdepth 1 -type d ! -name repo | head -n 1)"
    cp -a "${FIRST_DIR}/." "${APP_DIR}/"
    ;;
  *)
    echo "Unsupported archive URL. Use .zip or .tar.gz"
    exit 1
    ;;
esac

bash "${APP_DIR}/deploy/setup-hostinger-vps.sh" "${APP_DOMAIN}"
