'use strict';
const $ = id => document.getElementById(id);

/* ---------- Word helpers ---------- */
// Every word asked at the 2026 Scripps National Spelling Bee (spellingbee.com round results), grouped by stage.
const LISTS = [
  { id: 'r1', name: 'Round 1 · Preliminaries', note: 'hard' },
  { id: 'quarter', name: 'Quarterfinals', note: 'rounds 4–7 · harder' },
  { id: 'finals', name: 'Semifinals & Finals', note: 'rounds 9–18 · expert' },
  { id: 'spelloff', name: 'Championship Spell-off', note: 'the final showdown' },
  { id: 'all', name: 'Every 2026 word', note: 'the whole bee' },
];
const DIFFS = {
  practice: { name: 'Practice Bee', note: '5 hearts · no clock · Backspace allowed', lives: 5, pace: 0, erase: true },
  school: { name: 'School Bee', note: '3 hearts · on the clock · no changing letters', lives: 3, pace: 1, erase: false },
  champion: { name: 'Championship Bee', note: 'One miss and you are out · faster clock', lives: 1, pace: 0.65, erase: false },
};
const LENGTHS = [10, 20, 0];
const ROUND_SIZE = 5;
const LOOKS = [
  { id: 'brunette', name: 'Brown hair', skin: '#f6caa8', shade: '#dfa07c', hair: '#5a3622', hairHi: '#91603e', eye: '#6b4424' },
  { id: 'blonde', name: 'Blonde', skin: '#ffdcc2', shade: '#e9b18d', hair: '#e2b148', hairHi: '#ffe39a', eye: '#3f7fc4' },
  { id: 'curls', name: 'Black curls', skin: '#b0734b', shade: '#8c5434', hair: '#211612', hairHi: '#55392b', eye: '#3a2414', curly: true },
  { id: 'red', name: 'Red hair', skin: '#ffe2cf', shade: '#efb595', hair: '#c4461d', hairHi: '#f2843f', eye: '#3f8a4f' },
  { id: 'black', name: 'Black hair', skin: '#ecbb8e', shade: '#cf9a6c', hair: '#17110f', hairHi: '#463b40', eye: '#2a1a10' },
  { id: 'coils', name: 'Dark curls', skin: '#73442a', shade: '#55301c', hair: '#120c0a', hairHi: '#433028', eye: '#2a160c', curly: true },
];
// What she gets for each correct word, in order. "at" is where the sparkles land on the portrait.
const ITEMS = [
  { name: 'Lip gloss', at: [0, 60] },
  { name: 'Blush', at: [-56, 38] },
  { name: 'Eyeshadow', at: [-38, -22] },
  { name: 'Lashes & liner', at: [38, -12] },
  { name: 'Earrings', at: [92, 52] },
  { name: 'Pearl necklace', at: [0, 182] },
  { name: 'Hair bow', at: [74, -118] },
  { name: 'Face gems', msg: 'BEDAZZLING! FACE GEMS!', at: [70, 8] },
  { name: 'Hair glitter', at: [-104, 40] },
  { name: 'Star clips', at: [-52, -100] },
  { name: 'Sequin top', at: [0, 218] },
  { name: 'Tiara', msg: 'FULL GLAM! TIARA!', at: [0, -150] },
];

// Letters only, no accents: players type "cour d'honneur" as COURDHONNEUR; spaces and hyphens are filled in for them.
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const forms = e => [e.w, ...(e.alt || [])];
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Hide the answer when a definition happens to contain the word or a close relative of it.
function maskDef(text, e) {
  let out = text;
  for (const f of forms(e)) {
    const lower = f.toLowerCase();
    const stem = lower.length >= 5 ? lower.slice(0, lower.length - 2) : lower;
    out = out.replace(new RegExp('\\b' + stem.replace(/[^\p{L}' -]/gu, '') + '[a-z]*', 'gi'), '▢▢▢');
  }
  return out;
}

/* ---------- Saved progress (optional; game works without it) ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('gb_' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('gb_' + k, JSON.stringify(v)); } catch { /* private window */ } },
};
let practice = store.get('practice', {}); // norm(word) -> entry, for words the player struggled with
const savePractice = () => store.set('practice', practice);

/* ---------- Her voice: pre-recorded clips, browser speech only if a clip fails ---------- */
const tts = window.speechSynthesis || null;
const voiceEl = new Audio();
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
let speakToken = 0, speaking = false, keepAlive = null, wordOn = false; // wordOn: the pronouncer is saying a word or definition
const pick = (prefix, n) => prefix + (1 + Math.floor(Math.random() * n));
const line = id => ({ src: `audio/lines/${id}.mp3`, text: (window.VOICE_LINES || {})[id] || '' });
const wordClip = e => ({ src: `audio/words/w_${norm(e.w)}.mp3`, text: e.w });
// The pronouncer says the word, pauses, and says it again, as in a real bee.
const wordTwice = e => [wordClip(e), { pause: 700 }, wordClip(e)];
const roundClip = n => line(n <= 20 ? 'round' + n : 'newround');
const letterClips = e => [...norm(e.w)].map(c => line('letter' + c));
const defClip = e => {
  const text = (window.VOICE_DEFS || {})[norm(e.w)];
  return text ? { src: `audio/defs/w_${norm(e.w)}.mp3`, text } : null;
};

function stopVoice() {
  speakToken++; speaking = false; wordOn = false;
  voiceEl.onended = voiceEl.onerror = null;
  voiceEl.pause();
  if (tts) tts.cancel();
}

// Plays clips in order, then calls onDone exactly once.
function speak(clips, onDone) {
  stopVoice();
  const token = speakToken;
  speaking = true;
  const finish = () => { if (token !== speakToken) return; speaking = false; wordOn = false; if (onDone) onDone(); };
  let fellBack = false;
  const fallback = i => {
    if (fellBack) return; // a failed clip reports through both the error event and play()
    fellBack = true;
    const text = clips.slice(i).map(c => c.text || '').join(' ').trim();
    if (!tts || !text) return finish();
    keepAlive = new SpeechSynthesisUtterance(text);
    keepAlive.lang = 'en-US';
    keepAlive.rate = 0.8; keepAlive.pitch = 1.1;
    keepAlive.onend = keepAlive.onerror = finish;
    tts.speak(keepAlive);
    setTimeout(finish, 1500 + text.length * 130); // some browsers never fire the end event
  };
  const play = i => {
    if (token !== speakToken) return;
    if (i >= clips.length) return finish();
    if (clips[i].pause) { setTimeout(() => play(i + 1), clips[i].pause); return; }
    wordOn = /\/(words|defs)\//.test(clips[i].src);
    voiceEl.onended = () => play(i + 1);
    voiceEl.onerror = () => { voiceEl.onerror = voiceEl.onended = null; fallback(i); };
    voiceEl.src = clips[i].src;
    const started = voiceEl.play();
    if (started) started.catch(err => { if (token === speakToken && err.name !== 'AbortError') fallback(i); });
  };
  play(0);
}

/* ---------- Sound effects ---------- */
let audio = null, soundOn = store.get('sound', true);
function tone(from, to, dur, type = 'square', vol = 0.06, delay = 0) {
  if (!audio || !soundOn || audio.state !== 'running') return; // while suspended, sounds would pile up and all play at once
  const t = audio.currentTime + delay, o = audio.createOscillator(), g = audio.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(audio.destination);
  o.start(t);
  o.stop(t + dur);
}
function noise(dur, vol, cutoff, delay = 0) {
  if (!audio || !soundOn || audio.state !== 'running') return;
  const t = audio.currentTime + delay, len = Math.ceil(audio.sampleRate * dur);
  const buf = audio.createBuffer(1, len, audio.sampleRate), data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
  src.buffer = buf;
  f.type = 'lowpass'; f.frequency.value = cutoff;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(audio.destination);
  src.start(t);
}
// Browsers only allow audio to start from a click or key press.
function unlockAudio() {
  if (!audio && (window.AudioContext || window.webkitAudioContext)) {
    audio = new (window.AudioContext || window.webkitAudioContext)();
    audio.onstatechange = startMusic;
  }
  // iPad Safari reports 'interrupted' after a phone call, Siri or switching apps.
  if (audio && audio.state !== 'running' && audio.state !== 'closed') audio.resume().catch(() => {});
  startMusic();
}
// iOS only counts a tap as permission for sound when the finger lifts, so retry on every tap.
addEventListener('touchend', () => { if (!audio || audio.state !== 'running') unlockAudio(); }, { passive: true });

/* ---------- Background music: a bubbly pop loop composed live, so there are no music files ---------- */
let musicOn = store.get('music', true), musicBus = null, musicLevel = -1, musicNext = 0, musicStep = 0;
const STEP = 60 / 112 / 4; // sixteenth notes at 112 beats per minute
// [bass note, chord intervals]: C  G  Am  F, twice
const CHORDS = [[36, [0, 4, 7]], [31, [0, 4, 7]], [33, [0, 3, 7]], [29, [0, 4, 7]], [36, [0, 4, 7]], [31, [0, 4, 7]], [33, [0, 3, 7]], [29, [0, 4, 7]]];
const BASSLINE = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 0];
const MELODY = [76, 0, 79, 0, 84, 0, 79, 0, 81, 0, 79, 0, 76, 0, 0, 0, 74, 0, 76, 0, 79, 0, 0, 76, 74, 0, 72, 0, 74, 0, 0, 0,
  76, 0, 79, 0, 84, 0, 83, 0, 81, 0, 79, 0, 81, 0, 0, 0, 77, 0, 76, 0, 74, 0, 76, 0, 72, 0, 0, 0, 0, 0, 0, 0];
const hz = m => 440 * Math.pow(2, (m - 69) / 12);

