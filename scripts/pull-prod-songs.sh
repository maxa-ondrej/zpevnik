#!/usr/bin/env bash
# Pull songs from the prod reviewer back into the repo.
#
# Why this exists: the prod reader bakes the songs corpus into its
# Docker image at build time. The prod reviewer writes edits into a
# named volume (`songs-data`) — those edits don't reach the reader
# until the reader image is rebuilt with the new corpus baked in.
# This script bridges the gap: pull the current prod corpus over
# HTTP from the reviewer, write it into ./songs/, let you review the
# diff, and commit. The next push to main triggers publish.yml which
# rebuilds the reader image with the curated content baked in.
#
# Usage:
#   REVIEWER_USER=admin REVIEWER_PASS=… ./scripts/pull-prod-songs.sh
#
# Optional env overrides:
#   REVIEWER_URL  — base URL of the reviewer (default: prod).
#                   Set to https://zpevnik-review-dev.majksa.net to pull
#                   from dev instead.
#
# Requires: curl, jq.

set -euo pipefail

BASE_URL="${REVIEWER_URL:-https://zpevnik-review.majksa.net}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SONGS_DIR="${REPO_ROOT}/songs"

: "${REVIEWER_USER:?REVIEWER_USER not set (HTTP Basic username for the reviewer)}"
: "${REVIEWER_PASS:?REVIEWER_PASS not set (HTTP Basic password for the reviewer)}"

command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

auth=( -u "${REVIEWER_USER}:${REVIEWER_PASS}" )
common=( --fail --silent --show-error --location --max-time 15 )

echo "Source: ${BASE_URL}"
echo "Target: ${SONGS_DIR}"
echo

# Fetch the corpus index. The reviewer writes index.json every time a
# PUT lands, so this is always the source of truth.
index_tmp="$(mktemp)"
trap 'rm -f "${index_tmp}"' EXIT
curl "${common[@]}" "${auth[@]}" "${BASE_URL}/songs/index.json" -o "${index_tmp}"

song_count="$(jq '.songs | length' "${index_tmp}")"
echo "Found ${song_count} songs in prod"
echo

# Per song: meta.json, song.cho, melody.json (melody is optional —
# not every song has a transcribed melody yet). Stave PNGs are NOT
# pulled — they come from the pipeline and the reviewer never edits
# them.
new_count=0
updated_count=0
unchanged_count=0
for i in $(seq 0 $((song_count - 1))); do
    id="$(jq -r ".songs[${i}].id" "${index_tmp}")"
    slug="$(jq -r ".songs[${i}].slug" "${index_tmp}")"
    dir="${id}-${slug}"
    target_dir="${SONGS_DIR}/${dir}"

    if [[ ! -d "${target_dir}" ]]; then
        mkdir -p "${target_dir}"
        new_count=$((new_count + 1))
        marker="NEW"
    else
        marker=" - "
    fi

    changed=0
    for f in meta.json song.cho melody.json; do
        url="${BASE_URL}/songs/${dir}/${f}"
        target="${target_dir}/${f}"
        tmp="${target}.tmp"
        if curl "${common[@]}" "${auth[@]}" "${url}" -o "${tmp}" 2>/dev/null; then
            if [[ -f "${target}" ]] && cmp -s "${tmp}" "${target}"; then
                rm -f "${tmp}"
            else
                mv "${tmp}" "${target}"
                changed=1
            fi
        else
            rm -f "${tmp}"
            # melody.json may legitimately not exist for some songs.
            if [[ "${f}" != "melody.json" ]]; then
                echo "  ! ${dir}/${f} — fetch failed" >&2
            fi
        fi
    done

    if [[ "${changed}" -eq 1 ]]; then
        echo "${marker}  ${dir}  (updated)"
        updated_count=$((updated_count + 1))
    else
        unchanged_count=$((unchanged_count + 1))
    fi
done

# Also persist the index file itself, so the reader's bundled
# /songs/index.json matches what the reviewer thinks is current.
cp "${index_tmp}" "${SONGS_DIR}/index.json"

echo
echo "Summary: ${new_count} new, ${updated_count} updated, ${unchanged_count} unchanged"
echo
echo "Repo diff (run \`git diff songs/\` for the full thing):"
(cd "${REPO_ROOT}" && git diff --stat songs/) || true
echo
echo "If the diff looks right, commit and push to trigger a reader rebuild:"
echo "  git add songs/ && git commit -m 'Songs: pull from prod' && git push"
