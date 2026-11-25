// =========================================================
// js/cutscene.js — 히든 영상 "녹화 테이프" (담당: 팀원 A)
//
// [v2 디자인] 팀 디자인 방향(docs/10)에 맞춤
//   ①②: 밝은 파스텔 픽셀 요리 방송 (크림·분홍 체크, 진한 갈색 외곽선)
//   ③④: 같은 그림체 그대로 "방송 사고" 톤 (검정·검붉은색, 주사선, RGB 분리)
//   자막: 대화창 스타일 (이름표 + 타자 효과, 어두운 장면은 글자 오염)
//
// 장면: ① 학생식당 TV "냉장고를 부탁해" (8초) ② 클로즈업 (6초)
//       ③ 연구실 출석부 (8초) ④ 악귀가 씌어 변신 (8초)  = 약 30초
//
// 이미지 파일 없이 Canvas(320×180)에 점으로 그리고 크게 확대(픽셀 느낌).
// 사용법:
//   FCredit.Cutscene.play(() => { 끝났을 때 할 일 });
//   FCredit.Cutscene.skip();  FCredit.Cutscene.stop();  FCredit.Cutscene.isPlaying();
// =========================================================

window.FCredit = window.FCredit || {};

const CW = 320, CH = 180;
const SCENES = [
  { name: "cafeteria", dur: 8, dark: false, label: "2026.06.02  PM 12:31  학생식당" },
  { name: "closeup",   dur: 6, dark: false, label: "2026.06.02  PM 12:33  학생식당" },
  { name: "office",    dur: 8, dark: true,  label: "2026.12.08  PM 11:47  연구실" },
  { name: "possess",   dur: 8, dark: true,  label: "2026.12.09  AM 00:00  연구실" },
];
const TOTAL = SCENES.reduce((a, s) => a + s.dur, 0);   // 30초

// 자막 (시작초, 끝초, 말하는 사람, 대사)
const SUBS = [
  [0.6, 7.6, "TV", "자, 15분 안에 냉장고 재료로 요리를 완성하세요!"],
  [8.6, 13.6, "교수", "기말시험은… 이렇게 하면 재밌겠군."],
  [14.6, 18.2, "교수", "…오늘도 아무도 안 왔군."],
  [18.4, 21.8, "교수", "15주 내내… 이래서야 학점을 줄 수가 없지."],
  [22.6, 25.8, "", "(어둠이 스며든다…)"],
  [26.2, 29.6, "교수", "학점을… 돌려받겠다."],
];
const TYPE_SPEED = 16;   // 자막 타자 속도 (글자/초)

// ---------- 팔레트 (docs/10 디자인 토큰과 같은 색) ----------
const C = {
  ink: "#2b2024", cream: "#fff4dc", pink: "#ffe3ec", pink2: "#ff8fab", mint: "#a8e6cf",
  yellow: "#ffd84d", red: "#e84a5f", sky: "#bfefff", wood: "#c98b5a", woodD: "#8a5a36",
  skin: "#ffd9b8", skinS: "#f0b896", hair: "#a7adb3", suit: "#3a3550", suitL: "#4d4868",
  shirt: "#ffffff", tie: "#e84a5f", lens: "#e9f4ff",
  // 방송 사고
  dBg: "#121012", dBg2: "#1c1719", dPanel: "#211d1f", dAcc: "#8b1e2b", dRed: "#ff2a3c",
  dCyan: "#00f0ff", pale: "#cfc4bc", paleS: "#a5978d", paper: "#efe8dc",
};
const FONT = "'Galmuri11', 'Malgun Gothic', sans-serif";

let g = null;
let rootEl = null, canvas = null, subEl = null, spkEl = null, txtEl = null, labelEl = null;
let rafId = null, startAt = 0, onEndCb = null, playing = false, glitchPlayed = false;
const profCanvas = document.createElement("canvas");   // 교수 스프라이트 (따로 그려서 확대)
profCanvas.width = 48; profCanvas.height = 64;