function musicNote(m, t, dur, type, vol, cutoff) {
  const o = audio.createOscillator(), f = audio.createBiquadFilter(), g = audio.createGain();
  o.type = type; o.frequency.value = hz(m);
  f.type = 'lowpass'; f.frequency.value = cutoff;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f).connect(g).connect(musicBus);
  o.start(t); o.stop(t + dur + 0.02);
}
function musicDrum(t, kind) {
  if (kind === 'kick') {
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(musicBus);
    o.start(t); o.stop(t + 0.2);
    return;
  }
  const dur = kind === 'clap' ? 0.14 : 0.035, len = Math.ceil(audio.sampleRate * dur);
  const buf = audio.createBuffer(1, len, audio.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
  src.buffer = buf;
  f.type = kind === 'clap' ? 'bandpass' : 'highpass';
  f.frequency.value = kind === 'clap' ? 1500 : 8000;
  g.gain.setValueAtTime(kind === 'clap' ? 0.18 : 0.05, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(musicBus);
  src.start(t);
}
function scheduleStep(n, t) {
  const inBar = n % 16, bar = Math.floor(n / 16), [root, chord] = CHORDS[bar % CHORDS.length];
  const section = Math.floor(bar / 8) % 4; // 0 sparse, 1 adds sparkle arpeggio, 2 adds melody, 3 full
  if (inBar === 0) for (const iv of chord) {
    musicNote(root + 24 + iv, t, STEP * 16, 'triangle', 0.04, 1400);
    musicNote(root + 36 + iv, t, STEP * 16, 'sine', 0.02, 2400);
  }
  if (BASSLINE[inBar]) musicNote(root, t, STEP * 2, 'sawtooth', 0.15, 520);
  if (inBar % 4 === 0) musicDrum(t, 'kick');
  if (inBar === 4 || inBar === 12) musicDrum(t, 'clap');
  if (inBar % 2 === 1) musicDrum(t, 'hat');
  if (section >= 1 && inBar % 2 === 0) musicNote(root + 48 + chord[(inBar / 2) % 3], t, STEP * 1.4, 'triangle', 0.04, 5000);
  if (section >= 2) {
    const m = MELODY[n % MELODY.length];
    if (m) musicNote(m, t, STEP * 2.6, 'square', 0.03, 2600);
  }
}
function musicTick() {
  if (!audio || audio.state !== 'running') return;
  if (musicNext < audio.currentTime) musicNext = audio.currentTime + 0.05; // recover after a throttled tab
  while (musicNext < audio.currentTime + 0.3) {
    if (musicOn) scheduleStep(musicStep, musicNext);
    musicStep++;
    musicNext += STEP;
  }
}
function startMusic() {
  if (musicBus || !audio || audio.state !== 'running') return;
  musicBus = audio.createGain();
  musicBus.gain.value = 0;
  musicBus.connect(audio.destination);
  setInterval(musicTick, 100);
  musicTick();
}
// Sinks while she speaks so words stay easy to hear.
function setMusicLevel() {
  if (!musicBus) return;
  const level = !musicOn || document.hidden ? 0 : wordOn ? 0.04 : speaking ? 0.25 : G.screen === 'pause' ? 0.35 : 0.75;
  if (level !== musicLevel) {
    musicLevel = level;
    musicBus.gain.setTargetAtTime(level, audio.currentTime, speaking ? 0.04 : 0.3);
  }
}
function renderMusicButtons() {
  const label = musicOn ? 'Music on' : 'Music off';
  $('musicBtn').textContent = label;
  $('menuMusicBtn').textContent = '🎵 ' + label;
}
function toggleMusic(btn) {
  musicOn = !musicOn;
  store.set('music', musicOn);
  renderMusicButtons();
  btn.blur();
}
const sfx = {
  sparkle: () => { tone(2100, 3300, 0.12, 'sine', 0.05); tone(3200, 4600, 0.09, 'triangle', 0.025, 0.03); },
  twinkle: () => { tone(1760, 2640, 0.18, 'sine', 0.045); tone(2640, 3520, 0.14, 'sine', 0.03, 0.06); },
  hit: () => tone(2600, 2700, 0.1, 'triangle', 0.04),
  wrong: () => tone(170, 60, 0.3, 'sawtooth', 0.1),
  bell: () => { tone(1320, 1320, 0.9, 'triangle', 0.16); tone(2640, 2640, 0.5, 'sine', 0.05); },
  key: () => tone(900, 1150, 0.05, 'sine', 0.04),
  poof: () => noise(0.45, 0.12, 1300),
  honk: () => {
    tone(330, 250, 0.2, 'sawtooth', 0.11); tone(336, 254, 0.2, 'square', 0.04);
    tone(330, 250, 0.24, 'sawtooth', 0.11, 0.26); tone(336, 254, 0.24, 'square', 0.04, 0.26);
    tone(1500, 260, 0.7, 'sine', 0.07, 0.6); // slide whistle
  },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.14, 'triangle', 0.09, i * 0.09)),
  alarm: () => { tone(1000, 1000, 0.06, 'square', 0.04); tone(800, 800, 0.06, 'square', 0.04, 0.22); },
  powerup: () => [784, 988, 1175, 1568, 1976, 2349].forEach((f, i) => tone(f, f * 1.01, 0.14, 'triangle', 0.05, 0.4 + i * 0.06)),
  swish: () => noise(0.35, 0.07, 3500),
};

/* ---------- Game state ---------- */
const G = {
  screen: 'menu', // menu | play | firing | clearing | clowning | reveal | pause | over
  listId: LISTS.some(l => l.id === store.get('list', 'r1')) || store.get('list') === 'practice' ? store.get('list', 'r1') : 'r1',
  diff: DIFFS[store.get('diff', 'practice')] ? store.get('diff', 'practice') : 'practice', length: store.get('length', 10),
  look: LOOKS.some(l => l.id === store.get('look')) ? store.get('look') : LOOKS[0].id,
  queue: [], cur: null, typed: '', wordNo: 0, total: 0,
  score: 0, streak: 0, lives: 3, cleared: 0, missed: [], clown: 0,
  t: 0, duration: 0, alarmed: false, pending: null, revealAt: 0,
};
const defCache = new Map();

function currentEntries() {
  const L = window.WORD_LISTS;
  if (G.listId === 'practice') return Object.values(practice);
  if (G.listId === 'all') return LISTS.filter(l => l.id !== 'all').flatMap(l => L[l.id] || []);
  return L[G.listId] || L.r1;
}

function startMission() {
  // Must run inside the click: mobile browsers only unlock audio and speech from a user gesture.
  unlockAudio();
  title.skipIntro();
  voiceEl.src = SILENCE; voiceEl.play().catch(() => {});

  const d = DIFFS[G.diff];
  const pool = shuffle([...currentEntries()]);
  const queue = G.length ? pool.slice(0, G.length) : pool;
  Object.assign(G, { queue, total: queue.length, wordNo: 0, score: 0, streak: 0, lives: d.lives, cleared: 0, missed: [], clown: 0 });
  $('eraseBtn').classList.toggle('hidden', !d.erase);
  show('play');
  renderHud();
  setTimeout(nextWord, 500);
}

const roundOf = n => Math.ceil(n / ROUND_SIZE);
// Every cheer plays before any repeats; the three signature lines come first.
let barks = ['bark1', 'bark2', 'bark3', ...shuffle(['bark4', 'bark5', 'bark6', 'bark7', 'bark8'])];
function nextBark() {
  const id = barks.shift();
  barks.push(id);
  return line(id);
}

function nextWord() {
  if (!G.queue.length) return endMission(true);
  G.cur = G.queue.shift();
  G.wordNo++;
  G.typed = ''; G.t = 0; G.alarmed = false;
  G.duration = (8 + 1.6 * norm(G.cur.w).length) * DIFFS[G.diff].pace;
  sparks.length = 0;
  $('defbox').textContent = '';
  G.screen = 'play';
  renderSlots(); renderHud();
  const newRound = (G.wordNo - 1) % ROUND_SIZE === 0;
  if (newRound) floaters.push({ x: W / 2, y: H * 0.3, text: `ROUND ${roundOf(G.wordNo)}`, life: 1.8 });
  // Cheers come before the word, never after it, so the word is always the last thing heard.
  const shout = G.wordNo === 1 || Math.random() < 0.5 ? [nextBark()] : [];
  speak([...(newRound ? [roundClip(roundOf(G.wordNo))] : []), ...shout, line(pick('intro', 4)), ...wordTwice(G.cur)]);
}

const say = () => { if (G.screen === 'play' && G.cur) speak(wordTwice(G.cur)); };

// Bee rule: no feedback while spelling.
function pressLetter(raw) {
  if (G.screen !== 'play' || !G.cur) return;
  const c = norm(raw);
  if (c.length !== 1 || G.typed.length >= 40) return;
  G.typed += c;
  sfx.key();
  renderSlots();
}

function erase() {
  if (G.screen !== 'play' || !G.typed || !DIFFS[G.diff].erase) return;
  G.typed = G.typed.slice(0, -1);
  renderSlots();
}

const multiplier = () => Math.min(5, 1 + Math.floor(G.streak / 3));

/* ---------- Glam-ups: every correct word in a bee adds one more piece of her look ---------- */
const MAX_POWER = ITEMS.length;
const power = () => Math.min(MAX_POWER, G.cleared);
const upgradeMessage = p => ITEMS[p - 1].msg || ITEMS[p - 1].name.toUpperCase() + '!';
const commonPrefix = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return i; };
// Judge against whichever accepted spelling the player came closest to.
const closestForm = (e, typed) => forms(e).map(norm).reduce((a, b) => (commonPrefix(typed, b) > commonPrefix(typed, a) ? b : a));

function submit() {
  if (G.screen !== 'play' || !G.cur || !G.typed) return;
  G.screen = 'firing';
  renderSlots();
  const e = G.cur, typed = G.typed, match = forms(e).find(f => norm(f) === typed);
  const good = commonPrefix(typed, closestForm(e, typed));
  const shots = match ? typed.length : Math.min(good + 1, typed.length);
  // Each letter flies up to the mirror as a sparkle; a wrong letter turns into a puff.
  for (let i = 0; i < shots; i++) {
    setTimeout(() => { launchSpark(i, shots, !match && i === good); sfx.sparkle(); }, i * 110);
  }
  const wait = shots * 110 + 520;
  setTimeout(() => {
    if (match) wordCleared(e, match);
    else failWord('Ding! That is incorrect.', 'wrong');
  }, wait);
}

function launchSpark(i, count, bad) {
  const from = panelTop() - 10, spread = Math.min(26, (W - 60) / Math.max(1, count));
  sparks.push({
    sx: W / 2 + (i - (count - 1) / 2) * spread, sy: from,
    tx: (Math.random() - 0.5) * 120, ty: -30 + Math.random() * 100, t: 0, bad,
  });
}

function wordCleared(e, form) {
  G.cleared++; G.streak++;
  const timeBonus = G.duration ? Math.round(50 * Math.max(0, 1 - G.t / G.duration)) : 0;
  const gained = (100 + 10 * G.typed.length) * multiplier() + timeBonus;
  G.score += gained;
  G.screen = 'clearing';
  const [fx0, fy0] = toScreen(0, 0);
  burst(fx0, fy0, 40, { kind: 'heart', colors: ['#ff4f9a', '#ff8cc6', '#ffd36e'], speed: 380 });
  burst(fx0, fy0, 50, { kind: 'spark', colors: ['#ffffff', '#ffd36e', '#ff9ad5', '#c9a0ff'], speed: 460 });
  burst(fx0, fy0, 18, { kind: 'gem', speed: 420 });
  disco.boost = 1;
  floaters.push({ x: W / 2, y: fy0 - 40, text: `SLAY! +${gained}`, life: 1.3 });
  sfx.win(); sfx.twinkle();
  const clips = [line(pick('correct', 6))];
  if (G.clown) { // a correct word wipes the clown makeup off
    G.clown = 0;
    girl.wipe = 1;
    sfx.swish();
    floaters.push({ x: W / 2, y: fy0 + 60 * girl.k, text: 'CLOWN MAKEUP WIPED OFF!', life: 2, color: '#9ff5d0' });
    clips.push(line('wipe'));
  }
  if (G.cleared <= MAX_POWER) {
    const it = ITEMS[G.cleared - 1], [ix, iy] = toScreen(...it.at);
    setTimeout(() => burst(ix, iy, 34, { kind: 'spark', colors: ['#ffffff', '#ffd36e', '#ff8cc6'], speed: 160 }), 350);
    floaters.push({ x: W / 2, y: fy0 + 110 * girl.k, text: upgradeMessage(G.cleared), life: 2.2, color: '#ffd36e' });
    girl.glow = 1;
    sfx.powerup();
  }
  delete practice[norm(e.w)]; savePractice();
  if (G.streak % 5 === 0 && G.lives < DIFFS[G.diff].lives) {
    G.lives++;
    floaters.push({ x: W / 2, y: fy0 + 150 * girl.k, text: 'HEART RESTORED', life: 1.6, color: '#ff8cc6' });
  }
  renderHud(); renderSlots();
  $('defbox').innerHTML = `<b style="color:var(--mint)">${esc(form)}</b>${e.def ? esc(' — ' + e.def) : ''}`;
  speak(clips, () => setTimeout(nextWord, e.def ? 1200 : 500));
}

