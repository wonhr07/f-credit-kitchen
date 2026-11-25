// =========================================================
// js/gradesheet.js — 성적표 그리기 (담당: 팀원 A, 공용)
//
// 3D(A)와 엔딩(C)이 '같은 함수'로 성적표를 그려서
// 케첩 얼룩이 완전히 똑같이 보이게 한다. (그림 파일 없음, Canvas로 그림)
// 무작위처럼 보이는 모양도 '고정된 씨앗값'으로 그려서 매번 똑같이 나온다.
//
// 사용법:
//   const cv = FCredit.GradeSheet.createCanvas("aplus", 300); // 가로 300, 세로 400 캔버스
//   또는 FCredit.GradeSheet.draw(이미있는캔버스, "quiz");
//
// mode:
//   "quiz"  = 3D 꿈속 버전: 지켜보는 성적표 + 학점 칸에 교수 얼굴 + 위성 퀴즈 + 케첩
//   "aplus" = 일반 엔딩: 같은 무서운 성적표, 퀴즈만 사라지고 학점 칸에 빨간 A+ + 같은 케첩
//   "clean" = 리얼 해피엔딩: 무서운 요소·케첩 없이 깨끗한 종이에 A+
// =========================================================

window.FCredit = window.FCredit || {};

const BASE_W = 300;
const BASE_H = 400;
const FONT = "'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif";

// ---------- 도우미 ----------
function rng(seed) {                         // 항상 같은 순서로 나오는 '가짜 무작위'
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function text(g, str, x, y, size, color, align = "left", weight = "bold") {
  g.font = `${weight} ${size}px ${FONT}`;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = "middle";
  g.fillText(str, x, y);
}

function shakyText(g, str, x, y, size, color, seed, amp = 1.4) {   // 떨리는 손글씨
  const r = rng(seed);
  g.font = `bold ${size}px ${FONT}`;
  g.textBaseline = "middle";
  g.textAlign = "left";
  let cx = x;
  for (const ch of str) {
    const w = g.measureText(ch).width;
    g.save();
    g.translate(cx + w / 2, y + (r() - 0.5) * amp * 2);
    g.rotate((r() - 0.5) * 0.12 * amp);
    g.fillStyle = color;
    g.fillText(ch, -w / 2, 0);
    g.restore();
    cx += w;
  }
}

// ---------- 공통: 표 ----------
function drawTable(g, ink, headerFill) {
  text(g, "2026학년도 2학기", BASE_W / 2, 26, 11, ink, "center", "normal");
  text(g, "성  적  표", BASE_W / 2, 48, 22, ink, "center");
  g.fillStyle = ink;
  g.fillRect(20, 64, BASE_W - 40, 2);

  const rows = [["과   목", "기말 요리 평가"], ["학   번", "2026-1515"], ["성   명", "학   생"], ["담당교수", "교 수 님"]];
  g.strokeStyle = ink;
  g.lineWidth = 1;
  rows.forEach(([k, v], i) => {
    const y = 76 + i * 30;
    g.strokeRect(20, y, 60, 30);
    g.strokeRect(80, y, 110, 30);
    text(g, k, 50, y + 15, 11, ink, "center");
    text(g, v, 135, y + 15, 12, ink, "center", "normal");
  });
  g.strokeRect(200, 76, 80, 120);
  g.fillStyle = headerFill;
  g.fillRect(201, 77, 78, 22);
  text(g, "학  점", 240, 88, 12, ink, "center");

  g.strokeStyle = "rgba(80, 80, 80, 0.35)";
  for (let y = 236; y <= 316; y += 20) {
    g.beginPath(); g.moveTo(20, y); g.lineTo(BASE_W - 20, y); g.stroke();
  }
}

// ---------- 무서운 종이 ("보고 있다" + 안경 워터마크 + 어두운 가장자리) ----------
function drawScaryPaper(g) {
  g.fillStyle = "#e2dcc8";
  g.fillRect(0, 0, BASE_W, BASE_H);
  // 배경에 반복되는 "보고 있다"
  for (let y = 10; y < BASE_H; y += 26) {
    for (let x = ((y / 26) % 2) * 30 - 10; x < BASE_W; x += 62) {
      text(g, "보고 있다", x, y, 9, "rgba(60, 0, 0, 0.09)", "left", "normal");
    }
  }
  // 교수 안경 워터마크
  g.strokeStyle = "rgba(0, 0, 0, 0.10)";
  g.lineWidth = 6;
  [[110, 215], [190, 215]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 48, 0, Math.PI * 2); g.stroke(); });
  g.beginPath(); g.moveTo(158, 215); g.lineTo(142, 215); g.stroke();
  // 가장자리가 어두워지는 효과
  const vig = g.createRadialGradient(BASE_W / 2, BASE_H / 2, 120, BASE_W / 2, BASE_H / 2, 260);
  vig.addColorStop(0, "rgba(0, 0, 0, 0)");
  vig.addColorStop(1, "rgba(20, 10, 5, 0.55)");
  g.fillStyle = vig;
  g.fillRect(0, 0, BASE_W, BASE_H);

  drawTable(g, "#1c1c1c", "rgba(0, 0, 0, 0.12)");

  // 손글씨 + 도장
  shakyText(g, "왜 안 왔지?", 190, 335, 12, "rgba(140, 10, 10, 0.8)", 9);
  g.strokeStyle = "rgba(200, 30, 30, 0.75)";
  g.lineWidth = 2;
  g.beginPath(); g.arc(262, 365, 13, 0, Math.PI * 2); g.stroke();
  text(g, "교수", 262, 365, 9, "rgba(200, 30, 30, 0.75)", "center");
}

