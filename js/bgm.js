// =========================================================
// js/bgm.js — 배경음악 (담당: 팀원 A)
//
// 하나의 멜로디가 망가져 가는 구성 (음원 파일 없음, Web Audio로 합성)
//   - 2D 요리(게임 시작 버튼 이후): 밝고 경쾌한 8비트 요리방송 테마
//   - 3D 탐색(추격 전): 같은 멜로디가 낡은 오르골로.
//                        세트가 무너질수록(0.5 → 1) 느려지고, 음이 틀어지고, 빠지고, 끊김
//   - 타이틀 / 전환 / 추격 / 엔딩: 음악 없음 (추격·엔딩 배경음은 C 담당)
//
// 효과음(C의 playSound)과는 다른 오디오 장치를 써서 서로 영향을 주지 않는다.
// 다른 파일은 아무것도 부를 필요 없음: 게임 상태를 0.2초마다 보고 알아서 켜고 끈다.
//
// Console 명령:
//   FCredit.BGM.setVolume(0.5)   // 0~1 (기본 1)
//   FCredit.BGM.mute(true)       // 끄기 / false 켜기
//   FCredit.BGM.test("cook")     // 강제 재생 테스트: "cook" | "box" | null(끄기)
//   FCredit.BGM.testK(0.9)       // 오르골 무너짐 정도 강제 (null = 자동)
//   FCredit.BGM.sting("fscare")  // F 서랍 갑툭튀 소리 들어보기
// =========================================================

window.FCredit = window.FCredit || {};

const BGM_VOL = { cook: 0.16, box: 0.2 };   // 효과음보다 작게
const COOK_BPM = 132;
const LOOKAHEAD = 0.12;                     // 미리 예약하는 시간(초)

// ---------- 곡 (8마디, 8분음표 단위. 0 = 쉼표) — 직접 작곡한 오리지널 멜로디 ----------
// 화음 진행: C | Am | F | G | C | Am | Dm | G
const MELODY = [
  72, 76, 79, 84, 83, 79, 76, 79,
  81, 0, 79, 76, 72, 0, 74, 0,
  77, 81, 84, 81, 77, 0, 76, 77,
  79, 0, 74, 0, 79, 81, 83, 0,
  84, 0, 83, 81, 79, 76, 79, 84,
  81, 0, 76, 0, 72, 74, 76, 0,
  77, 76, 74, 72, 74, 0, 77, 0,
  79, 77, 74, 71, 74, 0, 0, 0,
];
const ROOTS = [48, 45, 41, 43, 48, 45, 50, 43];          // 마디별 베이스 근음
const CHORDS = [                                         // 마디별 화음 (반주용)
  [60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62],
  [60, 64, 67], [57, 60, 64], [62, 65, 69], [55, 59, 62],
];
const STEPS = MELODY.length;   // 64

const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---------- 상태 ----------
let ctx = null, master = null, musicBus = null, noiseBuf = null;
let mode = null;               // 지금 재생 중: "cook" | "box" | null
let step = 0, nextTime = 0, schedTimer = null;
let userVolume = 1, muted = false;
let forced, forcedK = null;    // 테스트용

// ---------- 오디오 준비 ----------
function ensureCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
    buildGraph(ctx, ctx.destination);
  } catch (err) {
    console.warn("[BGM] 오디오를 만들 수 없음:", err);
    ctx = null;
  }
  return ctx;
}

// 출력 연결: musicBus → (오르골용 메아리) → master → 스피커
function buildGraph(c, out) {
  master = c.createGain();
  master.gain.value = 0;
  master.connect(out);
  musicBus = c.createGain();
  musicBus.connect(master);
  // 메아리(딜레이): 오르골이 텅 빈 세트장에 울리는 느낌
  const delay = c.createDelay(1.0);
  delay.delayTime.value = 0.34;
  const fb = c.createGain();
  fb.gain.value = 0.38;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1800;
  musicBus.connect(delay);
  delay.connect(lp);
  lp.connect(fb);
  fb.connect(delay);
  const wet = c.createGain();
  wet.gain.value = 0;                 // 요리 테마일 땐 메아리 없음, 오르골일 때만
  lp.connect(wet);
  wet.connect(master);
  musicBus.wet = wet;
  // 하이햇용 잡음
  noiseBuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

// 첫 클릭·터치·키 입력 때 오디오 깨우기 (브라우저 자동 재생 제한)
function unlock() {
  const c = ensureCtx();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}
["pointerdown", "touchstart", "keydown"].forEach((ev) => window.addEventListener(ev, unlock, { capture: true, passive: true }));

// ---------- 소리 하나 ----------
function tone(c, dest, { type = "square", freq, t, dur, vol, attack = 0.005, release = null, detune = 0 }) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (detune) o.detune.setValueAtTime(detune, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + (release ?? dur));
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + (release ?? dur) + 0.05);
}