function failWord(title, lineId) {
  if (G.screen !== 'play' && G.screen !== 'firing') return;
  const e = G.cur, typed = G.typed;
  G.streak = 0; G.lives--;
  G.clown++;
  G.missed.push(e);
  practice[norm(e.w)] = e; savePractice();
  // Poof! Clown makeup.
  const [fx0, fy0] = toScreen(0, 10);
  burst(fx0, fy0, 22, { kind: 'puff', colors: ['#ff4d6d', '#ffd23f', '#3fa7ff', '#7dff9a', '#c77dff'], speed: 160 });
  burst(fx0, fy0, 60, { kind: 'confetti', colors: ['#ff4d6d', '#ffd23f', '#3fa7ff', '#7dff9a', '#c77dff', '#ffffff'], speed: 420 });
  floaters.push({ x: W / 2, y: fy0 - 30, text: G.clown > 1 ? 'MORE CLOWN MAKEUP!' : 'HONK HONK! CLOWN MAKEUP!', life: 1.8, color: '#ff6b8b' });
  girl.shock = 1;
  sfx.bell(); sfx.poof(); sfx.honk();
  fx.shake = 14; fx.flash = 0.6;
  G.screen = 'clowning';
  renderSlots();

  const good = commonPrefix(typed, closestForm(e, typed));
  $('revealTitle').textContent = title;
  $('revealSpell').innerHTML = typed ? 'You spelled: ' + [...typed.toUpperCase()].map((c, i) => `<span class="${i < good ? 'ok' : 'bad'}">${c}</span>`).join('') : '';
  $('revealWord').textContent = forms(e).join(' or ').toUpperCase();
  $('revealDef').textContent = e.def ? `${e.pos ? e.pos + ': ' : ''}${e.def}` : '';
  $('revealAgain').textContent = G.lives <= 0 ? 'You are out of this bee.' : `${G.lives} heart${G.lives > 1 ? 's' : ''} left. Spell the next one right to wipe off the clown makeup!`;
  G.pending = G.lives > 0 ? nextWord : () => endMission(false);
  renderHud();
  speak([line(lineId), ...letterClips(e), wordClip(e)]);
  // Let everyone see the clown face for a moment before the answer card covers the bottom of the screen.
  setTimeout(() => {
    if (G.screen !== 'clowning') return;
    G.revealAt = performance.now();
    show('reveal');
  }, 1500);
}

function continueReveal() {
  if (G.screen !== 'reveal' || performance.now() - G.revealAt < 500) return;
  const go = G.pending; G.pending = null;
  stopVoice();
  show('play');
  go();
}

function endMission(won, quit) {
  G.cur = null;
  stopVoice();
  const key = 'best_' + G.listId + '_' + G.diff;
  const best = store.get(key, 0), isBest = G.score > best;
  if (isBest) store.set(key, G.score);
  $('overTitle').textContent = won ? 'Slay, queen! You are the champion!' : quit ? 'Bee ended' : 'Out of hearts!';
  $('overTag').textContent = isBest && G.score > 0 ? 'New high score for this list!' : `High score for this list: ${best}`;
  const attempted = G.cleared + G.missed.length;
  $('overStats').innerHTML = [['SCORE', G.score], ['ROUND REACHED', roundOf(Math.max(G.wordNo, 1))], ['WORDS CORRECT', `${G.cleared} / ${attempted}`], ['GLAM', `${power()} / ${MAX_POWER}`]]
    .map(([k, v]) => `<div><small>${k}</small>${v}</div>`).join('');
  const missed = G.missed;
  $('missHead').classList.toggle('hidden', !missed.length);
  $('missList').innerHTML = missed.map((e, i) => `<li><button type="button" data-i="${i}" aria-label="Hear ${esc(e.w)}">🔊</button><b>${esc(e.w)}</b><span>${esc(e.def || '')}</span></li>`).join('');
  $('missList').onclick = ev => { const b = ev.target.closest('button'); if (b) speak([wordClip(missed[+b.dataset.i])]); };
  if (won) sfx.win();
  show('over');
  if (!quit) speak([line(won ? 'win' : 'out')]);
}

/* ---------- Definition hint ---------- */
async function showDefinition() {
  if (G.screen !== 'play' || !G.cur) return;
  const e = G.cur;
  let text = e.def, pos = e.pos;
  if (!text && defCache.has(e.w)) ({ text, pos } = defCache.get(e.w));
  if (!text && !defCache.has(e.w)) {
    $('defbox').textContent = 'Looking it up…';
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 4000);
      const res = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(e.w), { signal: ctl.signal });
      clearTimeout(timer);
      if (res.ok) {
        const m = (await res.json())[0].meanings[0];
        text = m.definitions[0].definition; pos = m.partOfSpeech;
      }
    } catch { /* offline, or word not found */ }
    defCache.set(e.w, { text, pos });
    if (G.cur !== e) return; // the player moved on while waiting
  }
  if (!text) {
    $('defbox').textContent = 'No definition available for this word.';
    return;
  }
  const masked = maskDef(text, e);
  $('defbox').innerHTML = `${pos ? `<i>${esc(pos)}</i> · ` : ''}${esc(masked)}`;
  const clip = defClip(e); // words without a list definition are shown on screen only
  if (clip) speak([clip]);
}

/* ---------- Rendering: DOM ---------- */
function renderSlots() {
  const box = $('slots');
  if (!G.cur) { box.innerHTML = ''; return; }
  // No blanks: as in a real bee, the player isn't told how long the word is.
  const live = G.screen === 'play';
  const count = G.typed.length + (live ? 1 : 0);
  const size = Math.max(16, Math.min(46, (Math.min(innerWidth, 1000) - 32) / Math.max(count, 1) - 4));
  box.style.setProperty('--slot', size + 'px');
  box.style.setProperty('--gap', (size < 26 ? 2 : 6) + 'px');
  box.innerHTML = [...G.typed.toUpperCase()].map(c => `<div class="slot on">${c}</div>`).join('') + (live ? '<div class="slot next"></div>' : '');
  $('strikes').textContent = !live ? '' : G.typed ? 'Press Enter to glam it when your spelling is final.' : 'Spell the word. You find out if it is right after you glam it.';
}

function renderHud() {
  $('score').textContent = G.score;
  $('combo').textContent = '×' + multiplier();
  $('power').textContent = `${power()}/${MAX_POWER}`;
  $('left').textContent = `${roundOf(Math.max(G.wordNo, 1))} · word ${G.wordNo}/${G.total}`;
  $('shields').textContent = '♥'.repeat(Math.max(0, G.lives)) + '♡'.repeat(Math.max(0, DIFFS[G.diff].lives - G.lives));
  $('soundBtn').textContent = soundOn ? 'Sound on' : 'Sound off';
}

function show(name) {
  G.screen = name;
  for (const id of ['menu', 'reveal', 'pause', 'over']) $(id).classList.toggle('hidden', id !== name);
  const inGame = name === 'play' || name === 'firing' || name === 'clearing' || name === 'clowning';
  $('hud').classList.toggle('hidden', !inGame);
  $('panel').classList.toggle('hidden', !inGame);
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if (name === 'menu') { buildMenu(); title.play(); } else title.stop();
}

function buildPicks(el, items, selected, onPick) {
  el.innerHTML = items.map(it => `<button type="button" class="pick" data-id="${esc(String(it.id))}" aria-pressed="${String(it.id) === String(selected)}">${it.sw ? `<i class="sw">${it.sw.map(c => `<em style="background:${c}"></em>`).join('')}</i>` : ''}<b>${esc(it.name)}</b><span>${esc(it.note)}</span></button>`).join('');
  el.onclick = ev => { const b = ev.target.closest('.pick'); if (b) onPick(b.dataset.id); };
}

function buildMenu() {
  const L = window.WORD_LISTS;
  const practiceCount = Object.keys(practice).length;
  if (G.listId === 'practice' && !practiceCount) G.listId = 'r1';
  const size = id => (id === 'all' ? LISTS.filter(l => l.id !== 'all').reduce((n, l) => n + (L[l.id] || []).length, 0) : (L[id] || []).length);
  const items = LISTS.map(l => ({ id: l.id, name: l.name, note: `${size(l.id)} words · ${l.note}` }));
  if (practiceCount) items.unshift({ id: 'practice', name: 'Touch-up Station', note: `${practiceCount} word${practiceCount > 1 ? 's' : ''} you missed` });
  buildPicks($('lists'), items, G.listId, id => { G.listId = id; store.set('list', id); buildMenu(); });
  buildPicks($('diffs'), Object.entries(DIFFS).map(([id, d]) => ({ id, name: d.name, note: d.note })), G.diff, id => { G.diff = id; store.set('diff', id); buildMenu(); });
  buildPicks($('lengths'), LENGTHS.map(n => ({ id: n, name: n ? `${n} words` : 'Full bee', note: n ? `${n / ROUND_SIZE} rounds, random words` : `${currentEntries().length} in this list` })), G.length, id => { G.length = +id; store.set('length', +id); buildMenu(); });
  buildPicks($('looks'), LOOKS.map(l => ({ id: l.id, name: l.name, note: l.curly ? 'curly' : 'long and straight', sw: [l.skin, l.hair] })), G.look, id => { G.look = id; store.set('look', id); buildMenu(); });
}

/* ---------- Rendering: canvas ---------- */
const cv = $('c'), ctx = cv.getContext('2d');
let W = 0, H = 0;
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const glitter = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), z: 0.3 + Math.random() * 0.7, c: ['255,255,255', '255,211,110', '255,154,213', '201,160,255'][Math.floor(Math.random() * 4)] }));
const girl = { x: 0, y: 0, k: 1, glow: 0, shock: 0, wipe: 0, clownA: 0, clownLv: 0, glam: Array(ITEMS.length).fill(0) };
const sparks = [], parts = [], floaters = [];
const fx = { shake: 0, flash: 0 };
let room = null;

const toScreen = (lx, ly) => [girl.x + lx * girl.k, girl.y + ly * girl.k];
const panelTop = () => { const p = $('panel'); return p.classList.contains('hidden') ? H : H - p.offsetHeight; };

function resize() {
  const r = window.devicePixelRatio || 1;
  W = innerWidth; H = innerHeight;
  cv.width = W * r; cv.height = H * r;
  ctx.setTransform(r, 0, 0, r, 0, 0);
  room = null;
  if (G.cur) renderSlots();
}

// Mirror and portrait are drawn in their own units (460 wide, 490 tall), scaled to fit between the HUD and the panel.
function layout() {
  const hud = $('hud');
  const top = hud.classList.contains('hidden') ? 14 : hud.offsetHeight + 6;
  const bottom = panelTop() - 8;
  const k = Math.max(0.3, Math.min((bottom - top) / 490, (W - 16) / 460, 1.7));
  girl.k = k;
  girl.x = W / 2;
  girl.y = top + 244 * k + Math.max(0, (bottom - top - 490 * k) / 2);
}