// 학점 칸: 나를 쳐다보는 교수 얼굴 (반사 안경 + 꿰맨 입)
function drawWatchingFace(g) {
  g.fillStyle = "#f6f7ff";
  g.strokeStyle = "#555";
  g.lineWidth = 2;
  [[225, 145], [255, 145]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 12, 0, Math.PI * 2); g.fill(); g.stroke(); });
  g.beginPath(); g.moveTo(237, 145); g.lineTo(243, 145); g.stroke();
  g.strokeStyle = "#8a1a1a";
  g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(226, 172); g.lineTo(254, 172); g.stroke();
  [230, 236, 242, 248].forEach((x) => { g.beginPath(); g.moveTo(x, 167); g.lineTo(x + 1, 177); g.stroke(); });
}

function drawQuiz(g) {
  text(g, "Q.", 22, 226, 14, "#8a0f0f");
  text(g, "태양계 행성들의 위성 개수를", 44, 226, 13, "#1a1a1a", "left", "normal");
  text(g, "전부 곱하시오.", 44, 246, 13, "#1a1a1a", "left", "normal");
  text(g, "※ 답 = 비밀번호의 마지막 숫자", 44, 288, 11, "#333", "left", "normal");
}

function drawAPlus(g, color) {
  g.save();
  g.translate(240, 148);
  g.rotate(-0.12);                       // 손으로 쓴 듯 살짝 기울임
  text(g, "A+", 0, 0, 52, color, "center");
  g.restore();
  g.strokeStyle = color;
  g.globalAlpha = 0.8;
  g.lineWidth = 3;
  g.beginPath();
  g.ellipse(240, 148, 34, 30, -0.2, 0.2, Math.PI * 2 - 0.1);
  g.stroke();
  g.globalAlpha = 1;
}

// ---------- 깨끗한 종이 (해피엔딩) ----------
function drawCleanPaper(g) {
  g.fillStyle = "#f6f1e3";
  g.fillRect(0, 0, BASE_W, BASE_H);
  g.strokeStyle = "rgba(120, 95, 50, 0.18)";
  g.lineWidth = 6;
  g.strokeRect(3, 3, BASE_W - 6, BASE_H - 6);
  drawTable(g, "#2a2a2a", "#ebe2c8");
  text(g, "참 잘했어요", 150, 266, 16, "rgba(40, 110, 60, 0.85)", "center");
  g.strokeStyle = "rgba(200, 30, 30, 0.75)";
  g.lineWidth = 2;
  g.beginPath(); g.arc(262, 360, 13, 0, Math.PI * 2); g.stroke();
  text(g, "교수", 262, 360, 9, "rgba(200, 30, 30, 0.75)", "center");
  text(g, "담당교수", 215, 360, 11, "#333", "center", "normal");
}

