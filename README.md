# Spelling Glam!!!

A glam spelling bee game with the real words from the 2026 Scripps National Spelling Bee.
Every correct word adds more glam (lip gloss, blush, earrings, face gems, a tiara); a missed word means clown makeup.

**Download / play:** https://jheckma.github.io/spelling_glam/

## What's here

| Folder | What it is |
| --- | --- |
| `index.html`, `site/` | The download page (GitHub Pages). |
| `glam-bee/` | The game itself: plain HTML/JS, plays in any browser, installs on iPad with *Add to Home Screen*. |
| `mac-app/` | Wraps the game as a Mac app with Electron. GitHub builds it automatically (`.github/workflows/mac-app.yml`) and attaches `Spelling-Glam.dmg` to the **latest** release. |
| `Play Spelling Glam.bat` | Windows: opens the game in its own window. |
| `Share to iPad over WiFi.bat` | Windows: lets an iPad on the same Wi-Fi play from this PC. |

## Rebuilding the words and voice

```sh
cd glam-bee
pip install edge-tts imageio-ffmpeg
python build_words.py   # downloads the 2026 round results and looks up definitions
python build_voice.py   # records her lines and the pronouncer's words into audio/
```

Run the Mac app locally (on a Mac): `cd mac-app && npm install && npm start`.
