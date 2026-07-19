#!/usr/bin/env bash
# Ночной генератор баз для i7. Сам определяет число ядер.
# Использование:  bash tools/overnight.sh [минут] [уровни] [openingPlies]
#   bash tools/overnight.sh 480 student,club,medium,hard 4
set -e
cd "$(dirname "$0")/.."

# число логических ядер (Linux: nproc, macOS: sysctl)
CORES=$( (command -v nproc >/dev/null 2>&1 && nproc) || sysctl -n hw.ncpu 2>/dev/null || echo 4 )

MIN=${1:-480}                       # по умолчанию 8 часов
LEVELS=${2:-student,club,medium,hard}
OPEN=${3:-4}                        # случайных полуходов в дебюте (разнообразие)
STAMP=$(date +%Y%m%d-%H%M)
OUT="data/overnight-${STAMP}.json"

echo "ядер: $CORES · минут: $MIN · уровни: $LEVELS · дебют: $OPEN"
echo "вывод: $OUT"
node tools/selfplay.mjs --variant=classic4 --levels="$LEVELS" \
  --openingPlies="$OPEN" --minutes="$MIN" --concurrency="$CORES" --out="$OUT"

echo "готово: $OUT"
echo "разбор:  node tools/openbook.mjs $OUT --plies=6 --top=3 --min=50 --only=medium,hard"
