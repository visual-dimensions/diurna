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
import re
import sys
import time
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HEADLINES_FILE = ROOT / "public" / "data" / "headlines.json"
SOURCES_FILE = ROOT / "data" / "sources.json"
MODEL_DIR = Path(os.environ.get("TRANSLATION_MODEL_DIR", ROOT / ".models" / "m2m100_1.2B-ct2"))
TARGET = os.environ.get("TRANSLATION_TARGET", "en")
BEAM_SIZE = 4
BATCH_SIZE = 16

# Our `lang` codes that M2M100 names differently (all others are identical).
M2M_LANG = {"nb": "no", "nn": "no", "zh-Hant": "zh"}
# Languages M2M100 supports but translates too badly to show (invented sentences in tests):
# skipped, and translations already stored for them are removed.
UNRELIABLE = {"ka", "hy"}
# All 100 languages of M2M100 (model card, facebook/m2m100_1.2B).
M2M_SUPPORTED = set(
    "af am ar ast az ba be bg bn br bs ca ceb cs cy da de el en es et fa ff fi fr fy ga gd gl gu ha he hi "
    "hr ht hu hy id ig ilo is it ja jv ka kk km kn ko lb lg ln lo lt lv mg mk ml mn mr ms my ne nl no ns "
    "oc or pa pl ps pt ro ru sd si sk sl so sq sr ss su sv sw ta th tl tn tr uk ur uz vi wo xh yi yo zh zu".split()
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


def repetitive(text: str) -> bool:
    """The model sometimes loops ("Fire Crisis: Fire Crisis: …", "R.R.R.R…").
    Any 2–4-word phrase four times, mostly repeated word pairs, or a short character run six times."""
    words = re.findall(r"\w+", text.casefold())
    for n in (2, 3, 4):
        grams = Counter(tuple(words[i : i + n]) for i in range(len(words) - n + 1))
        if grams and max(grams.values()) >= 4:
            return True
    pairs = list(zip(words, words[1:]))
    if len(pairs) >= 6 and len(set(pairs)) / len(pairs) < 0.6:
        return True
    return re.search(r"(.{1,6}?)\1{5,}", text) is not None


def plausible(source: str, result: str) -> bool:
    """Reject obvious failures: empty, unchanged, unknown tokens (⁇), a wildly different length, or a loop."""
    if not result or result.casefold() == source.casefold() or "⁇" in result:
        return False
    return 0.35 <= len(result) / max(1, len(source)) <= 3.0 and not repetitive(result)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sample", type=int, help="print N sample translations, write nothing")
    args = parser.parse_args()

    if not (MODEL_DIR / "model.bin").exists():
        print(f"translate: no model at {MODEL_DIR} – skipping")
        return 0

    data = json.loads(HEADLINES_FILE.read_text(encoding="utf-8"))
    langs = {s["id"]: s["lang"] for s in json.loads(SOURCES_FILE.read_text(encoding="utf-8"))}

    todo, removed = [], 0
    for sid, item in data["items"].items():
        lang = M2M_LANG.get(langs.get(sid, ""), langs.get(sid, ""))
        stored = item.get("translations", {}).get(TARGET)
        # Also drops translations stored before a check existed; they are tried again below.
        if stored is not None and (lang in UNRELIABLE or not plausible(item["title"], stored)):
            del item["translations"][TARGET]
            removed += 1
        if lang == TARGET or lang not in M2M_SUPPORTED or lang in UNRELIABLE:
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
    if removed and not args.sample:
        print(f"translate: removed {removed} unreliable or implausible translation(s)")
        HEADLINES_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
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
            print(f"[{lang}] {title}\n   → {result}{'' if plausible(title, result) else '   (rejected)'}")
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
