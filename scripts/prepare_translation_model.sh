#!/usr/bin/env bash
# One-time preparation of the translation model (CI cache miss or local setup):
# download M2M100 1.2B (Meta, MIT licence) and convert it to CTranslate2 int8.
# Needs ~7 GB disk and ~8 GB RAM while converting; the result is ~1.3 GB.
set -euo pipefail
OUT="${TRANSLATION_MODEL_DIR:-.models/m2m100_1.2B-ct2}"
python -m pip install --quiet torch --index-url https://download.pytorch.org/whl/cpu
python -m pip install --quiet transformers sentencepiece ctranslate2
mkdir -p "$(dirname "$OUT")"
ct2-transformers-converter --model facebook/m2m100_1.2B --output_dir "$OUT" \
  --quantization int8 --copy_files sentencepiece.bpe.model --force
rm -rf ~/.cache/huggingface  # the 5 GB source weights are no longer needed
du -sh "$OUT"