function burst(x, y, n, { kind = 'spark', colors = ['#fff'], speed = 300 } = {}) {
  if (calm) n = Math.ceil(n / 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, sp = 30 + Math.random() * speed;
    const life = kind === 'puff' ? 0.8 + Math.random() * 0.6 : 0.5 + Math.random() * 0.8;
    parts.push({
      kind, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (kind === 'heart' ? 60 : 0), life, max: life,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: kind === 'puff' ? 22 + Math.random() * 26 : kind === 'confetti' ? 5 + Math.random() * 5 : 4 + Math.random() * 6,
      rot: Math.random() * 6, spin: (Math.random() - 0.5) * 10, grav: kind === 'confetti' ? 260 : kind === 'heart' ? -30 : 0,
    });
  }
}

function update(dt) {
  layout();
  const now = performance.now();
  girl.glow = Math.max(0, girl.glow - dt * 0.8);
  girl.shock = Math.max(0, girl.shock - dt * 0.5);
  girl.wipe = Math.max(0, girl.wipe - dt * 1.4);
  const p = power();
  girl.glam.forEach((v, i) => { girl.glam[i] = i < p ? Math.min(1, v + dt * 1.6) : Math.max(0, v - dt * 3); });
  if (G.clown > 0) { girl.clownLv = G.clown; girl.clownA = Math.min(1, girl.clownA + dt * 5); }
  else { girl.clownA = Math.max(0, girl.clownA - dt * 1.5); if (!girl.clownA) girl.clownLv = 0; }

  if (G.screen === 'play' && G.cur && G.duration && !speaking) {
    G.t += dt;
    if (G.t / G.duration > 0.75 && !G.alarmed) { G.alarmed = true; sfx.alarm(); speak([line(pick('urgent', 3))]); }
    if (G.t >= G.duration) failWord('Time! The party started without you.', 'time');
  }

  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.t += dt * 2.6;
    if (s.t >= 1) {
      sparks.splice(i, 1);
      const [x, y] = toScreen(s.tx, s.ty);
      if (s.bad) { burst(x, y, 14, { kind: 'puff', colors: ['#ff4d6d', '#ff8fa3'], speed: 80 }); sfx.wrong(); }
      else { burst(x, y, 10, { kind: 'spark', colors: ['#ffffff', '#bff3ff', '#ff9ad5'], speed: 140 }); sfx.hit(); }
    } else if (!calm && Math.random() < 0.7) {
      const [x, y] = sparkPos(s);
      parts.push({ kind: 'dot', x, y, vx: (Math.random() - 0.5) * 30, vy: 20, life: 0.4, max: 0.4, color: s.bad ? '#ff4d6d' : '#ffe9a8', size: 2.5, grav: 0 });
    }
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const q = parts[i];
    q.vy += (q.grav || 0) * dt;
    const drag = q.kind === 'puff' ? 2.5 : q.kind === 'confetti' ? 0.8 : 1.6;
    q.vx -= q.vx * drag * dt; q.vy -= q.vy * (q.kind === 'confetti' ? 0.3 : drag) * dt;
    q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt; q.rot += q.spin * dt;
    if (q.life <= 0) parts.splice(i, 1);
  }
  // Her glitter twinkles once she has it
  if (!calm && girl.glam[8] > 0.5 && Math.random() < dt * 3) {
    const [x, y] = toScreen((Math.random() < 0.5 ? -1 : 1) * (100 + Math.random() * 25), -100 + Math.random() * 200);
    parts.push({ kind: 'spark', x, y, vx: 0, vy: -8, life: 0.6, max: 0.6, color: '#ffffff', size: 5, rot: 0, spin: 0, grav: 0 });
  }
  for (let i = floaters.length - 1; i >= 0; i--) {
    floaters[i].y -= 40 * dt; floaters[i].life -= dt;
    if (floaters[i].life <= 0) floaters.splice(i, 1);
  }
  disco.boost = Math.max(0, disco.boost - dt * 0.5);
  if (!calm && G.screen !== 'pause') disco.rot += dt * (0.5 + disco.boost * 2.5);
  fx.shake = Math.max(0, fx.shake - dt * 30);
  fx.flash = Math.max(0, fx.flash - dt * 2);
  void now;
}

function sparkPos(s) {
  const [tx, ty] = toScreen(s.tx, s.ty), e = 1 - (1 - s.t) * (1 - s.t);
  return [s.sx + (tx - s.sx) * e + Math.sin(s.t * 3.14) * (s.sx - W / 2) * 0.6, s.sy + (ty - s.sy) * e];
}

/* ---------- Shapes ---------- */
function star4(t, x, y, r, color, a = 1) {
  t.save();
  t.globalAlpha *= a;
  t.fillStyle = color;
  t.beginPath();
  t.moveTo(x, y - r); t.quadraticCurveTo(x, y, x + r, y); t.quadraticCurveTo(x, y, x, y + r);
  t.quadraticCurveTo(x, y, x - r, y); t.quadraticCurveTo(x, y, x, y - r);
  t.fill();
  t.restore();
}
function heartPath(t, x, y, s) {
  t.beginPath();
  t.moveTo(x, y + s * 0.35);
  t.bezierCurveTo(x - s * 1.1, y - s * 0.35, x - s * 0.5, y - s * 1.05, x, y - s * 0.45);
  t.bezierCurveTo(x + s * 0.5, y - s * 1.05, x + s * 1.1, y - s * 0.35, x, y + s * 0.35);
  t.closePath();
}
function starPath(t, x, y, r, inner = 0.45, n = 5, rot = -Math.PI / 2) {
  t.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n, rr = i % 2 ? r * inner : r;
    i ? t.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : t.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  t.closePath();
}
function glow(x, y, r, rgb, a = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.25, `rgba(${rgb},${a * 0.8})`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}
function roundRect(t, x, y, w, h, r) {
  t.beginPath();
  t.moveTo(x + r, y); t.arcTo(x + w, y, x + w, y + h, r); t.arcTo(x + w, y + h, x, y + h, r);
  t.arcTo(x, y + h, x, y, r); t.arcTo(x, y, x + w, y, r); t.closePath();
}
// Small seeded random generator so glitter and sequins stay put from frame to frame.
const rng = seed => () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const SEQUINS = (() => { const r = rng(7); return Array.from({ length: 70 }, () => [(r() * 2 - 1) * 170, 160 + r() * 90, r() * 9]); })();
const HAIR_GLITTER = (() => {
  const r = rng(11), out = [];
  while (out.length < 26) {
    const x = (r() * 2 - 1) * 128, y = -150 + r() * 290;
    if ((x / 100) ** 2 + ((y + 5) / 128) ** 2 > 1.15) out.push([x, y, r() * 9]);
  }
  return out;
})();

// A shiny cut diamond: flat table on top, pointed below. "spin" moves the shine across the facets.
function diamond(t, x, y, r, spin = 0, bad = false) {
  const w = r, top = y - r * 0.55, girdle = y - r * 0.15, tip = y + r * 0.95, tw = r * 0.55;
  const sh = 0.5 + 0.5 * Math.sin(spin);
  t.save();
  t.beginPath(); t.moveTo(x - tw, top); t.lineTo(x + tw, top); t.lineTo(x + w, girdle); t.lineTo(x, tip); t.lineTo(x - w, girdle); t.closePath();
  const g = t.createLinearGradient(x - w, top, x + w, tip);
  if (bad) { g.addColorStop(0, '#ffd0d8'); g.addColorStop(0.5, '#ff4d6d'); g.addColorStop(1, '#8a0a24'); }
  else { g.addColorStop(0, '#ffffff'); g.addColorStop(0.3 + sh * 0.3, '#9fe9ff'); g.addColorStop(0.75, '#c7b3ff'); g.addColorStop(1, '#5fb8ff'); }
  t.fillStyle = g; t.fill();
  t.strokeStyle = 'rgba(255,255,255,.9)'; t.lineWidth = Math.max(0.8, r * 0.08); t.stroke();
  t.beginPath(); // facet lines
  t.moveTo(x - w, girdle); t.lineTo(x + w, girdle);
  t.moveTo(x - tw, top); t.lineTo(x - tw * 0.4, girdle); t.lineTo(x, tip); t.lineTo(x + tw * 0.4, girdle); t.lineTo(x + tw, top);
  t.moveTo(x - tw * 0.4, girdle); t.lineTo(x, top); t.lineTo(x + tw * 0.4, girdle);
  t.strokeStyle = 'rgba(255,255,255,.55)'; t.lineWidth = Math.max(0.5, r * 0.05); t.stroke();
  t.restore();
  if (sh > 0.75) star4(t, x - tw * 0.4, top + r * 0.15, r * 0.9 * (sh - 0.75) * 4, '#ffffff');
}

/* ---------- The disco ball: spins in the corner and throws colored lights around the room ---------- */
const disco = { rot: 0, boost: 0, x: 0, y: 0, r: 40 };
const DISCO_SPOTS = Array.from({ length: 16 }, (_, i) => ({ a: (i / 16) * 6.283, d: 0.35 + ((i * 37) % 10) / 14, c: ['255,120,200', '120,220,255', '255,230,120', '190,140,255', '255,255,255'][i % 5] }));
function placeDisco() {
  const r = Math.max(24, Math.min(64, Math.min(W, H) * 0.075));
  const side = W / 2 - 236 * girl.k; // room beside the mirror
  disco.r = r;
  if (side > r * 2.6) { disco.x = side / 2; disco.y = Math.max(r + 70, girl.y - 150 * girl.k); }
  else { disco.x = Math.max(r + 8, W * 0.12); disco.y = r + (W < 640 ? 110 : 80); }
}
function drawDiscoLights(now) {
  if (calm) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const s of DISCO_SPOTS) {
    const a = s.a + disco.rot * 1.3;
    const x = disco.x + Math.cos(a) * Math.max(W, H) * s.d, y = disco.y + Math.abs(Math.sin(a * 1.7 + s.d)) * H * 0.85 * s.d + 40;
    const r = 18 + s.d * 26, al = (0.12 + 0.18 * disco.boost) * (0.6 + 0.4 * Math.sin(now / 300 + s.a * 3));
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${s.c},${al})`); g.addColorStop(1, `rgba(${s.c},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
}
function drawDiscoBall(now) {
  const { x, y, r } = disco;
  ctx.strokeStyle = 'rgba(255,230,250,.7)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, y - r); ctx.stroke();
  ctx.fillStyle = '#c9b9cf'; ctx.fillRect(x - r * 0.15, y - r - 5, r * 0.3, 7);
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.clip();
  const base = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  base.addColorStop(0, '#e9e4f0'); base.addColorStop(1, '#4a3f55');
  ctx.fillStyle = base; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  const rows = 9, cols = 18;
  for (let i = 0; i < rows; i++) {
    const la0 = -Math.PI / 2 + (i / rows) * Math.PI, la1 = la0 + Math.PI / rows;
    const y0 = y + Math.sin(la0) * r, y1 = y + Math.sin(la1) * r, ring = Math.cos((la0 + la1) / 2) * r;
    for (let j = 0; j < cols; j++) {
      const lo0 = (j / cols) * 6.283 + disco.rot, lo1 = lo0 + 6.283 / cols;
      if (Math.cos((lo0 + lo1) / 2) <= 0) continue; // back of the ball
      const x0 = x + Math.sin(lo0) * ring, x1 = x + Math.sin(lo1) * ring;
      const flick = Math.sin(i * 12.9898 + j * 78.233 + now / 260);
      const v = Math.round(120 + 70 * Math.cos((lo0 + lo1) / 2) - 40 * Math.sin((la0 + la1) / 2) + 40 * flick);
      const tint = (i + j) % 7 === 0 ? [255, 170, 220] : (i * 3 + j) % 11 === 0 ? [170, 230, 255] : [v, v, v + 12];
      ctx.fillStyle = `rgb(${Math.min(255, tint[0])},${Math.min(255, tint[1])},${Math.min(255, tint[2])})`;
      ctx.fillRect(Math.min(x0, x1) + 0.6, y0 + 0.6, Math.abs(x1 - x0) - 1.2, y1 - y0 - 1.2);
    }
  }
  ctx.restore();
  for (let i = 0; i < 3; i++) { // glints
    const tw = Math.sin(now / 200 + i * 2.1);
    if (tw > 0.4) star4(ctx, x + Math.cos(i * 2.4) * r * 0.55, y + Math.sin(i * 2.4) * r * 0.55, r * 0.5 * (tw - 0.4) * (1 + disco.boost), '#ffffff');
  }
  if (disco.boost > 0) glow(x, y, r * 2.2, '255,180,230', disco.boost * 0.5);
}