function hat(c, dest, t, vol) {
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = 7000;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  s.connect(f); f.connect(g); g.connect(dest);
  s.start(t);
  s.stop(t + 0.06);
}

function kick(c, dest, t, vol) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + 0.16);
}

// 오르골 한 음: 맑은 사인 + 높은 배음, 빠르게 사라짐
function musicBoxNote(c, dest, freq, t, vol, detune) {
  tone(c, dest, { type: "sine", freq, t, dur: 0.02, release: 1.3, vol, attack: 0.003, detune });
  tone(c, dest, { type: "sine", freq: freq * 3, t, dur: 0.02, release: 0.35, vol: vol * 0.25, attack: 0.002, detune });
  tone(c, dest, { type: "triangle", freq: freq * 2, t, dur: 0.02, release: 0.5, vol: vol * 0.18, attack: 0.002, detune: detune * 1.5 });
}

// ---------- 8분음표 한 칸 예약 ----------
// 요리 테마: 리드(사각파) + 베이스(삼각파) + 화음 스탭 + 킥·하이햇
function scheduleCook(c, dest, i, t, len) {
  const bar = Math.floor(i / 8), pos = i % 8;
  const m = MELODY[i];
  if (m) tone(c, dest, { type: "square", freq: midiHz(m), t, dur: len * 0.85, vol: 0.22 });
  if (pos % 2 === 0) {
    const r = ROOTS[bar] + (pos % 4 === 2 ? 7 : 0);
    tone(c, dest, { type: "triangle", freq: midiHz(r), t, dur: len * 1.8, vol: 0.42 });
  }
  if (pos % 2 === 1) CHORDS[bar].forEach((n) => tone(c, dest, { type: "square", freq: midiHz(n), t, dur: len * 0.4, vol: 0.035 }));
  if (pos === 0 || pos === 4) kick(c, dest, t, 0.5);
  hat(c, dest, t, pos % 2 ? 0.12 : 0.05);
}

// 오르골: 같은 멜로디. k(0.5~1)가 클수록 음이 틀어지고, 빠지고, 가끔 같은 음을 되풀이
function scheduleBox(c, dest, i, t, len, k, rand = Math.random) {
  const bar = Math.floor(i / 8), pos = i % 8;
  const bad = Math.max(0, Math.min(1, (k - 0.5) / 0.5));       // 0(멀쩡) ~ 1(완전히 망가짐)
  let m = MELODY[i];
  if (m && rand() < bad * 0.35) m = 0;                         // 음 빠짐
  if (!m && bad > 0.6 && rand() < 0.12) m = MELODY[(i + STEPS - 1) % STEPS];   // 앞 음이 다시 울림 (걸림)
  if (m) {
    const detune = (rand() - 0.5) * 2 * (15 + bad * 70) - bad * 25;   // 점점 음정이 처짐
    musicBoxNote(c, dest, midiHz(m + 12), t, 0.3, detune);
  }
  if (pos === 0) {                                                       // 마디 첫 박: 낮은 근음
    tone(c, dest, { type: "sine", freq: midiHz(ROOTS[bar] - 12), t, dur: 0.05, release: len * 7, vol: 0.18 + bad * 0.1, attack: 0.06, detune: -bad * 40 });
  }
  if (bad > 0.75 && pos === 4 && rand() < 0.3) {                         // 아주 망가지면 불협화음 한 방울
    musicBoxNote(c, dest, midiHz(MELODY[i] ? MELODY[i] + 13 : 85), t + len * 0.5, 0.12, -60);
  }
}

