#!/usr/bin/env bash
# Ночной генератор баз. Сам определяет число ядер. Пишет ПОЧАНКОВО, чтобы при
# обрыве сохранились завершённые куски (openbook умеет сливать несколько файлов).
#
#   bash tools/overnight.sh [всего_минут] [уровни] [openingPlies] [минут_на_чанк]
#   bash tools/overnight.sh 600 student,club,medium,hard 4 45
set -e
cd "$(dirname "$0")/.."
mkdir -p data

CORES=$( (command -v nproc >/dev/null 2>&1 && nproc) || sysctl -n hw.ncpu 2>/dev/null || echo 4 )
TOTAL=${1:-600}
LEVELS=${2:-student,club,medium,hard}
OPEN=${3:-4}
CHUNK=${4:-45}
STAMP=$(date +%Y%m%d-%H%M)
N=$(( (TOTAL + CHUNK - 1) / CHUNK ))

echo "ядер: $CORES · всего: ${TOTAL} мин · чанк: ${CHUNK} мин ($N шт) · уровни: $LEVELS · дебют: $OPEN"
for i in $(seq 1 "$N"); do
  OUT="data/overnight-${STAMP}-$(printf %02d "$i").json"
  echo "[$(date +%H:%M)] чанк $i/$N -> $OUT"
  SEED=$(( i * 10000000 ))   # разнос сидов, чтобы чанки не дублировали партии
  node tools/selfplay.mjs --variant=classic4 --levels="$LEVELS" \
    --openingPlies="$OPEN" --minutes="$CHUNK" --concurrency="$CORES" \
    --out="$OUT" --seed="$SEED" > "data/overnight-${STAMP}-$(printf %02d "$i").log" 2>&1 || echo "чанк $i завершился с ошибкой (продолжаю)"
done
echo "[$(date +%H:%M)] ГОТОВО. Слить и разобрать:"
echo "  node tools/openbook.mjs data/overnight-${STAMP}-*.json --plies=8 --top=3 --min=100 --only=medium,hard"