// =========================================================
// 케첩 얼룩 (실사풍) — 모든 숫자·씨앗값 수정 금지 (3D와 엔딩이 같아야 함)
// =========================================================

// 울퉁불퉁한 덩어리 모양 경로 (씨앗값으로 모양 고정)
function blobPath(g, cx, cy, radius, seed, bumps = 4, rough = 0.13) {
  const r = rng(seed);
  const waves = [];
  for (let i = 0; i < 3; i++) waves.push({ f: 2 + Math.floor(r() * bumps), p: r() * Math.PI * 2, a: rough * (0.35 + r() * 0.65) / (i + 1) });
  const N = 48;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    let k = 1;
    waves.forEach((w) => { k += w.a * Math.sin(w.f * t + w.p); });
    pts.push([cx + Math.cos(t) * radius * k, cy + Math.sin(t) * radius * k]);
  }
  g.beginPath();
  for (let i = 0; i < N; i++) {           // 점 사이를 부드러운 곡선으로
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % N];
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    if (i === 0) g.moveTo(mx, my);
    else g.quadraticCurveTo(x0, y0, mx, my);
  }
  const [x0, y0] = pts[0];
  const [x1, y1] = pts[1];
  g.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  g.closePath();
}

// 덩어리 하나: 종이에 스며든 자국 → 진한 몸통 → 마른 테두리 → 광택
function ketchupBlob(g, cx, cy, radius, seed) {
  // 1) 종이에 스며든 연한 번짐
  g.save();
  g.filter = "blur(1.5px)";
  blobPath(g, cx, cy, radius * 1.13, seed);
  g.fillStyle = "rgba(170, 45, 30, 0.22)";
  g.fill();
  g.restore();
  // 2) 몸통: 가운데는 진하고 가장자리는 조금 밝은 토마토색
  blobPath(g, cx, cy, radius, seed);
  const body = g.createRadialGradient(cx - radius * 0.2, cy - radius * 0.2, radius * 0.1, cx, cy, radius * 1.1);
  body.addColorStop(0, "#7c0b08");
  body.addColorStop(0.55, "#9e150d");
  body.addColorStop(1, "#b8241a");
  g.fillStyle = body;
  g.fill();
  // 3) 마르면서 생긴 진한 테두리
  g.strokeStyle = "rgba(85, 6, 4, 0.7)";
  g.lineWidth = 1.2;
  g.stroke();
}

// 광택 (빛 반사 하이라이트)
function gloss(g, x, y, w, h, rot) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  const hl = g.createRadialGradient(0, 0, 0, 0, 0, w);
  hl.addColorStop(0, "rgba(255, 235, 225, 0.75)");
  hl.addColorStop(1, "rgba(255, 200, 190, 0)");
  g.fillStyle = hl;
  g.beginPath(); g.ellipse(0, 0, w, h, 0, 0, Math.PI * 2); g.fill();
  g.restore();
}

// 흘러내린 자국: 위는 두껍고 아래로 갈수록 가늘어지다 끝에 방울
function ketchupDrip(g, x, y, len, w) {
  const grad = g.createLinearGradient(x, y, x, y + len);
  grad.addColorStop(0, "#9e150d");
  grad.addColorStop(1, "#7c0b08");
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(x - w / 2, y);
  g.quadraticCurveTo(x - w * 0.35, y + len * 0.6, x - w * 0.22, y + len);
  g.lineTo(x + w * 0.22, y + len);
  g.quadraticCurveTo(x + w * 0.35, y + len * 0.6, x + w / 2, y);
  g.closePath();
  g.fill();
  g.beginPath(); g.arc(x, y + len, w * 0.42, 0, Math.PI * 2); g.fill();   // 끝 방울
  gloss(g, x - w * 0.12, y + len - w * 0.1, w * 0.18, w * 0.1, 0);
}