/* ---------- The vanity room ---------- */
function paintRoom() {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(W)); c.height = Math.max(1, Math.ceil(H));
  const t = c.getContext('2d');
  const g = t.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#4a1350'); g.addColorStop(0.6, '#7a2a6e'); g.addColorStop(1, '#3a0f3f');
  t.fillStyle = g; t.fillRect(0, 0, W, H);
  // Wallpaper: soft stripes and little diamonds
  t.globalAlpha = 0.07;
  t.fillStyle = '#ffd6f0';
  for (let x = 0; x < W; x += 56) t.fillRect(x, 0, 22, H);
  t.globalAlpha = 0.12;
  for (let y = 18; y < H; y += 56) for (let x = (y / 56) % 2 ? 39 : 11; x < W; x += 56) {
    t.beginPath(); t.moveTo(x, y - 6); t.lineTo(x + 5, y); t.lineTo(x, y + 6); t.lineTo(x - 5, y); t.closePath(); t.fill();
  }
  t.globalAlpha = 1;
  // Spotlight behind the mirror
  const s = t.createRadialGradient(W / 2, H * 0.4, 10, W / 2, H * 0.4, Math.max(W, H) * 0.6);
  s.addColorStop(0, 'rgba(255,190,230,.35)'); s.addColorStop(1, 'rgba(255,190,230,0)');
  t.fillStyle = s; t.fillRect(0, 0, W, H);
  return c;
}

/* ---------- The mirror: its light bulbs are the clock ---------- */
const BULBS = (() => {
  const out = [];
  for (let i = 0; i < 7; i++) out.push([-180 + i * 60, -232]); // top, left to right
  for (let i = 0; i < 6; i++) out.push([218, -170 + i * 72]); // right side, downward
  for (let i = 0; i < 6; i++) out.push([-218, 190 - i * 72]); // left side, upward
  return out;
})();
const MIRROR = { x: -204, y: -218, w: 408, h: 460, r: 70 };

function drawMirror(now) {
  const t = ctx;
  // Frame
  roundRect(t, MIRROR.x - 16, MIRROR.y - 16, MIRROR.w + 32, MIRROR.h + 32, MIRROR.r + 14);
  const fg = t.createLinearGradient(-220, -230, 220, 250);
  fg.addColorStop(0, '#fff1c2'); fg.addColorStop(0.3, '#e0b04f'); fg.addColorStop(0.55, '#fff3cf'); fg.addColorStop(0.8, '#b98a2e'); fg.addColorStop(1, '#f2d88a');
  t.fillStyle = fg; t.fill();
  // Glass
  roundRect(t, MIRROR.x, MIRROR.y, MIRROR.w, MIRROR.h, MIRROR.r);
  const gg = t.createLinearGradient(0, MIRROR.y, 0, MIRROR.y + MIRROR.h);
  gg.addColorStop(0, '#fbe8ff'); gg.addColorStop(1, '#e4b9ec');
  t.fillStyle = gg; t.fill();
  // Bulbs: lit ones count down the time left
  const frac = G.duration && G.cur && (G.screen === 'play' || G.screen === 'firing') ? Math.max(0, 1 - G.t / G.duration) : 1;
  const lit = Math.ceil(BULBS.length * frac);
  const urgent = G.duration && G.cur && G.t / G.duration > 0.75 && G.screen === 'play';
  BULBS.forEach(([bx, by], i) => {
    const on = i < lit, flick = urgent && on && Math.floor(now / 140 + i) % 3 === 0;
    t.beginPath(); t.arc(bx, by, 12, 0, 6.283);
    const bg = t.createRadialGradient(bx - 3, by - 3, 1, bx, by, 12);
    if (on && !flick) { bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.6, urgent ? '#ffb3b3' : '#fff2c4'); bg.addColorStop(1, urgent ? '#ff6b6b' : '#ffd36e'); }
    else { bg.addColorStop(0, '#d9d2dc'); bg.addColorStop(1, '#8c7f90'); }
    t.fillStyle = bg; t.fill();
    t.strokeStyle = 'rgba(120,80,20,.6)'; t.lineWidth = 1.5; t.stroke();
  });
  return { lit, urgent };
}

function drawBulbGlow(lit, urgent, now) {
  if (calm) return;
  BULBS.forEach(([bx, by], i) => {
    if (i >= lit || (urgent && Math.floor(now / 140 + i) % 3 === 0)) return;
    const [x, y] = toScreen(bx, by);
    glow(x, y, 30 * girl.k, urgent ? '255,90,90' : '255,215,140', 0.45);
  });
}