// 템포: 요리 132bpm. 오르골은 k=0.5에서 0.55배 → k=1에서 0.36배 (갈수록 늘어짐)
function stepLen(md, k) {
  const base = 60 / COOK_BPM / 2;
  if (md === "cook") return base;
  const bad = Math.max(0, Math.min(1, (k - 0.5) / 0.5));
  return base / (0.55 - bad * 0.19);
}

// ---------- 갑툭튀 전용 효과음 (A) ----------
// "fscare": F 서랍 — 쾅 + 찢어지는 현악 불협화음 + 떨어지는 비명 + 끊기는 잡음 + 금속 울림 (약 1.6초)
function distCurve(amount) {
  const n = 1024, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
  }
  return curve;
}

function stingFScare(c, out, t) {
  const bus = c.createGain();
  bus.gain.value = 0.66;                     // 최대 크기가 1을 넘지 않게 (스피커에서 찢어지지 않게)
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -10; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.25;
  bus.connect(comp); comp.connect(out);

  // 1) 쾅: 아주 낮은 충격음
  const boom = c.createOscillator(), bg = c.createGain();
  boom.type = "sine";
  boom.frequency.setValueAtTime(95, t);
  boom.frequency.exponentialRampToValueAtTime(28, t + 0.9);
  bg.gain.setValueAtTime(0.0001, t);
  bg.gain.linearRampToValueAtTime(1.0, t + 0.006);
  bg.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
  boom.connect(bg); bg.connect(bus);
  boom.start(t); boom.stop(t + 1.2);

  // 잡음 폭발 (높은 소리 → 낮은 소리로 닫힘)
  const nz = c.createBufferSource();
  nz.buffer = noiseBuf;
  nz.loop = true;
  const nf = c.createBiquadFilter();
  nf.type = "lowpass";
  nf.frequency.setValueAtTime(9000, t);
  nf.frequency.exponentialRampToValueAtTime(300, t + 0.5);
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.linearRampToValueAtTime(0.7, t + 0.004);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
  nz.connect(nf); nf.connect(ng); ng.connect(bus);
  nz.start(t); nz.stop(t + 0.6);

  // 2) 찢어지는 현악 불협화음: 반음씩 붙은 높은 톱니파 6개 + 빠른 떨림
  const shaper = c.createWaveShaper();
  shaper.curve = distCurve(18);
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 700;
  const sg = c.createGain();
  sg.gain.setValueAtTime(0.0001, t);
  sg.gain.linearRampToValueAtTime(0.32, t + 0.012);
  sg.gain.setValueAtTime(0.32, t + 0.35);
  sg.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
  shaper.connect(hp); hp.connect(sg); sg.connect(bus);
  const vib = c.createOscillator(), vibG = c.createGain();
  vib.frequency.value = 13;
  vibG.gain.value = 38;                       // 떨림 폭(센트)
  vib.connect(vibG);
  vib.start(t); vib.stop(t + 1.6);
  [1046.5, 1108.7, 1174.7, 1244.5, 1318.5, 2217.5].forEach((f, i) => {
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * (i % 2 ? 0.97 : 1.02), t + 1.4);   // 서로 어긋나며 더 불편하게
    vibG.connect(o.detune);
    const g = c.createGain();
    g.gain.value = 0.16;
    o.connect(g); g.connect(shaper);
    o.start(t); o.stop(t + 1.6);
  });

  // 3) 비명 같은 소리: 찌그러진 톱니파가 높은 곳에서 떨어짐 + '아' 모양 필터
  const sc = c.createOscillator();
  sc.type = "sawtooth";
  sc.frequency.setValueAtTime(980, t + 0.03);
  sc.frequency.exponentialRampToValueAtTime(240, t + 1.25);
  const scVib = c.createOscillator(), scVibG = c.createGain();
  scVib.frequency.value = 7; scVibG.gain.value = 60;
  scVib.connect(scVibG); scVibG.connect(sc.detune);
  const formant1 = c.createBiquadFilter(), formant2 = c.createBiquadFilter();
  formant1.type = "bandpass"; formant1.frequency.value = 850; formant1.Q.value = 6;
  formant2.type = "bandpass"; formant2.frequency.value = 1300; formant2.Q.value = 7;
  const scSh = c.createWaveShaper(); scSh.curve = distCurve(8);
  const scG = c.createGain();
  scG.gain.setValueAtTime(0.0001, t + 0.03);
  scG.gain.linearRampToValueAtTime(0.75, t + 0.08);
  scG.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
  sc.connect(scSh); scSh.connect(formant1); scSh.connect(formant2);
  formant1.connect(scG); formant2.connect(scG); scG.connect(bus);
  sc.start(t + 0.03); sc.stop(t + 1.35);
  scVib.start(t); scVib.stop(t + 1.35);

  // 4) 끊기는 지지직 (화면 F 깜빡임과 맞춤)
  let seed = 31;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 14; i++) {
    const st = t + 0.1 + i * 0.085 + rnd() * 0.03;
    const s2 = c.createBufferSource();
    s2.buffer = noiseBuf;
    const f2 = c.createBiquadFilter();
    f2.type = "bandpass"; f2.frequency.value = 1500 + rnd() * 3000; f2.Q.value = 2;
    const g2 = c.createGain();
    g2.gain.setValueAtTime(0.25 * (1 - i / 16), st);
    g2.gain.setValueAtTime(0.0001, st + 0.03 + rnd() * 0.03);
    s2.connect(f2); f2.connect(g2); g2.connect(bus);
    s2.start(st, rnd() * 0.3); s2.stop(st + 0.07);
  }

  // 5) 금속 울림 꼬리 (음정이 안 맞는 배음들)
  [311, 467, 739, 1093].forEach((f, i) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = "sine";
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + 0.05);
    g.gain.linearRampToValueAtTime(0.07 / (i + 1), t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(g); g.connect(bus);
    o.start(t + 0.05); o.stop(t + 1.65);
  });
}