// 튄 방울: 중심에서 바깥쪽으로 꼬리가 달린 작은 방울
function splatter(g, cx, cy, seed, count, minD, maxD) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2;
    const d = minD + r() * (maxD - minD);
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
    const size = 0.6 + r() * 1.7;
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.fillStyle = r() < 0.5 ? "#a3170e" : "#8c1009";
    g.beginPath(); g.ellipse(0, 0, size * (1.4 + r()), size, 0, 0, Math.PI * 2); g.fill();  // 길쭉한 방울
    if (size > 1.6) {                                                                          // 큰 방울엔 꼬리
      g.beginPath(); g.ellipse(-size * 2.2, 0, size * 0.9, size * 0.35, 0, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }
}

// 손가락으로 문지른 자국: 여러 가닥의 반투명 줄
function smear(g) {
  g.save();
  g.lineCap = "round";
  const strands = [[0, 7, 0.32], [-3, 3, 0.4], [3, 2.5, 0.35], [-1.5, 1.2, 0.5], [1.8, 1, 0.45]];
  strands.forEach(([off, w, a]) => {
    const grad = g.createLinearGradient(104, 0, 178, 0);
    grad.addColorStop(0, `rgba(160, 28, 18, ${a})`);
    grad.addColorStop(1, "rgba(160, 28, 18, 0)");
    g.strokeStyle = grad;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(104, 344 + off);
    g.quadraticCurveTo(140, 334 + off * 1.3, 178, 350 + off);
    g.stroke();
  });
  g.restore();
}

function drawKetchup(g) {
  // 큰 얼룩 (왼쪽 아래)
  ketchupBlob(g, 62, 350, 25, 101);
  ketchupBlob(g, 81, 345, 11, 202);
  ketchupBlob(g, 47, 339, 11, 303);
  ketchupDrip(g, 76, 362, 26, 9);
  ketchupDrip(g, 48, 364, 18, 6);
  ketchupDrip(g, 92, 346, 12, 4.5);
  splatter(g, 62, 350, 404, 16, 30, 48);
  smear(g);
  gloss(g, 52, 338, 9, 4, -0.6);
  gloss(g, 70, 360, 4, 2, -0.4);
  gloss(g, 85, 336, 3.5, 1.8, -0.5);
  // 위쪽 작은 얼룩 (오른쪽 위)
  ketchupBlob(g, 272, 40, 7, 505);
  splatter(g, 272, 40, 606, 6, 9, 17);
  gloss(g, 269, 37, 2.5, 1.3, -0.6);
}

// =========================================================
// 공개 함수
// =========================================================
window.FCredit.GradeSheet = {
  WIDTH: BASE_W,
  HEIGHT: BASE_H,

  // 이미 있는 캔버스에 그리기 (캔버스 크기에 맞춰 늘어남, 3:4 비율 권장)
  draw(canvas, mode = "quiz") {
    try {
      const g = canvas.getContext("2d");
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.scale(canvas.width / BASE_W, canvas.height / BASE_H);
      if (mode === "clean") {
        drawCleanPaper(g);
        drawAPlus(g, "#c81414");
      } else {
        drawScaryPaper(g);
        if (mode === "aplus") drawAPlus(g, "#c81414");
        else { drawWatchingFace(g); drawQuiz(g); }
        drawKetchup(g);           // 얼룩은 항상 맨 위, 같은 자리, 같은 모양
      }
      g.restore();
    } catch (err) {
      console.warn("[GradeSheet] 그리기 실패:", err);
    }
    return canvas;
  },

  // 새 캔버스를 만들어 그려서 돌려줌 (width만 정하면 세로는 자동 4:3)
  createCanvas(mode = "quiz", width = 600) {
    const cv = document.createElement("canvas");
    cv.width = width;
    cv.height = Math.round(width * BASE_H / BASE_W);
    return this.draw(cv, mode);
  },
};