/* ---------- The girl ---------- */
function drawGirl(now) {
  const t = ctx, L = LOOKS.find(l => l.id === G.look) || LOOKS[0], g = girl.glam, ca = girl.clownA, cl = girl.clownLv;
  const lipColor = mix('#d0706c', '#ff2f86', g[0]);
  const shocked = girl.shock > 0.2 || G.screen === 'reveal' || G.screen === 'clowning';
  t.save();
  roundRect(t, MIRROR.x, MIRROR.y, MIRROR.w, MIRROR.h, MIRROR.r);
  t.clip();

  // Back hair
  t.fillStyle = hairGrad(t, L);
  if (L.curly) {
    t.beginPath(); t.ellipse(0, -15, 142, 158, 0, 0, 6.283); t.fill();
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * 6.283, x = Math.cos(a) * 140, y = -15 + Math.sin(a) * 156;
      t.beginPath(); t.arc(x, y, 30, 0, 6.283); t.fill();
    }
  } else {
    t.beginPath(); t.moveTo(0, -152);
    t.bezierCurveTo(-95, -156, -130, -90, -127, -10);
    t.bezierCurveTo(-125, 80, -146, 160, -122, 240);
    t.lineTo(122, 240);
    t.bezierCurveTo(146, 160, 125, 80, 127, -10);
    t.bezierCurveTo(130, -90, 95, -156, 0, -152);
    t.fill();
  }

  // Neck and shoulders
  t.fillStyle = L.skin;
  t.beginPath(); t.moveTo(-34, 70); t.lineTo(-36, 160); t.lineTo(36, 160); t.lineTo(34, 70); t.closePath(); t.fill();
  t.fillStyle = L.shade;
  t.beginPath(); t.ellipse(0, 100, 36, 20, 0, 0, 3.1416); t.fill(); // shadow under the chin
  t.fillStyle = L.skin;
  t.beginPath(); t.moveTo(-180, 260); t.bezierCurveTo(-175, 185, -120, 162, -40, 150); t.lineTo(40, 150); t.bezierCurveTo(120, 162, 175, 185, 180, 260); t.closePath(); t.fill();
  // Top: plain pink, or sequins once she earns them
  t.beginPath(); t.moveTo(-180, 260); t.bezierCurveTo(-176, 192, -132, 172, -82, 164); t.quadraticCurveTo(0, 222, 82, 164); t.bezierCurveTo(132, 172, 176, 192, 180, 260); t.closePath();
  const tg = t.createLinearGradient(-180, 160, 180, 260);
  tg.addColorStop(0, mix('#ff8cc6', '#b04cff', g[10])); tg.addColorStop(1, mix('#ff5fa2', '#ff3d8b', g[10]));
  t.fillStyle = tg; t.fill();
  if (g[10] > 0) {
    t.save(); t.clip();
    for (const [sx, sy, ph] of SEQUINS) {
      const tw = 0.5 + 0.5 * Math.sin(now / 260 + ph);
      t.globalAlpha = g[10] * (0.35 + tw * 0.65);
      t.fillStyle = tw > 0.8 ? '#ffffff' : ph > 4.5 ? '#ffd36e' : '#ffc4ef';
      t.beginPath(); t.arc(sx, sy, 3.2, 0, 6.283); t.fill();
    }
    t.restore();
  }
  // Clown ruffle collar
  if (cl >= 3 && ca > 0) {
    t.save(); t.globalAlpha = ca;
    for (let i = -5; i <= 5; i++) {
      const x = i * 17, y = 160 + Math.abs(i) * 2;
      t.fillStyle = '#ffffff'; t.beginPath(); t.arc(x, y, 14, 0, 6.283); t.fill();
      t.strokeStyle = '#d9c7e8'; t.lineWidth = 1.5; t.stroke();
      t.fillStyle = ['#ff4d6d', '#3fa7ff', '#ffd23f', '#3fd47a'][(i + 8) % 4];
      t.beginPath(); t.arc(x + 2, y + 2, 4, 0, 6.283); t.fill();
    }
    t.restore();
  }
  // Pearl necklace
  if (g[5] > 0) {
    t.save(); t.globalAlpha = g[5];
    for (let i = 0; i <= 14; i++) {
      const s = i / 14, x = -50 + 100 * s, y = 150 + 40 * 4 * s * (1 - s) * (1 - 0.15 * Math.abs(s - 0.5));
      const pg = t.createRadialGradient(x - 1.5, y - 1.5, 0.5, x, y, 5.5);
      pg.addColorStop(0, '#ffffff'); pg.addColorStop(1, '#d8cfe0');
      t.fillStyle = pg; t.beginPath(); t.arc(x, y, 5.2, 0, 6.283); t.fill();
    }
    heartPath(t, 0, 200, 11); t.fillStyle = '#ff3d8b'; t.fill();
    star4(t, -3, 193, 4, '#ffffff', 0.5 + 0.5 * Math.sin(now / 300));
    t.restore();
  }

  // Ears
  for (const side of [-1, 1]) {
    t.fillStyle = L.skin; t.beginPath(); t.ellipse(side * 90, 8, 14, 22, 0, 0, 6.283); t.fill();
    t.fillStyle = L.shade; t.beginPath(); t.ellipse(side * 91, 8, 7, 13, 0, 0, 6.283); t.fill();
  }
  // Face
  facePath(t);
  const fg = t.createRadialGradient(-30, -40, 10, 0, 0, 140);
  fg.addColorStop(0, mix(L.skin, '#ffffff', 0.15)); fg.addColorStop(1, L.skin);
  t.fillStyle = fg; t.fill();
  if (ca > 0) { facePath(t); t.fillStyle = `rgba(255,255,255,${0.88 * ca})`; t.fill(); } // clown white

  // Blush
  if (g[1] > 0) for (const side of [-1, 1]) {
    const bx = side * 56, bg = t.createRadialGradient(bx, 38, 2, bx, 38, 26);
    bg.addColorStop(0, `rgba(255,95,150,${0.5 * g[1]})`); bg.addColorStop(1, 'rgba(255,95,150,0)');
    t.fillStyle = bg; t.beginPath(); t.ellipse(bx, 38, 26, 16, 0, 0, 6.283); t.fill();
  }
  // Eyeshadow
  if (g[2] > 0) for (const side of [-1, 1]) {
    const ex = side * 38, sg = t.createRadialGradient(ex + side * 6, -16, 2, ex, -12, 30);
    sg.addColorStop(0, `rgba(176,76,255,${0.85 * g[2]})`); sg.addColorStop(0.6, `rgba(255,110,200,${0.5 * g[2]})`); sg.addColorStop(1, 'rgba(255,110,200,0)');
    t.fillStyle = sg; t.beginPath(); t.ellipse(ex, -16, 30, 20, 0, 3.1416, 6.283); t.ellipse(ex, -16, 30, 6, 0, 0, 3.1416); t.fill();
  }
  // Clown: blue diamonds over the eyes, red cheek dots
  if (ca > 0) {
    t.save(); t.globalAlpha = ca;
    for (const side of [-1, 1]) {
      const ex = side * 38;
      t.fillStyle = '#2f7bff';
      t.beginPath(); t.moveTo(ex, -62); t.lineTo(ex + 20, -8); t.lineTo(ex, 42); t.lineTo(ex - 20, -8); t.closePath(); t.fill();
      t.fillStyle = '#ff2a3a'; t.beginPath(); t.arc(side * 64, 44, 12, 0, 6.283); t.fill();
    }
    t.restore();
  }

  // Eyes
  const blink = (now / 1000) % 3.6 < 0.13 && !shocked;
  const lx = Math.sin(now / 1700) * 3, ly = shocked ? -2 : 2 + Math.sin(now / 2300) * 1.5;
  for (const side of [-1, 1]) {
    const ex = side * 38, ey = -8, ry = shocked ? 17 : 14;
    if (blink) {
      t.strokeStyle = '#2a1a14'; t.lineWidth = 3; t.lineCap = 'round';
      t.beginPath(); t.moveTo(ex - 18, ey); t.quadraticCurveTo(ex, ey + 8, ex + 18, ey); t.stroke();
    } else {
      t.save();
      t.beginPath(); t.ellipse(ex, ey, 19, ry, 0, 0, 6.283);
      t.fillStyle = '#ffffff'; t.fill();
      t.clip();
      const ix = ex + lx, iy = ey + ly;
      const ig = t.createRadialGradient(ix, iy - 3, 2, ix, iy, 12);
      ig.addColorStop(0, mix(L.eye, '#ffffff', 0.35)); ig.addColorStop(1, L.eye);
      t.fillStyle = ig; t.beginPath(); t.arc(ix, iy, 11.5, 0, 6.283); t.fill();
      t.fillStyle = '#120a08'; t.beginPath(); t.arc(ix, iy, 5.5, 0, 6.283); t.fill();
      t.fillStyle = '#ffffff'; t.beginPath(); t.arc(ix - 4, iy - 4, 3.4, 0, 6.283); t.fill();
      t.beginPath(); t.arc(ix + 4, iy + 3, 1.6, 0, 6.283); t.fill();
      t.restore();
      // Upper lid line
      t.strokeStyle = '#2a1a14'; t.lineWidth = 2.6 + 1.6 * g[3]; t.lineCap = 'round';
      t.beginPath(); t.ellipse(ex, ey, 19, ry, 0, 3.3, 6.12); t.stroke();
      // Lashes and a winged liner
      const outer = side * 19;
      if (g[3] > 0) {
        t.save(); t.globalAlpha = g[3];
        t.fillStyle = '#1a0e0a';
        t.beginPath(); t.moveTo(ex + outer, ey - 2); t.lineTo(ex + outer + side * 12, ey - 10); t.lineTo(ex + outer - side * 2, ey - 6); t.closePath(); t.fill();
        t.lineWidth = 2;
        for (let j = 0; j < 4; j++) {
          const a = (side > 0 ? 5.0 : 4.42) + (side > 0 ? 1 : -1) * j * 0.22, px = ex + Math.cos(a) * 19, py = ey + Math.sin(a) * ry;
          t.beginPath(); t.moveTo(px, py); t.lineTo(px + Math.cos(a) * 8 + side * 2, py + Math.sin(a) * 8 - 2); t.stroke();
        }
        t.restore();
      } else {
        t.lineWidth = 2;
        t.beginPath(); t.moveTo(ex + outer * 0.95, ey - 4); t.lineTo(ex + outer + side * 5, ey - 8); t.stroke();
      }
    }
    // Eyebrows: up when surprised
    const bY = shocked ? -48 : -40;
    t.strokeStyle = mix(L.hair, '#000000', 0.2); t.lineWidth = 5; t.lineCap = 'round';
    t.beginPath(); t.moveTo(ex - side * 17, bY + 4); t.quadraticCurveTo(ex, bY - 7, ex + side * 19, bY + 3); t.stroke();
  }
  // Face gems
  if (g[7] > 0) for (const side of [-1, 1]) {
    t.save(); t.globalAlpha = g[7];
    [[64, 10, 4.5, '#7fe8ff'], [74, -2, 3.2, '#ff9ad5'], [70, 22, 3.2, '#c9a0ff'], [80, 12, 2.6, '#ffffff'], [58, 24, 2.4, '#ffd36e']].forEach(([gx, gy, gr, col], j) => {
      const x = side * gx;
      t.fillStyle = col;
      t.beginPath(); t.moveTo(x, gy - gr); t.lineTo(x + gr, gy); t.lineTo(x, gy + gr); t.lineTo(x - gr, gy); t.closePath(); t.fill();
      t.fillStyle = 'rgba(255,255,255,.8)'; t.beginPath(); t.arc(x - gr * 0.3, gy - gr * 0.3, gr * 0.3, 0, 6.283); t.fill();
      const tw = Math.sin(now / 240 + j * 1.7 + side);
      if (tw > 0.7) star4(t, x, gy, gr * 2.6, '#ffffff', (tw - 0.7) * 3);
    });
    t.restore();
  }

  // Nose
  t.strokeStyle = L.shade; t.lineWidth = 2.6; t.lineCap = 'round';
  t.beginPath(); t.moveTo(-7, 28); t.quadraticCurveTo(0, 34, 7, 28); t.stroke();
  if (ca > 0) {
    t.save(); t.globalAlpha = ca;
    const ng = t.createRadialGradient(-5, 16, 2, 0, 22, 18);
    ng.addColorStop(0, '#ff9a9a'); ng.addColorStop(0.5, '#ff1f2f'); ng.addColorStop(1, '#a3000d');
    t.fillStyle = ng; t.beginPath(); t.arc(0, 22, 17, 0, 6.283); t.fill();
    t.fillStyle = 'rgba(255,255,255,.8)'; t.beginPath(); t.ellipse(-6, 15, 5, 3, -0.5, 0, 6.283); t.fill();
    t.restore();
  }

  // Mouth
  if (ca > 0) { // big clown smile painted around her mouth
    t.save(); t.globalAlpha = ca;
    t.fillStyle = '#ff1f2f';
    t.beginPath(); t.moveTo(-62, 46); t.quadraticCurveTo(0, 118, 62, 46); t.quadraticCurveTo(0, 86, -62, 46); t.closePath(); t.fill();
    t.restore();
  }
  const talking = speaking && !wordOn;
  const talk = talking ? Math.abs(Math.sin(now / 85) * Math.sin(now / 47 + 1)) : 0;
  if (shocked && !talking) {
    t.fillStyle = '#5a1020'; t.beginPath(); t.ellipse(0, 62, 10, 13, 0, 0, 6.283); t.fill();
    t.strokeStyle = lipColor; t.lineWidth = 4; t.stroke();
  } else if (talking) {
    const h = 3 + talk * 10;
    t.fillStyle = '#5a1020'; t.beginPath(); t.ellipse(0, 60, 17, h, 0, 0, 6.283); t.fill();
    t.fillStyle = '#ffffff'; t.fillRect(-9, 60 - h, 18, Math.min(4, h * 0.5));
    t.strokeStyle = lipColor; t.lineWidth = 4.5; t.beginPath(); t.ellipse(0, 60, 17, h, 0, 0, 6.283); t.stroke();
  } else {
    t.fillStyle = lipColor;
    t.beginPath(); t.moveTo(-24, 55); t.quadraticCurveTo(-10, 49, 0, 53); t.quadraticCurveTo(10, 49, 24, 55); t.quadraticCurveTo(0, 76, -24, 55); t.closePath(); t.fill();
    t.strokeStyle = mix(lipColor, '#3a0010', 0.45); t.lineWidth = 1.6;
    t.beginPath(); t.moveTo(-23, 55); t.quadraticCurveTo(0, 62, 23, 55); t.stroke();
    if (g[0] > 0) { t.fillStyle = `rgba(255,255,255,${0.7 * g[0]})`; t.beginPath(); t.ellipse(-7, 63, 6, 2.2, -0.1, 0, 6.283); t.fill(); }
  }

  // Front hair / bangs
  t.fillStyle = hairGrad(t, L);
  if (L.curly) {
    for (let i = 0; i <= 10; i++) {
      const a = 3.45 + (i / 10) * 2.5, x = Math.cos(a) * 92, y = -12 + Math.sin(a) * 128;
      t.beginPath(); t.arc(x, y, 26 + (i % 3) * 3, 0, 6.283); t.fill();
    }
  } else {
    t.beginPath(); t.moveTo(-100, -6);
    t.bezierCurveTo(-112, -110, -55, -160, 5, -152);
    t.bezierCurveTo(70, -150, 110, -100, 100, -6);
    t.bezierCurveTo(94, -58, 72, -84, 42, -92);
    t.bezierCurveTo(12, -80, -28, -76, -60, -56);
    t.bezierCurveTo(-80, -44, -94, -28, -100, -6);
    t.fill();
    // Side locks falling over the shoulders
    for (const side of [-1, 1]) {
      t.beginPath(); t.moveTo(side * 98, -40);
      t.bezierCurveTo(side * 122, 40, side * 108, 120, side * 128, 220);
      t.lineTo(side * 100, 210);
      t.bezierCurveTo(side * 92, 120, side * 96, 50, side * 86, -10);
      t.closePath(); t.fill();
    }
    t.strokeStyle = 'rgba(255,255,255,.18)'; t.lineWidth = 5; t.lineCap = 'round';
    t.beginPath(); t.moveTo(-70, -118); t.quadraticCurveTo(-20, -148, 40, -138); t.stroke();
  }
  // Clown wig: rainbow puffs on both sides
  if (cl >= 2 && ca > 0) {
    t.save(); t.globalAlpha = ca;
    const cols = ['#ff3b4f', '#ff9f1c', '#ffe23f', '#3fd47a', '#3fa7ff', '#b25cff'];
    for (const side of [-1, 1]) for (let i = 0; i < 9; i++) {
      const x = side * (112 + (i % 3) * 22), y = -120 + Math.floor(i / 3) * 44 + (i % 2) * 10;
      t.fillStyle = cols[(i + (side > 0 ? 3 : 0)) % cols.length];
      t.beginPath(); t.arc(x, y, 26, 0, 6.283); t.fill();
    }
    t.restore();
  }
  // Earrings swing gently
  if (g[4] > 0) for (const side of [-1, 1]) {
    t.save(); t.globalAlpha = g[4];
    t.translate(side * 92, 28); t.rotate(Math.sin(now / 420 + side) * 0.18);
    t.strokeStyle = '#e0b04f'; t.lineWidth = 2;
    t.beginPath(); t.moveTo(0, 0); t.lineTo(0, 18); t.stroke();
    for (let j = 0; j < 2; j++) { t.fillStyle = '#ffe9a8'; t.beginPath(); t.arc(0, 6 + j * 8, 2.6, 0, 6.283); t.fill(); }
    t.beginPath(); t.moveTo(0, 18); t.bezierCurveTo(-11, 30, -8, 40, 0, 42); t.bezierCurveTo(8, 40, 11, 30, 0, 18);
    const eg = t.createLinearGradient(-8, 18, 8, 42);
    eg.addColorStop(0, '#ffd1f0'); eg.addColorStop(0.5, '#ff4fa0'); eg.addColorStop(1, '#a8106a');
    t.fillStyle = eg; t.fill();
    const tw = Math.sin(now / 300 + side * 2);
    if (tw > 0.6) star4(t, -3, 27, 8, '#ffffff', (tw - 0.6) * 2.5);
    t.restore();
  }
  // Hair glitter
  if (g[8] > 0) {
    for (const [hx, hy, ph] of HAIR_GLITTER) {
      const tw = 0.5 + 0.5 * Math.sin(now / 330 + ph);
      t.fillStyle = ph > 6 ? '#ffd36e' : ph > 3 ? '#ff9ad5' : '#ffffff';
      t.globalAlpha = g[8] * (0.4 + 0.6 * tw);
      t.beginPath(); t.arc(hx, hy, 1.8 + tw * 1.4, 0, 6.283); t.fill();
    }
    t.globalAlpha = 1;
  }
  // Star clips
  if (g[9] > 0) {
    t.save(); t.globalAlpha = g[9];
    for (const [sx, sy, r] of [[-64, -92, 11], [-40, -110, 9]]) {
      starPath(t, sx, sy, r); t.fillStyle = '#ffd36e'; t.fill();
      t.strokeStyle = '#b98a2e'; t.lineWidth = 1.2; t.stroke();
    }
    t.restore();
  }
  // Hair bow
  if (g[6] > 0) {
    t.save(); t.globalAlpha = g[6];
    t.translate(76, -116); t.rotate(0.45);
    for (const side of [-1, 1]) {
      t.beginPath(); t.moveTo(0, 0); t.bezierCurveTo(side * 22, -30, side * 48, -18, side * 40, 0); t.bezierCurveTo(side * 48, 18, side * 22, 30, 0, 0);
      const bg = t.createLinearGradient(0, -20, side * 44, 20);
      bg.addColorStop(0, '#ff8cc6'); bg.addColorStop(1, '#e0207a');
      t.fillStyle = bg; t.fill();
      t.fillStyle = 'rgba(255,255,255,.75)';
      for (const [dx, dy] of [[18, -8], [30, 4], [22, 10]]) { t.beginPath(); t.arc(side * dx, dy, 2.5, 0, 6.283); t.fill(); }
    }
    t.fillStyle = '#c4126a'; t.beginPath(); t.ellipse(0, 0, 8, 10, 0, 0, 6.283); t.fill();
    t.restore();
  }
  // Clown hat
  if (cl >= 4 && ca > 0) {
    t.save(); t.globalAlpha = ca;
    t.translate(-40, -150); t.rotate(-0.35);
    t.beginPath(); t.moveTo(-34, 10); t.lineTo(0, -80); t.lineTo(34, 10); t.closePath();
    t.fillStyle = '#3fa7ff'; t.fill();
    t.save(); t.clip();
    t.fillStyle = '#ffe23f';
    for (let y = -70; y < 10; y += 22) t.fillRect(-40, y, 80, 9);
    t.restore();
    t.fillStyle = '#ff3b4f'; t.beginPath(); t.arc(0, -82, 10, 0, 6.283); t.fill();
    t.restore();
  }
  // Tiara
  if (g[11] > 0) {
    t.save(); t.globalAlpha = g[11];
    t.beginPath(); t.moveTo(-58, -128);
    [[-46, -160], [-30, -138], [-15, -172], [0, -146], [15, -172], [30, -138], [46, -160], [58, -128]].forEach(([x, y]) => t.lineTo(x, y));
    t.quadraticCurveTo(0, -144, -58, -128); t.closePath();
    const cg = t.createLinearGradient(0, -175, 0, -128);
    cg.addColorStop(0, '#fff3cf'); cg.addColorStop(0.5, '#ffd36e'); cg.addColorStop(1, '#c79a32');
    t.fillStyle = cg; t.fill();
    t.strokeStyle = '#a07824'; t.lineWidth = 1.5; t.stroke();
    [[-15, -160, '#ff4fa0'], [15, -160, '#ff4fa0'], [0, -141, '#7fe8ff'], [-46, -150, '#c9a0ff'], [46, -150, '#c9a0ff']].forEach(([x, y, c], j) => {
      t.fillStyle = c; t.beginPath(); t.arc(x, y, 4.5, 0, 6.283); t.fill();
      const tw = Math.sin(now / 280 + j * 1.3);
      if (tw > 0.5) star4(t, x, y, 11, '#ffffff', (tw - 0.5) * 2);
    });
    t.restore();
  }
  // Makeup wipe: a sweep of white light across the glass
  if (girl.wipe > 0) {
    const wx = -260 + (1 - girl.wipe) * 520;
    const wg = t.createLinearGradient(wx - 60, 0, wx + 60, 0);
    wg.addColorStop(0, 'rgba(255,255,255,0)'); wg.addColorStop(0.5, 'rgba(255,255,255,.75)'); wg.addColorStop(1, 'rgba(255,255,255,0)');
    t.fillStyle = wg; t.fillRect(MIRROR.x, MIRROR.y, MIRROR.w, MIRROR.h);
  }
  // Glass reflection streaks
  t.globalAlpha = 0.14; t.fillStyle = '#ffffff';
  t.beginPath(); t.moveTo(-190, -120); t.lineTo(-120, -210); t.lineTo(-90, -210); t.lineTo(-190, -80); t.closePath(); t.fill();
  t.globalAlpha = 1;
  t.restore();
}