let duckUntil = 0;
function sting(name) {
  const c = ensureCtx();
  if (!c) return false;
  if (c.state === "suspended") c.resume().catch(() => {});
  try {
    if (name === "fscare") {
      stingFScare(c, c.destination, c.currentTime + 0.01);
      duckUntil = performance.now() + 2200;          // 배경음악 잠깐 끔
      if (master) { master.gain.cancelScheduledValues(c.currentTime); master.gain.setValueAtTime(0, c.currentTime); }
      return true;
    }
  } catch (err) {
    console.warn("[BGM] 효과음 오류:", err);
  }
  return false;
}

// ---------- 게임 상태를 보고 무엇을 틀지 결정 ----------
function currentK() {
  if (forcedK !== null) return forcedK;
  const P3 = window.FCredit.Phase3;
  if (P3 && typeof P3.getMood === "function") {
    try { return P3.getMood().k; } catch (err) { /* 아래 계산으로 */ }
  }
  const T = window.FCredit.Timer;
  const rem = T && T.getRemaining ? T.getRemaining() : 600;
  return 0.5 + 0.5 * Math.pow(Math.max(0, 1 - rem / 600), 0.6);
}

function wantedMode() {
  if (forced !== undefined) return { mode: forced, level: 1 };
  const F = window.FCredit;
  const state = F.Main && F.Main.getState ? F.Main.getState() : null;
  if (state === "phase1") {
    const onTitle = !!document.querySelector("#phase1-root .p1-title-screen");
    return { mode: onTitle ? null : "cook", level: 1 };
  }
  if (state === "phase3" && F.Phase3 && typeof F.Phase3.getMood === "function") {
    let m;
    try { m = F.Phase3.getMood(); } catch (err) { return { mode: null, level: 0 }; }
    if (!m.active || m.finished) return { mode: null, level: 0 };
    if (m.prof && m.prof !== "WAIT") return { mode: null, level: 0 };   // 교수가 움직이면 C의 추격 배경음으로
    if (m.cutscene) return { mode: "box", level: 0 };                    // 히든 영상 중엔 잠시 무음
    return { mode: "box", level: m.playing ? 1 : 0.35 };                 // 일시정지 화면에선 작게
  }
  return { mode: null, level: 0 };
}

function setMasterLevel(target, fade) {
  if (!ctx || !master) return;
  const now = ctx.currentTime;
  const v = muted ? 0 : target * userVolume;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(master.gain.value, now);
  master.gain.linearRampToValueAtTime(v, now + fade);
}

