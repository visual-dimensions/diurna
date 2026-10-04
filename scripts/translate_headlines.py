"""Machine-translate new headlines in public/data/headlines.json.

Runs after fetch_headlines.py. Uses an open model locally – no API, no key:
M2M100 1.2B (Meta, MIT licence) converted to CTranslate2 int8, see
scripts/prepare_translation_model.sh.

- Only headlines without a translation for the target language are translated;
  fetch_headlines.py keeps a translation as long as the title is unchanged.
- Headlines already in the target language are skipped.
- Missing model or any error → headlines stay untranslated, nothing breaks.

    translate_headlines.py                 translate in place
    translate_headlines.py --sample 15     print sample translations, write nothing
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HEADLINES_FILE = ROOT / "public" / "data" / "headlines.json"
SOURCES_FILE = ROOT / "data" / "sources.json"
MODEL_DIR = Path(os.environ.get("TRANSLATION_MODEL_DIR", ROOT / ".models" / "m2m100_1.2B-ct2"))
TARGET = os.environ.get("TRANSLATION_TARGET", "en")
BEAM_SIZE = 4
BATCH_SIZE = 16

# Our `lang` codes that M2M100 names differently (all others are identical).
M2M_LANG = {"nb": "no", "nn": "no"}
# Languages M2M100 supports (subset relevant for Europe; see the model card for the full list).
M2M_SUPPORTED = set(
    "af ar az be bg bs ca cs cy da de el en es et fa fi fr ga gl he hr hu hy is it ka kk "
    "lb lt lv mk nl no pl pt ro ru sk sl sq sr sv tr uk".split()
)


def load_translator():
    import ctranslate2
    import sentencepiece as spm

    threads = os.cpu_count() or 4
    translator = ctranslate2.Translator(str(MODEL_DIR), device="cpu", compute_type="int8", intra_threads=threads)
    sp = spm.SentencePieceProcessor(model_file=str(MODEL_DIR / "sentencepiece.bpe.model"))
    return translator, sp


def translate(texts: list[tuple[str, str]], translator, sp) -> list[str]:
    """texts: (lang, text) pairs → translations into TARGET, same order."""
    sources = [[f"__{lang}__", *sp.encode(text, out_type=str), "</s>"] for lang, text in texts]
    prefix = [[f"__{TARGET}__"] for _ in texts]
    results = translator.translate_batch(
        sources, target_prefix=prefix, beam_size=BEAM_SIZE, max_batch_size=BATCH_SIZE, max_decoding_length=160
    )
    out = []
    for r in results:
        tokens = [t for t in r.hypotheses[0] if t != f"__{TARGET}__"]
        out.append(sp.decode(tokens).strip())
    return out


def plausible(source: str, result: str) -> bool:
    """Reject obvious failures: empty, unchanged, unknown tokens (⁇), or a wildly different length."""
    if not result or result.casefold() == source.casefold() or "⁇" in result:
        return False
    return 0.35 <= len(result) / max(1, len(source)) <= 3.0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sample", type=int, help="print N sample translations, write nothing")
    args = parser.parse_args()

    if not (MODEL_DIR / "model.bin").exists():
        print(f"translate: no model at {MODEL_DIR} – skipping")
        return 0

    data = json.loads(HEADLINES_FILE.read_text(encoding="utf-8"))
    langs = {s["id"]: s["lang"] for s in json.loads(SOURCES_FILE.read_text(encoding="utf-8"))}

    todo = []
    for sid, item in data["items"].items():
        lang = M2M_LANG.get(langs.get(sid, ""), langs.get(sid, ""))
        if lang == TARGET or lang not in M2M_SUPPORTED:
            continue
        if args.sample or TARGET not in item.get("translations", {}):
            todo.append((sid, lang, item["title"]))
    if args.sample:
        seen, picked = set(), []
        for t in todo:  # one per language first, for a varied sample
            if t[1] not in seen:
                seen.add(t[1])
                picked.append(t)
        todo = picked[: args.sample]
    if not todo:
        print("translate: nothing new")
        return 0

    started = time.monotonic()
    try:
        translator, sp = load_translator()
        loaded = time.monotonic()
        results = translate([(lang, title) for _, lang, title in todo], translator, sp)
    except Exception as exc:  # never break the fetch pipeline
        print(f"translate: failed ({type(exc).__name__}: {exc}) – skipping", file=sys.stderr)
        return 0

    done = 0
    for (sid, lang, title), result in zip(todo, results):
        if args.sample:
            print(f"[{lang}] {title}\n   → {result}")
            continue
        if plausible(title, result):
            data["items"][sid].setdefault("translations", {})[TARGET] = result
            done += 1

    print(
        f"translate: {len(todo)} headline(s), {sum(len(t) for *_, t in todo)} chars; "
        f"model load {loaded - started:.1f}s, translation {time.monotonic() - loaded:.1f}s"
    )
    if not args.sample and done:
        HEADLINES_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