function facePath(t) {
  t.beginPath(); t.moveTo(0, -128);
  t.bezierCurveTo(62, -128, 96, -82, 95, -10);
  t.bezierCurveTo(94, 56, 58, 112, 0, 118);
  t.bezierCurveTo(-58, 112, -94, 56, -95, -10);
  t.bezierCurveTo(-96, -82, -62, -128, 0, -128);
  t.closePath();
}
function hairGrad(t, L) {
  const g = t.createLinearGradient(-60, -160, 60, 220);
  g.addColorStop(0, L.hairHi); g.addColorStop(0.35, L.hair); g.addColorStop(1, mix(L.hair, '#000000', 0.25));
  return g;
}
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
function mix(a, b, s) {
  const A = hex(a), B = hex(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * Math.max(0, Math.min(1, s))).toString(16).padStart(2, '0')).join('');
}

function drawParts() {
  for (const q of parts) {
    const a = Math.min(1, (q.life / q.max) * 2);
    ctx.save();
    ctx.globalAlpha = a;
    if (q.kind === 'gem') diamond(ctx, q.x, q.y, q.size * 1.4, q.rot, false);
    else if (q.kind === 'spark') star4(ctx, q.x, q.y, q.size * (0.6 + 0.4 * Math.sin(q.rot * 3)), q.color);
    else if (q.kind === 'heart') { heartPath(ctx, q.x, q.y, q.size * 1.3); ctx.fillStyle = q.color; ctx.fill(); }
    else if (q.kind === 'confetti') { ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillStyle = q.color; ctx.fillRect(-q.size / 2, -q.size / 4, q.size, q.size / 2); }
    else if (q.kind === 'puff') {
      const r = q.size * (1.4 - q.life / q.max * 0.6), g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r);
      g.addColorStop(0, q.color); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = a * 0.7; ctx.fillStyle = g; ctx.fillRect(q.x - r, q.y - r, r * 2, r * 2);
    } else { ctx.fillStyle = q.color; ctx.fillRect(q.x, q.y, q.size, q.size); }
    ctx.restore();
  }
}

