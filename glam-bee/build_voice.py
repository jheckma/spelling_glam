"""Generates her voice clips into audio/ and writes voice.js.

Needs: pip install edge-tts imageio-ffmpeg   (edge-tts uses Microsoft's online speech service.)
Safe to re-run: existing clips are kept, so delete audio/ after changing VOICE or the sound settings.
"""
import asyncio, json, re, subprocess, sys, unicodedata
from pathlib import Path
import edge_tts, imageio_ffmpeg

VOICE = "en-US-AnaNeural"  # her lines: a bright, bubbly young girl's voice
CLEAR = "en-US-JennyNeural"  # the pronouncer: spelling words, letters and definitions, in a calm, clear voice
# Dead air at both ends is trimmed so clips run straight into each other; a touch of sparkle (presence) and even loudness.
def polish(word):
    trim = "silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.02"
    lead = "adelay=120:all=1," if word else ""  # short breath so a word never runs on from the line before it
    return (f"{trim},areverse,{trim},areverse,{lead}highpass=f=90,equalizer=f=3000:t=q:w=1.0:g=3,"
            f"acompressor=threshold=-22dB:ratio=3:attack=5:release=80:makeup=2,loudnorm=I={-12 if word else -14}:TP=-1.5")

# (speech rate, pitch): cheers are fast and extra peppy; spelling words stay a little slower so they are easy to hear.
CHEER = ("+12%", "+12Hz")
WORD = ("-18%", "+0Hz")  # spelling words: slow and clear
CLEARLINE = ("-10%", "+0Hz")  # letters and definitions
HERE = Path(__file__).resolve().parent
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

ONES = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty".split()
LINES = {
    "intro1": "Your word, queen:",
    "intro2": "Okay bestie, spell this!",
    "intro3": "Ooh, your word is:",
    "intro4": "Ready, gorgeous? Your word:",
    "bark1": "Time to glam up!",
    "bark2": "Slay, queen!",
    "bark3": "Bedazzling!",
    "bark4": "Let's get sparkly!",
    "bark5": "Mirror, mirror, help me spell!",
    "bark6": "Glitter is totally a color!",
    "bark7": "Lip gloss? Check! Spelling? Let's go!",
    "bark8": "We are so fabulous!",
    "urgent1": "Hurry! The party's starting!",
    "urgent2": "Quick, quick, quick!",
    "urgent3": "Eek! My makeup is melting!",
    "correct1": "Slay, queen! That's correct!",
    "correct2": "Bedazzling! Correct!",
    "correct3": "Correct! Time to glam up!",
    "correct4": "Yasss! That is correct!",
    "correct5": "Correct! So sparkly!",
    "correct6": "Gorgeous! That is correct!",
    "wipe": "Byeee, clown makeup!",
    "wrong": "Oh no! Clown makeup! It's spelled:",
    "time": "Too slow! Honk honk! It's spelled:",
    "win": "Bedazzling! You are totally glammed up! Slay, queen! You are the champion!",
    "out": "Oh no, I look like a clown! Let's wipe it off and practice!",
    "title": "Spelling Glam! Time to glam up!",
    "test": "Hi bestie! Time to glam up! Your first word is: sparkle.",
    "newround": "New round! Stay sparkly!",
    **{f"round{i + 1}": f"Round {w}!" for i, w in enumerate(ONES)},
    **{f"letter{c}": f"{c.upper()}." for c in "abcdefghijklmnopqrstuvwxyz"},
}


def norm(s):
    s = unicodedata.normalize("NFD", s)
    return re.sub(r"[^a-z]", "", "".join(c for c in s if not unicodedata.combining(c)).lower())


def masked(text, forms):
    for f in forms:
        low = f.lower()
        stem = low[:-2] if len(low) >= 5 else low
        text = re.sub(r"\b" + re.escape(stem) + r"[a-z]*", "blank", text, flags=re.I)
    return re.sub(r"^—\s*", "", text)


async def render(text, path, style, sem, failed):
    if path.exists() and path.stat().st_size > 500:
        return
    async with sem:
        for attempt in range(5):
            try:
                raw = b""
                async for chunk in edge_tts.Communicate(text, VOICE if style is CHEER else CLEAR, rate=style[0], pitch=style[1]).stream():
                    if chunk["type"] == "audio":
                        raw += chunk["data"]
                proc = await asyncio.create_subprocess_exec(
                    FFMPEG, "-y", "-loglevel", "error", "-i", "pipe:0", "-af", polish(style is WORD), "-ac", "1", "-ar", "24000",
                    "-b:a", "56k", str(path), stdin=subprocess.PIPE, stderr=subprocess.PIPE)
                _, err = await proc.communicate(raw)
                if proc.returncode:
                    raise RuntimeError(err.decode()[:200])
                return
            except Exception as e:
                last = e
                await asyncio.sleep(2 * (attempt + 1))
        failed.append((text, str(last)))


async def main():
    src = (HERE / "words.js").read_text(encoding="utf-8")
    lists = json.loads(src.split("=", 1)[1].strip().rstrip(";"))
    words, defs = {}, {}
    for entries in lists.values():
        for e in entries:
            words.setdefault(norm(e["w"]), e["w"])
            if e.get("def"):
                defs[norm(e["w"])] = masked(e["def"], [e["w"], *e.get("alt", [])])
    for d in ("lines", "words", "defs"):
        (HERE / "audio" / d).mkdir(parents=True, exist_ok=True)
    jobs = [(t, HERE / "audio/lines" / f"{k}.mp3", CLEARLINE if k.startswith("letter") else CHEER) for k, t in LINES.items()]
    jobs += [(f"{t}.", HERE / "audio/words" / f"w_{k}.mp3", WORD) for k, t in words.items()]  # the game plays each word twice
    jobs += [(t, HERE / "audio/defs" / f"w_{k}.mp3", CLEARLINE) for k, t in defs.items()]
    sem, failed = asyncio.Semaphore(8), []
    tasks = [asyncio.create_task(render(t, p, st, sem, failed)) for t, p, st in jobs]
    for i, task in enumerate(asyncio.as_completed(tasks), 1):
        await task
        if i % 100 == 0:
            print(i, "/", len(jobs), flush=True)
    (HERE / "voice.js").write_text(
        "window.VOICE_LINES = " + json.dumps(LINES, ensure_ascii=False) + ";\nwindow.VOICE_DEFS = " + json.dumps(defs, ensure_ascii=False) + ";\n",
        encoding="utf-8")
    print("done", len(jobs), "failed", len(failed), failed[:20])
    sys.exit(1 if failed else 0)


asyncio.run(main())
