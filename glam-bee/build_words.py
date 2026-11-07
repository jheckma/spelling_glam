"""Builds words.js from the 2026 Scripps National Spelling Bee round results (spellingbee.com).

Run: python build_words.py
Definitions come from dictionaryapi.dev, then Wiktionary; lookups are cached in defs_cache.json,
so re-running is fast. Words with no definition found still play (the hint button says so).
"""
import html, json, re, sys, time, unicodedata, urllib.error, urllib.parse, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
CACHE = HERE / "defs_cache.json"
UA = {"User-Agent": "GlamBeeWordBuilder/1.0 (family spelling game)"}
ROUNDS = [str(i) for i in range(1, 21)] + ["spell-off"]
GROUPS = [  # list id, rounds it covers
    ("r1", {"1"}),
    ("quarter", {"4", "5", "6", "7"}),
    ("finals", {str(i) for i in range(9, 21)}),
    ("spelloff", {"spell-off"}),
]


def get(url):
    req = urllib.request.Request(url, headers=UA)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            if e.code != 429 and e.code < 500:
                raise  # a real "not found"
            time.sleep(3 * (attempt + 1))  # rate limited: back off and retry
    raise RuntimeError("gave up on " + url)


def round_words(r):
    page = re.sub(r"<script.*?</script>|<style.*?</style>", "", get(f"https://spellingbee.com/round-results/{r}"), flags=re.S)
    cells = [re.sub(r"<[^>]+>", "", html.unescape(c)).strip() for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", page, flags=re.S)]
    if r == "spell-off":
        return cells[2::2]
    if len(cells) < 5 or cells[3] != "Word":  # vocabulary rounds ask questions, not spellings
        return []
    body = cells[5:]
    return [body[i + 3] for i in range(0, len(body) - 4, 5)]


def clean(text):
    text = re.sub(r"<[^>]+>", "", html.unescape(text))
    text = re.sub(r"\s+", " ", text).strip()
    return text[0].lower() + text[1:] if text[:1].isupper() and not text[1:2].isupper() else text


POS = {"noun": "noun", "verb": "verb", "adjective": "adjective", "adverb": "adverb", "proper noun": "proper noun", "interjection": "interjection"}


def lookup(word):
    try:
        data = json.loads(get("https://api.dictionaryapi.dev/api/v2/entries/en/" + urllib.parse.quote(word)))
        m = data[0]["meanings"][0]
        return {"pos": m["partOfSpeech"], "def": clean(m["definitions"][0]["definition"])}
    except Exception:
        pass
    for title in dict.fromkeys([word, word.lower(), word.replace(" ", "_")]):
        try:
            data = json.loads(get("https://en.wiktionary.org/api/rest_v1/page/definition/" + urllib.parse.quote(title.replace(" ", "_"))))
        except Exception:
            continue
        for sense in data.get("en", []):
            for d in sense.get("definitions", []):
                text = clean(d.get("definition", ""))
                if text and not re.match(r"(plural|alternative|obsolete|archaic) (form|spelling)", text, re.I):
                    return {"pos": POS.get(sense.get("partOfSpeech", "").lower(), sense.get("partOfSpeech", "").lower()), "def": text}
    return {}


def main():
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    by_round = {}
    for r in ROUNDS:
        by_round[r] = round_words(r)
        print("round", r, len(by_round[r]))
    seen, lists = set(), {}
    for gid, rounds in GROUPS:
        entries = []
        for r in ROUNDS:
            if r not in rounds:
                continue
            for w in by_round[r]:
                key = w.lower()
                if not w or key in seen:
                    continue
                seen.add(key)
                if w not in cache and "--quick" not in sys.argv:  # --quick: only use definitions already looked up
                    cache[w] = lookup(w)
                    time.sleep(0.6)
                    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=0), encoding="utf-8")
                d = cache.get(w, {})
                entries.append({"w": w, **({"pos": d["pos"]} if d.get("pos") else {}), **({"def": d["def"][:260]} if d.get("def") else {})})
        lists[gid] = entries
        found = sum(1 for e in entries if e.get("def"))
        print(gid, len(entries), "words,", found, "with definitions")
    (HERE / "words.js").write_text("window.WORD_LISTS = " + json.dumps(lists, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")


main()