// ---------- 그리기 도우미 ----------
function R(x, y, w, h, c, ctx = g) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
// 외곽선 있는 상자 (레퍼런스의 굵은 갈색 테두리 느낌)
function box(x, y, w, h, fill, line = C.ink, ctx = g) { R(x, y, w, h, line, ctx); R(x + 1, y + 1, w - 2, h - 2, fill, ctx); }
function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function text(str, x, y, size, color, align = "center", ctx = g) {
  ctx.font = `bold ${size}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "top";
  ctx.fillText(str, x, y);
}
function checker(c1, c2, size, x0 = 0, y0 = 0, w = CW, h = CH) {
  for (let y = y0; y < y0 + h; y += size) for (let x = x0; x < x0 + w; x += size) {
    R(x, y, Math.min(size, x0 + w - x), Math.min(size, y0 + h - y), ((x - x0) / size + (y - y0) / size) % 2 ? c1 : c2);
  }
}

// ---------- 교수 스프라이트 (48×64, 우리 캐릭터: 회색 머리·뿔테·정장·빨간 넥타이) ----------
// o = { evil:0/1, lens:색, smile:bool, cheeks:bool, armUp:0~1(숟가락) }
function drawProf(o = {}) {
  const p = profCanvas.getContext("2d");
  p.clearRect(0, 0, 48, 64);
  const P = (x, y, w, h, c) => R(x, y, w, h, c, p);
  const evil = !!o.evil;
  const skin = evil ? C.pale : C.skin, shade = evil ? C.paleS : C.skinS;
  const cx = 24, top = 4;
  // 몸 (정장)
  P(cx - 18, top + 26, 36, 34, C.ink);
  P(cx - 17, top + 27, 34, 33, C.suit);
  for (let i = 0; i < 9; i++) P(cx - 5 + i / 2, top + 27 + i, 10 - i, 1, C.shirt);   // 흰 셔츠 V
  P(cx - 7, top + 27, 2, 12, C.suitL); P(cx + 5, top + 27, 2, 12, C.suitL);          // 옷깃
  P(cx - 2, top + 27, 4, 3, C.ink); P(cx - 1, top + 28, 2, 1, evil ? C.dAcc : C.tie);  // 넥타이 매듭
  P(cx - 2, top + 30, 4, 10, C.ink); P(cx - 1, top + 30, 2, 9, evil ? C.dAcc : C.tie); // 넥타이
  // 목
  P(cx - 4, top + 22, 8, 5, C.ink); P(cx - 3, top + 22, 6, 5, shade);
  // 머리
  P(cx - 12, top, 24, 23, C.ink);
  P(cx - 11, top + 1, 22, 21, skin);
  [[cx - 12, top], [cx + 11, top], [cx - 12, top + 22], [cx + 11, top + 22]].forEach(([x, y]) => p.clearRect(x, y, 1, 1));
  P(cx - 11, top + 1, 22, 4, C.hair);                          // 회색 머리
  P(cx - 11, top + 1, 3, 11, C.hair); P(cx + 8, top + 1, 3, 11, C.hair);
  P(cx - 14, top + 9, 3, 7, C.ink); P(cx - 13, top + 10, 2, 5, skin);   // 귀
  P(cx + 11, top + 9, 3, 7, C.ink); P(cx + 11, top + 10, 2, 5, skin);
  // 눈썹
  if (evil) { P(cx - 9, top + 6, 3, 1, C.ink); P(cx - 6, top + 7, 3, 1, C.ink); P(cx + 3, top + 7, 3, 1, C.ink); P(cx + 6, top + 6, 3, 1, C.ink); }
  else { P(cx - 9, top + 6, 6, 1, C.ink); P(cx + 3, top + 6, 6, 1, C.ink); }
  // 뿔테 안경
  P(cx - 10, top + 8, 9, 7, C.ink); P(cx + 1, top + 8, 9, 7, C.ink); P(cx - 1, top + 10, 2, 1, C.ink);
  const lens = evil ? "#f6f8ff" : (o.lens || C.lens);
  P(cx - 9, top + 9, 7, 5, lens); P(cx + 2, top + 9, 7, 5, lens);
  if (!evil && !o.lens) { P(cx - 7, top + 10, 2, 3, C.ink); P(cx + 4, top + 10, 2, 3, C.ink); }  // 눈동자
  if (!evil) { P(cx - 4, top + 9, 1, 1, "#ffffff"); P(cx + 7, top + 9, 1, 1, "#ffffff"); }        // 반짝
  // 코
  P(cx - 1, top + 15, 2, 3, shade);
  // 입
  if (evil) {
    P(cx - 6, top + 19, 12, 1, C.dRed);                                   // 꿰맨 입
    for (let x = cx - 5; x <= cx + 5; x += 2) P(x, top + 18, 1, 3, C.dRed);
  } else if (o.smile) {
    P(cx - 4, top + 18, 1, 1, C.ink); P(cx - 3, top + 19, 6, 1, C.ink); P(cx + 3, top + 18, 1, 1, C.ink);
  } else {
    P(cx - 3, top + 19, 6, 1, C.ink);
  }
  if (o.cheeks && !evil) { P(cx - 10, top + 16, 3, 1, C.pink2); P(cx + 7, top + 16, 3, 1, C.pink2); }
  // 숟가락 든 팔 (armUp 0~1)
  if (o.armUp !== undefined) {
    const ay = Math.round(top + 44 - o.armUp * 18);
    P(cx + 10, ay, 7, 18, C.ink); P(cx + 11, ay + 1, 5, 16, C.suitL);
    P(cx + 10, ay - 4, 7, 5, C.ink); P(cx + 11, ay - 3, 5, 3, skin);
    P(cx + 13, ay - 11, 2, 8, C.ink); P(cx + 12, ay - 13, 4, 3, "#c8cdd3");   // 숟가락
  }
}

// 교수 스프라이트를 (x, y) 기준(가운데 위)으로 scale배 확대해 그리기 (회전·RGB 분리 선택)
function blitProf(x, y, scale, rot = 0, rgb = 0) {
  const w = 48 * scale, h = 64 * scale;
  const draw = (dx, alpha, tint) => {
    g.save();
    g.translate(x + dx, y + h / 2);
    g.rotate(rot);
    g.globalAlpha = alpha;
    if (tint) {                                     // 빨강·하늘색으로 어긋난 잔상
      g.globalCompositeOperation = "lighter";
      g.filter = tint;
    }
    g.drawImage(profCanvas, -w / 2, -h / 2, w, h);
    g.restore();
  };
  if (rgb) {
    draw(-rgb, 0.5, "sepia(1) saturate(8) hue-rotate(-50deg)");
    draw(rgb, 0.5, "sepia(1) saturate(8) hue-rotate(150deg)");
  }
  draw(0, 1, null);
}

// ---------- 화면 효과 ----------
function scanlines(strength) {
  g.fillStyle = `rgba(0,0,0,${0.08 * strength})`;
  for (let y = 0; y < CH; y += 2) g.fillRect(0, y, CW, 1);
}
function vignette(alpha) {
  const v = g.createRadialGradient(CW / 2, CH / 2, 60, CW / 2, CH / 2, 200);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, `rgba(0,0,0,${alpha})`);
  g.fillStyle = v;
  g.fillRect(0, 0, CW, CH);
}
function noise(t, amount, color = "rgba(255,255,255,0.12)") {
  const r = rng(Math.floor(t * 24) + 3);
  g.fillStyle = color;
  for (let i = 0; i < amount; i++) g.fillRect(Math.floor(r() * CW), Math.floor(r() * CH), 1, 1);
}
function tearLines(t, chance) {                      // 가로줄 밀림
  const r = rng(Math.floor(t * 18) + 11);
  if (r() > chance) return;
  const y = Math.floor(r() * (CH - 6));
  const img = g.getImageData(0, y, CW, 3 + Math.floor(r() * 5));
  g.putImageData(img, Math.floor((r() - 0.5) * 16), y);
}

// ---------- 장면 ①: 학생식당 (밝은 방송) ----------
function sceneCafeteria(t) {
  checker(C.pink, C.cream, 12, 0, 0, CW, 112);               // 체크무늬 벽
  R(0, 110, CW, 3, C.ink);
  R(0, 113, CW, 67, "#e9c89a");                               // 나무 바닥
  for (let y = 120; y < CH; y += 10) R(0, y, CW, 1, "#d4ab78");
  for (let x = 0; x < CW; x += 40) R(x + ((x / 40) % 2) * 20, 113, 1, 67, "#d4ab78");
  // 벽걸이 TV
  box(194, 8, 112, 72, C.ink);
  box(196, 10, 108, 68, C.pink2);
  const flick = Math.sin(t * 9) > 0.7 ? "#9fd8f0" : C.sky;
  box(200, 14, 100, 52, flick);
  box(203, 17, 30, 9, C.red); text("ON AIR", 218, 18, 7, "#fff");
  text("냉장고를 부탁해", 250, 28, 11, "#fff");
  g.fillStyle = C.ink; g.globalAlpha = 0.35; g.fillText("냉장고를 부탁해", 251, 29); g.globalAlpha = 1;
  text("냉장고를 부탁해", 250, 28, 11, "#fff");
  const left = Math.max(0, 900 - Math.floor(t * 40));
  text(`${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`, 278, 17, 8, C.ink);
  [222, 276].forEach((cx, i) => {                              // TV 속 요리사 둘
    const bob = Math.round(Math.sin(t * 6 + i * 2) * 1.5);
    box(cx - 5, 41 + bob, 10, 6, "#ffffff");                   // 모자
    box(cx - 4, 46 + bob, 8, 6, C.skin);
    box(cx - 6, 51 + bob, 12, 9, "#ffffff");
  });
  box(204, 58, 92, 6, "#c8cdd3");                              // TV 속 조리대
  R(246, 80, 8, 6, C.ink);
  // 교수 (식탁에 앉아 밥 먹음)
  const spoon = (Math.sin(t * 2.4) + 1) / 2;
  drawProf({ lens: t % 2 < 1 ? "#bfe4ff" : "#e4f4ff", cheeks: true, armUp: spoon });
  blitProf(104, 40, 1.6);
  // 식탁, 식판
  box(20, 118, 172, 10, C.wood);
  R(21, 127, 170, 2, C.woodD);
  box(28, 128, 6, 36, C.woodD); box(178, 128, 6, 36, C.woodD);
  box(72, 111, 64, 8, "#e4e8ec");
  box(78, 104, 14, 8, "#ffffff"); R(80, 103, 10, 3, "#ffffff");    // 밥
  box(98, 105, 14, 7, C.red);                                      // 국
  box(118, 106, 12, 6, C.mint);                                    // 반찬
  // 빈 식탁 (아무도 없음)
  box(218, 130, 92, 8, C.wood); box(226, 138, 5, 26, C.woodD); box(298, 138, 5, 26, C.woodD);
}

// ---------- 장면 ②: 클로즈업 (밝은 방송, 살짝 섬뜩) ----------
function sceneCloseup(t) {
  checker(C.pink, C.cream, 16);
  g.fillStyle = t % 0.6 < 0.3 ? "rgba(120,180,255,0.18)" : "rgba(120,180,255,0.08)";   // TV 불빛
  g.fillRect(0, 0, CW, CH);
  drawProf({ smile: t > 2.2, cheeks: t < 2.2, lens: t % 1 < 0.5 ? "#9fd0ff" : "#f0f8ff" });
  const zoom = 3.2 + Math.min(1, t / 6) * 0.4;                     // 천천히 다가감
  blitProf(160, 8 - (zoom - 3.2) * 10, zoom);
  vignette(0.25 + Math.min(1, t / 6) * 0.25);
}

// ---------- 장면 ③: 연구실 밤, 출석부 (방송 사고 톤) ----------
function sceneOffice(t) {
  checker(C.dBg2, C.dBg, 16);
  box(110, 10, 52, 38, C.dPanel, "#000"); R(111, 28, 50, 1, "#000"); R(135, 11, 1, 36, "#000");  // 창문
  box(143, 14, 10, 10, "#e8e4c0", "#000");                                                       // 달
  for (let i = 0; i < 4; i++) {                                                                  // 책장
    box(12, 26 + i * 22, 54, 4, C.woodD, "#000");
    for (let j = 0; j < 6; j++) box(15 + j * 8, 16 + i * 22, 6, 10, [C.dAcc, "#2a4a5a", "#4a4a2a"][(i + j) % 3], "#000");
  }
  g.fillStyle = "rgba(255, 220, 140, 0.14)";                                                     // 스탠드 불빛
  g.beginPath(); g.moveTo(86, 64); g.lineTo(52, 128); g.lineTo(150, 128); g.closePath(); g.fill();
  box(78, 56, 18, 8, "#b6a46b", "#000"); R(86, 64, 2, 58, "#000");
  drawProf({});
  blitProf(108, 56, 1.1);
  box(24, 120, 232, 10, C.woodD, "#000");                                                        // 책상
  // 출석부 (종이 카드, 오프셋 그림자)
  const week = Math.min(15, 3 + Math.floor(t * 1.6));
  R(182, 36, 130, 92, "#000");
  box(178, 32, 130, 92, C.paper, "#000");
  R(179, 33, 128, 12, C.dAcc);
  text(`출석부  ${week}주차`, 243, 34, 9, "#fff");
  const r = rng(42);
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 15; col++) {
      const x = 184 + col * 8, y = 50 + row * 12;
      if (col >= week) { R(x, y, 5, 5, "#d8d0c2"); continue; }
      if (r() < col / 15 + 0.1) {                                                                // ×
        g.strokeStyle = "#b01818"; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + 5, y + 5); g.moveTo(x + 5, y); g.lineTo(x, y + 5); g.stroke();
      } else {                                                                                   // ○
        g.strokeStyle = "#2f7a3a"; g.lineWidth = 1;
        g.beginPath(); g.arc(x + 2.5, y + 2.5, 2.3, 0, Math.PI * 2); g.stroke();
      }
    }
  }
  vignette(0.55);
}

// ---------- 장면 ④: 악귀가 씌어 변신 (방송 사고) ----------
function scenePossess(t) {
  const lampOn = !(t > 1 && Math.sin(t * 23) > 0.3);
  checker(lampOn ? C.dBg2 : "#0b090b", lampOn ? C.dBg : "#060506", 16);
  box(78, 56, 18, 8, lampOn ? "#b6a46b" : "#3a3426", "#000"); R(86, 64, 2, 58, "#000");
  if (lampOn) {
    g.fillStyle = "rgba(255, 220, 140, 0.10)";
    g.beginPath(); g.moveTo(86, 64); g.lineTo(52, 128); g.lineTo(150, 128); g.closePath(); g.fill();
  }
  const evil = t > 4.2;
  const shake = t > 3 ? Math.round((Math.random() - 0.5) * 3) : 0;
  drawProf({ evil });
  const rgb = t > 3.6 ? (Math.random() < 0.5 ? 3 : 1) : 0;
  blitProf(160 + shake, 6, 2.2, evil ? 0.12 : 0, rgb);
  // 검붉은 그림자 입자가 교수에게 빨려 들어감
  const r = rng(77);
  for (let i = 0; i < 80; i++) {
    const a0 = r() * Math.PI * 2, d0 = 120 + r() * 90, speed = 0.6 + r() * 0.8;
    const p = Math.min(1, Math.max(0, (t - 0.5) * 0.28 * speed - r() * 0.3));
    if (p >= 1) continue;
    const a = a0 + p * 3, d = d0 * (1 - p);
    box(160 + Math.cos(a) * d, 70 + Math.sin(a) * d * 0.6, 4, 4, r() < 0.5 ? C.dAcc : "#2a0a10", "#000");
  }
  box(24, 150, 272, 10, C.woodD, "#000");
  vignette(0.7);
  if (t > 7) {                                                    // 끝: 잡음이 화면을 덮음
    const k = t - 7;
    const rr = rng(Math.floor(t * 30));
    for (let i = 0; i < 1600 * k; i++) R(rr() * CW, rr() * CH, 2, 1, rr() < 0.5 ? "#ddd" : "#222");
    R(0, 0, CW, CH, `rgba(0,0,0,${Math.min(1, k * 0.9)})`);
  }
}

// ---------- 화면 구성 (DOM) ----------
function buildDOM() {
  rootEl = document.createElement("div");
  rootEl.className = "p3-cs-root";
  canvas = document.createElement("canvas");
  canvas.width = CW; canvas.height = CH;
  canvas.className = "p3-cs-canvas";
  labelEl = document.createElement("div");
  labelEl.className = "p3-cs-label";
  const rec = document.createElement("div");
  rec.className = "p3-cs-rec";
  rec.textContent = "● REC";
  subEl = document.createElement("div");
  subEl.className = "p3-cs-sub";
  spkEl = document.createElement("div");
  spkEl.className = "p3-cs-spk";
  txtEl = document.createElement("div");
  txtEl.className = "p3-cs-txt";
  subEl.append(spkEl, txtEl);
  const skip = document.createElement("div");
  skip.className = "p3-cs-skip";
  const touchMode = new URLSearchParams(location.search).get("touch") === "1"
    || (new URLSearchParams(location.search).get("touch") !== "0" && !!(window.matchMedia && matchMedia("(hover: none) and (pointer: coarse)").matches));
  skip.textContent = touchMode ? "탭하면 건너뛰기" : "[E] 건너뛰기";
  const scan = document.createElement("div");
  scan.className = "p3-cs-scan";
  rootEl.append(canvas, scan, rec, labelEl, subEl, skip);
  document.body.appendChild(rootEl);
  g = canvas.getContext("2d", { willReadFrequently: true });
  g.imageSmoothingEnabled = false;
}

function render() {
  const t = (performance.now() - startAt) / 1000;
  if (t >= TOTAL) { finish(); return; }
  rafId = requestAnimationFrame(render);

  let acc = 0, scene = SCENES[0], local = t;
  for (const s of SCENES) {
    if (t < acc + s.dur) { scene = s; local = t - acc; break; }
    acc += s.dur;
  }
  g.imageSmoothingEnabled = false;
  try {
    if (scene.name === "cafeteria") sceneCafeteria(local);
    else if (scene.name === "closeup") sceneCloseup(local);
    else if (scene.name === "office") sceneOffice(local);
    else scenePossess(local);
    // VHS 효과: 밝은 장면은 은은하게, 방송 사고는 강하게
    scanlines(scene.dark ? 2 : 1);
    noise(t, scene.dark ? 140 : 40);
    tearLines(t, scene.dark ? 0.25 : 0.05);
  } catch (err) {
    console.warn("[Cutscene] 그리기 오류:", err);
  }
  if (local < 0.25) { R(0, 0, CW, CH, "rgba(230,230,230,0.25)"); noise(t, 600); }   // 장면 전환 지지직

  rootEl.classList.toggle("p3-cs-dark", scene.dark);
  labelEl.textContent = scene.label;

  // 자막: 타자 효과 (어두운 장면은 글자 오염)
  const sub = SUBS.find(([a, b]) => t >= a && t <= b);
  if (sub) {
    const [a, , who, line] = sub;
    const chars = [...line];
    const n = Math.min(chars.length, Math.floor((t - a) * TYPE_SPEED) + 1);
    let shown = chars.slice(0, n).join("");
    if (scene.dark && n < chars.length && Math.random() < 0.3) shown += ["█", "▓", "F", "?"][Math.floor(Math.random() * 4)];
    spkEl.textContent = who;
    spkEl.hidden = !who;
    txtEl.textContent = shown;
    subEl.style.visibility = "visible";
  } else {
    subEl.style.visibility = "hidden";
  }

  if (!glitchPlayed && t > 26) {                                 // 변신 순간 글리치 소리
    glitchPlayed = true;
    const P4 = window.FCredit.Phase4;
    if (P4 && typeof P4.playSound === "function") P4.playSound("glitch");
  }
}

function finish() {
  if (!playing) return;
  playing = false;
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
  if (rootEl) rootEl.remove();
  rootEl = canvas = subEl = spkEl = txtEl = labelEl = null;
  const cb = onEndCb;
  onEndCb = null;
  if (typeof cb === "function") {
    try { cb(); } catch (err) { console.error("[Cutscene] 끝 처리 오류:", err); }
  }
}

window.FCredit.Cutscene = {
  DURATION: TOTAL,
  play(onEnd) {
    if (playing) return false;
    playing = true;
    glitchPlayed = false;
    onEndCb = onEnd;
    buildDOM();
    startAt = performance.now();
    render();
    console.log("[Cutscene] 재생 시작");
    return true;
  },
  skip() { console.log("[Cutscene] 건너뛰기"); finish(); },
  stop() { finish(); },
  isPlaying: () => playing,
  _seek(sec) { startAt = performance.now() - sec * 1000; },   // 테스트용
};