function startMode(md) {
  mode = md;
  step = 0;
  nextTime = ctx.currentTime + 0.08;
  musicBus.wet.gain.setTargetAtTime(md === "box" ? 0.55 : 0, ctx.currentTime, 0.1);
  if (!schedTimer) schedTimer = setInterval(scheduler, 25);
  console.log(`[BGM] 재생: ${md === "cook" ? "요리 테마" : "망가진 오르골"}`);
}

function stopMode(fade = 0.6) {
  if (!mode) return;
  console.log("[BGM] 정지");
  mode = null;
  setMasterLevel(0, fade);
  if (schedTimer) { clearInterval(schedTimer); schedTimer = null; }
}

function scheduler() {
  if (!ctx || !mode) return;
  const k = currentK();
  while (nextTime < ctx.currentTime + LOOKAHEAD) {
    const len = stepLen(mode, k);
    if (mode === "cook") scheduleCook(ctx, musicBus, step, nextTime, len);
    else scheduleBox(ctx, musicBus, step, nextTime, len, k);
    // 많이 망가지면 가끔 박자가 걸려서 멈칫함
    const bad = Math.max(0, (k - 0.5) / 0.5);
    const hitch = mode === "box" && bad > 0.5 && Math.random() < bad * 0.08 ? len * (0.5 + Math.random()) : 0;
    nextTime += len + hitch;
    step = (step + 1) % STEPS;
  }
}

let lastWanted = null;
function tick() {
  if (document.hidden) { if (ctx && ctx.state === "running") ctx.suspend().catch(() => {}); return; }
  const w = wantedMode();
  if (!w.mode) {
    if (mode) stopMode(0.6);
    lastWanted = w;
    return;
  }
  const c = ensureCtx();
  if (!c) return;
  if (c.state === "suspended") { c.resume().catch(() => {}); if (c.state !== "running") return; }
  if (mode !== w.mode) {
    if (mode) { stopMode(0.3); }
    startMode(w.mode);
  }
  if (performance.now() < duckUntil) { lastWanted = w; return; }   // 갑툭튀 소리 중엔 배경음악 쉼
  setMasterLevel(BGM_VOL[w.mode] * w.level, 0.8);
  lastWanted = w;
}
setInterval(tick, 200);

// ---------- 미리듣기 녹음용 (OfflineAudioContext에 곡을 통째로 그림) ----------
function renderInto(offCtx, md, seconds, kFrom, kTo) {
  const saved = [master, musicBus, noiseBuf];         // 게임 중인 소리 장치는 건드리지 않게 잠시 보관
  try { renderBody(offCtx, md, seconds, kFrom, kTo); }
  finally { [master, musicBus, noiseBuf] = saved; }
}
function renderBody(offCtx, md, seconds, kFrom, kTo) {
  buildGraph(offCtx, offCtx.destination);
  master.gain.value = BGM_VOL[md] * 3;            // 녹음 파일은 조금 크게
  musicBus.wet.gain.value = md === "box" ? 0.55 : 0;
  let t = 0.05, i = 0;
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  while (t < seconds - 1.5) {
    const k = kFrom + (kTo - kFrom) * (t / seconds);
    const len = stepLen(md, k);
    if (md === "cook") scheduleCook(offCtx, musicBus, i, t, len);
    else scheduleBox(offCtx, musicBus, i, t, len, k, rand);
    const bad = Math.max(0, (k - 0.5) / 0.5);
    t += len + (md === "box" && bad > 0.5 && rand() < bad * 0.08 ? len * (0.5 + rand()) : 0);
    i = (i + 1) % STEPS;
  }
}

// ---------- 공개 함수 ----------
window.FCredit.BGM = {
  setVolume(v) { userVolume = Math.max(0, Math.min(1, Number(v) || 0)); },
  mute(on = true) { muted = !!on; },
  getMode: () => mode,
  test(md) { forced = md === undefined ? undefined : md; unlock(); },
  testK(k) { forcedK = k === null || k === undefined ? null : Number(k); },
  sting,                 // 갑툭튀 전용 효과음: FCredit.BGM.sting("fscare")
  _renderInto: renderInto,
  _renderSting(offCtx, name) {          // 미리듣기 녹음용
    const saved = noiseBuf;
    noiseBuf = offCtx.createBuffer(1, offCtx.sampleRate * 0.5, offCtx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    try { if (name === "fscare") stingFScare(offCtx, offCtx.destination, 0.05); }
    finally { noiseBuf = saved; }
  },
};