function draw(now, dt) {
  ctx.save();
  if (fx.shake > 0 && !calm) ctx.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake);
  if (!room) room = paintRoom();
  ctx.fillStyle = '#3a0f3f';
  ctx.fillRect(-30, -30, W + 60, H + 60);
  ctx.drawImage(room, 0, 0, W, H);
  // Glitter drifting up through the room
  for (const s of glitter) {
    if (!calm && G.screen !== 'pause') s.y = (s.y - dt * 0.02 * s.z + 1) % 1;
    const tw = calm ? 0.7 : 0.5 + 0.5 * Math.sin(now / 350 + s.x * 90);
    ctx.fillStyle = `rgba(${s.c},${(0.15 + s.z * 0.5) * tw})`;
    const r = 0.8 + s.z * 1.8;
    ctx.fillRect(s.x * W, s.y * H, r, r);
  }
  placeDisco();
  drawDiscoLights(now);
  ctx.save();
  ctx.translate(girl.x, girl.y); ctx.scale(girl.k, girl.k);
  const { lit, urgent } = drawMirror(now);
  drawGirl(now);
  ctx.restore();
  drawBulbGlow(lit, urgent, now);
  drawDiscoBall(now);
  if (girl.glow > 0) glow(girl.x, girl.y, 260 * girl.k, '255,180,230', girl.glow * 0.45);
  // Letter sparkles flying up to the mirror
  for (const s of sparks) {
    const [x, y] = sparkPos(s);
    if (s.bad) glow(x, y, 18, '255,70,100', 0.8); else glow(x, y, 22, '170,235,255', 0.8);
    diamond(ctx, x, y, 13, now / 120 + s.sx, s.bad);
  }
  drawParts();
  ctx.textAlign = 'center';
  ctx.font = '900 24px "Trebuchet MS","Segoe UI",system-ui,sans-serif';
  ctx.lineJoin = 'round';
  for (const f of floaters) {
    ctx.globalAlpha = Math.min(1, f.life * 2);
    const fh = Math.min(W / 2, ctx.measureText(f.text).width / 2 + 8); // keep long messages on screen
    const fx0 = Math.max(fh, Math.min(W - fh, f.x));
    ctx.strokeStyle = '#3a0f3f'; ctx.lineWidth = 6; ctx.strokeText(f.text, fx0, f.y);
    ctx.fillStyle = f.color || '#ffffff';
    ctx.fillText(f.text, fx0, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  if (fx.flash > 0) {
    ctx.fillStyle = `rgba(255,120,190,${fx.flash * 0.35})`;
    ctx.fillRect(0, 0, W, H);
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  setMusicLevel();
  update(dt);
  draw(now, dt);
  requestAnimationFrame(frame);
}

/* ---------- Title: a lipstick wand bedazzles each letter of SPELLING GLAM!!! ---------- */
const title = (() => {
  const c = $('titleFx'), t = c.getContext('2d');
  let glyphs = [], beams = [], dust = [], start = 0, running = false, lastNow = 0, cw = 0, ch = 0, size = 0, announced = false, introDone = false;
  const font = px => `900 ${px}px "Trebuchet MS","Arial Black",sans-serif`;

  function layout() {
    const r = window.devicePixelRatio || 1, box = c.getBoundingClientRect();
    cw = box.width; ch = box.height;
    c.width = cw * r; c.height = ch * r;
    t.setTransform(r, 0, 0, r, 0, 0);
    const lines = cw >= 600 ? ['SPELLING GLAM!!!'] : ['SPELLING', 'GLAM!!!'];
    size = 100;
    t.font = font(size);
    const widest = Math.max(...lines.map(l => t.measureText(l).width));
    size = Math.min((ch - 40) * (lines.length > 1 ? 0.46 : 0.8), (size * cw * 0.92) / widest);
    t.font = font(size);
    glyphs = [];
    lines.forEach((l, row) => {
      const left = (cw - t.measureText(l).width) / 2;
      const y = size * 0.98 * (row + 1) + 6;
      for (let i = 0; i < l.length; i++) {
        // Measuring the running prefix keeps kerning right.
        const x = left + t.measureText(l.slice(0, i)).width, nx = left + t.measureText(l.slice(0, i + 1)).width;
        if (l[i] !== ' ') glyphs.push({ ch: l[i], x, y, w: nx - x, lit: false, seed: Math.random() * 100 });
      }
    });
  }

  const wandX = () => cw / 2, wandY = () => ch - 22;
  const sprinkle = (g, n) => {
    for (let i = 0; i < n; i++) dust.push({ x: g.x + Math.random() * g.w, y: g.y - Math.random() * size * 0.75, vx: (Math.random() - 0.5) * 80, vy: -20 - Math.random() * 70, life: 0.4 + Math.random() * 0.7, c: ['#ffffff', '#ffd36e', '#ff9ad5'][Math.floor(Math.random() * 3)] });
  };

  function drawLipstick(x, y, s) {
    t.save(); t.translate(x, y); t.scale(s, s); t.rotate(-0.2);
    t.fillStyle = '#ff2f86';
    t.beginPath(); t.moveTo(-7, -10); t.lineTo(-7, -26); t.lineTo(7, -36); t.lineTo(7, -10); t.closePath(); t.fill();
    const g = t.createLinearGradient(-10, 0, 10, 0);
    g.addColorStop(0, '#b98a2e'); g.addColorStop(0.5, '#fff3cf'); g.addColorStop(1, '#b98a2e');
    t.fillStyle = g; t.fillRect(-10, -10, 20, 12);
    t.fillStyle = '#2a0f2e'; t.fillRect(-11, 2, 22, 20);
    t.restore();
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - lastNow) / 1000), age = (now - start) / 1000;
    lastNow = now;
    t.clearRect(0, 0, cw, ch);

    glyphs.forEach((g, i) => {
      if (!g.lit && age > 0.3 + i * 0.16) { g.lit = true; beams.push({ x: g.x + g.w / 2, y: g.y - size * 0.4, life: 0.18 }); sprinkle(g, calm ? 3 : 30); sfx.twinkle(); }
    });
    if (!announced && glyphs.every(g => g.lit)) {
      announced = true;
      if (audio && audio.state === 'running') {
        introDone = true;
        setTimeout(() => { if (G.screen === 'menu') speak([line('title')]); }, 350);
      }
    }

    t.lineCap = 'round';
    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i];
      b.life -= dt;
      if (b.life <= 0) { beams.splice(i, 1); continue; }
      t.strokeStyle = '#ff9ad5'; t.lineWidth = 7; t.globalAlpha = 0.45;
      t.beginPath(); t.moveTo(wandX(), wandY() - 30); t.lineTo(b.x, b.y); t.stroke();
      t.strokeStyle = '#fff'; t.lineWidth = 2; t.globalAlpha = 1; t.stroke();
    }

    // Glittering pink-and-gold letters
    t.font = font(size);
    t.textAlign = 'left';
    for (const g of glyphs) {
      if (!g.lit) continue;
      const shim = calm ? 0.5 : 0.5 + 0.5 * Math.sin(now / 400 + g.seed);
      const grad = t.createLinearGradient(0, g.y - size * 0.8, 0, g.y);
      grad.addColorStop(0, '#fff0fa');
      grad.addColorStop(0.35 + shim * 0.15, '#ff7ac0');
      grad.addColorStop(0.8, '#e0207a');
      grad.addColorStop(1, '#ffd36e');
      t.fillStyle = grad;
      t.shadowColor = '#ff4fa0';
      t.shadowBlur = 12 + shim * 14;
      t.fillText(g.ch, g.x, g.y);
      t.shadowBlur = 0;
      t.lineWidth = 2; t.strokeStyle = '#fff3cf'; t.strokeText(g.ch, g.x, g.y);
      if (!calm && Math.random() < dt * 2.5) dust.push({ x: g.x + Math.random() * g.w, y: g.y - Math.random() * size * 0.7, vx: 0, vy: -6, life: 0.5, c: '#ffffff', star: true });
    }

    for (let i = dust.length - 1; i >= 0; i--) {
      const p = dust[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.life <= 0) { dust.splice(i, 1); continue; }
      t.globalAlpha = Math.min(1, p.life * 2.2);
      if (p.star) star4(t, p.x, p.y, 9 * p.life * 2, p.c);
      else { t.fillStyle = p.c; t.fillRect(p.x, p.y, 3, 3); }
    }
    t.globalAlpha = 1;
    drawLipstick(wandX(), wandY() + 12, 0.9);
    requestAnimationFrame(frame);
  }

  return {
    play() {
      if (running) return;
      running = true;
      layout();
      beams = []; dust = [];
      start = lastNow = performance.now();
      if (introDone) { announced = true; glyphs.forEach(g => { g.lit = true; }); } // returning to the menu: already sparkling, silent
      requestAnimationFrame(frame);
    },
    stop() { running = false; },
    // Plain browser tab: the silent intro gets one audible run at the first click or key.
    restart() {
      if (!running || introDone) return;
      layout();
      beams = []; dust = [];
      announced = false;
      start = lastNow = performance.now();
    },
    skipIntro() { introDone = true; },
    resize() { if (running) { const was = glyphs.every(g => g.lit); layout(); if (was) glyphs.forEach(g => { g.lit = true; }); } },
  };
})();

/* ---------- Input ---------- */
function setPause(on) {
  if (on && G.screen === 'play') {
    stopVoice();
    show('pause');
  } else if (!on && G.screen === 'pause') {
    show('play');
    say();
  }
}

addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (G.screen === 'reveal') {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); continueReveal(); }
    return;
  }
  if (G.screen === 'pause') {
    if (e.key === 'Escape') setPause(false);
    return;
  }
  if (G.screen !== 'play') { if (e.key === ' ' || e.key === 'Enter') e.preventDefault(); return; }
  if (e.key === ' ') { e.preventDefault(); if (!e.repeat) say(); return; }
  if (e.key === 'Enter') { e.preventDefault(); if (!e.repeat) submit(); return; }
  if (e.key === 'Backspace') { e.preventDefault(); erase(); return; }
  if (e.key === 'Escape') { setPause(true); return; }
  if (e.key === '1') { if (!e.repeat) showDefinition(); return; }
  if (e.repeat) return; // a held key must not spell a run of letters
  if (e.key.length === 1 && norm(e.key).length === 1) { e.preventDefault(); pressLetter(e.key); }
});

$('start').onclick = startMission;
$('again').onclick = startMission;
$('toMenu').onclick = () => show('menu');
$('testVoice').onclick = () => speak([line('test')]);
$('sayBtn').onclick = () => { say(); $('sayBtn').blur(); };
$('defBtn').onclick = () => { showDefinition(); $('defBtn').blur(); };
$('pauseBtn').onclick = () => setPause(true);
$('resume').onclick = () => setPause(false);
$('quit').onclick = () => { show('play'); endMission(false, true); };
$('musicBtn').onclick = () => toggleMusic($('musicBtn'));
$('menuMusicBtn').onclick = () => toggleMusic($('menuMusicBtn'));
$('fireBtn').onclick = () => { submit(); $('fireBtn').blur(); };
$('eraseBtn').onclick = () => { erase(); $('eraseBtn').blur(); };
$('revealGo').onclick = continueReveal;
$('soundBtn').onclick = () => { soundOn = !soundOn; store.set('sound', soundOn); renderHud(); $('soundBtn').blur(); };
document.addEventListener('visibilitychange', () => { if (document.hidden) setPause(true); });
addEventListener('resize', () => { resize(); title.resize(); });

// On-screen keyboard for tablets and phones (iPads with a trackpad can report a fine pointer, so check for touch too)
if (matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 1 && matchMedia('(any-pointer: coarse)').matches) || /iPad|iPhone/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
  document.documentElement.classList.add('touch');
  const k = $('keys');
  k.classList.remove('hidden');
  k.innerHTML = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'].map(r => `<div>${[...r].map(c => `<button type="button" data-k="${c}">${c}</button>`).join('')}</div>`).join('');
  k.addEventListener('pointerdown', e => { const b = e.target.closest('button'); if (b) { e.preventDefault(); pressLetter(b.dataset.k); } });
}

/* ---------- Boot ---------- */
if (!window.WORD_LISTS) {
  document.querySelector('#menu .card').innerHTML = '<h2>Word list missing</h2><p class="tag">Keep words.js in the same folder as index.html.</p>';
} else {
  buildMenu();
  renderMusicButtons();
  resize();
  // The title starts immediately. The launcher allows sound from the first moment; a plain
  // browser tab blocks it until the first click or key, so there the title replays with sound.
  unlockAudio();
  title.play();
  if (!audio || audio.state !== 'running') {
    const wake = () => {
      unlockAudio();
      if (!audio || audio.state !== 'running') return; // iOS: not unlocked yet, try again on the next event
      for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) removeEventListener(ev, wake);
      if (G.screen === 'menu') title.restart();
    };
    for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) addEventListener(ev, wake);
    if (audio) audio.addEventListener('statechange', () => { if (audio.state === 'running') wake(); });
  }
  requestAnimationFrame(frame);
  // Preview link for screenshots: index.html#demo-8-c2 starts a bee with 8 glam items and clown level 2.
  const demo = /^#demo(?:-(\d+))?(?:-c(\d+))?/.exec(location.hash);
  if (demo) {
    startMission();
    G.cleared = +demo[1] || 0; G.clown = +demo[2] || 0;
    girl.glam.fill(0).forEach((_, i) => { girl.glam[i] = i < power() ? 1 : 0; });
    renderHud();
  }
}

// Offline play and "Add to Home Screen" install. Service workers only run on http(s), not from a double-clicked file.
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
