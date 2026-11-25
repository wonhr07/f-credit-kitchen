// =========================================================
// js/main.js — 게임 전체 흐름 관리 (담당: 팀원 A, 통합)
//
// 역할: 각 모듈(Phase1, Transition, Phase3, Phase4)을 순서대로 실행하고,
//       모듈끼리 보내는 이벤트를 받아 다음 단계로 넘긴다.
//       모듈끼리는 서로 직접 호출하지 않고, 이벤트만 주고받는다.
//
// 흐름: phase1 → (phase1Complete) → transition → (transitionComplete)
//       → phase3 → (phase3Complete) → ending
//
// 테스트용 주소:
//   index.html?start=phase3       → 2D를 건너뛰고 3D부터 시작
//   index.html?start=phase3&t=30  → 3D를 '게임시간 30초 남음'으로 시작 (추격 테스트용)
//   index.html?start=ending       → 엔딩만 바로 확인 (일반 엔딩)
//   index.html?start=ending&type=happy → 해피엔딩만 바로 확인
//
// 타이머: 게임 속 15분 = 실제 5분 (3배속)
//   2D: 15:00 → 10:00 ([게임 시작]부터 흐름, 타이틀 화면에선 숨김, 10:00에서 멈춰 3D를 기다림)
//   3D: 항상 10:00에서 시작 → 00:00 되면 'contestTimeUp' 이벤트 (교수 추격 시작)
// =========================================================

window.FCredit = window.FCredit || {};
const F = window.FCredit;

// ---------- 1. 게임 상태 ----------
// boot | phase1 | transition | phase3 | ending | finished
let currentState = "boot";

function setState(next) {
  console.log(`[main] 상태 변경: ${currentState} → ${next}`);
  currentState = next;
}

// ---------- 1-2. 대결 타이머 (2D·3D 공통) ----------
const TIMER = {
  START: 15 * 60,       // 게임 시작 15:00
  PHASE3_START: 10 * 60, // 3D 시작 10:00
  SPEED: 3,             // 게임 시간이 실제보다 3배 빠름 (15분 → 실제 5분)
};

const timer = {
  remaining: TIMER.START,  // 남은 '게임 시간' (초)
  floor: 0,                // 이 아래로는 안 내려감 (2D에서는 10:00)
  running: false,
  last: 0,
  timeUpSent: false,
  wantShow: false,         // 단계상 보여야 하는지 (타이틀 화면에서는 이 값과 상관없이 숨김)
  el: null,
};

function timerCreateUI() {
  timer.el = document.createElement("div");
  timer.el.id = "game-timer";
  timer.el.hidden = true;
  document.body.appendChild(timer.el);
}

function timerRender() {
  if (!timer.el) return;
  const t = Math.max(0, Math.ceil(timer.remaining));
  const mm = String(Math.floor(t / 60)).padStart(2, "0");
  const ss = String(t % 60).padStart(2, "0");
  timer.el.innerHTML = t > 0
    ? `<span class="gt-label">남은 시간</span><span class="gt-time">${mm}:${ss}</span>`
    : `<span class="gt-label">대결 종료</span><span class="gt-time">00:00</span>`;
  timer.el.classList.toggle("gt-danger", t <= 60);
  timer.el.classList.toggle("gt-over", t <= 0);
}

// 타이머 보이기: 켜져 있어도 2D 타이틀 화면에서는 숨김
function timerApplyVisible() {
  if (!timer.el) return;
  const hide = !timer.wantShow || onTitleScreen();
  if (timer.el.hidden !== hide) timer.el.hidden = hide;
}

function timerTick() {
  timerApplyVisible();
  if (!timer.running) return;
  const now = performance.now();
  const dt = Math.min((now - timer.last) / 1000, 0.5);   // 탭 전환 등으로 큰 값 방지
  timer.last = now;
  timer.remaining = Math.max(timer.floor, timer.remaining - dt * TIMER.SPEED);
  timerRender();
  if (timer.remaining <= 0 && !timer.timeUpSent && currentState === "phase3") {
    timer.timeUpSent = true;
    console.log("[main] 대결 시간 종료 → contestTimeUp");
    window.dispatchEvent(new CustomEvent("contestTimeUp"));
  }
}
setInterval(timerTick, 100);

// 다른 모듈(주로 Phase3)이 쓰는 타이머 함수
F.Timer = {
  pause() { timerTick(); timer.running = false; },
  resume() {
    if (timer.running) return;
    timer.last = performance.now();
    timer.running = true;
  },
  set(gameSeconds) { timer.remaining = Math.max(0, gameSeconds); timer.timeUpSent = gameSeconds <= 0 ? timer.timeUpSent : false; timerRender(); },
  getRemaining: () => timer.remaining,
  isTimeUp: () => timer.remaining <= 0,
  show(on) { timer.wantShow = !!on; timerApplyVisible(); },
};

// 단계별 타이머 설정
function timerForPhase1() {
  timer.remaining = TIMER.START;
  timer.floor = TIMER.PHASE3_START;     // 2D에서는 10:00 아래로 안 내려감
  timer.timeUpSent = false;
  F.Timer.pause();
  F.Timer.show(true);
  timerRender();
  waitFirstInputInPhase1();             // 플레이어가 처음 클릭(또는 키 입력)한 순간부터 흐름
}

// B의 2D 타이틀 화면(.p1-title-screen)이 떠 있는지
function onTitleScreen() {
  return currentState === "phase1" && !!document.querySelector("#phase1-root .p1-title-screen");
}

// 2D가 열리자마자 타이머가 흐르지 않도록, 첫 입력을 기다렸다가 시작
let firstInputHandler = null;
function waitFirstInputInPhase1() {
  if (firstInputHandler) return;
  firstInputHandler = (e) => {
    if (currentState !== "phase1") return;          // 2D가 아닐 때의 입력은 무시하고 계속 기다림
    // B의 타이틀 화면이 떠 있으면 [게임 시작] 버튼을 누를 때까지 기다림
    if (onTitleScreen()) {
      const t = e && e.target;
      if (!(t && t.closest && t.closest('[data-action="begin"]'))) return;
    }
    window.removeEventListener("pointerdown", firstInputHandler, true);
    window.removeEventListener("keydown", firstInputHandler, true);
    firstInputHandler = null;
    if (!document.hidden) F.Timer.resume();
    console.log("[main] 첫 입력 → 타이머 시작");
  };
  window.addEventListener("pointerdown", firstInputHandler, true);
  window.addEventListener("keydown", firstInputHandler, true);
}

function timerForPhase3() {
  F.Timer.pause();
  const t = Number(new URLSearchParams(location.search).get("t"));
  timer.remaining = Number.isFinite(t) && t > 0 ? t : TIMER.PHASE3_START;   // 항상 10:00 (테스트 주소 t 제외)
  timer.floor = 0;
  timer.timeUpSent = false;
  F.Timer.show(true);
  timerRender();
  // 실제로 흐르기 시작하는 건 플레이어가 클릭해서 마우스가 잠긴 뒤 (Phase3가 resume 호출)
}

// 2D 중에 탭을 옮기면 타이머도 멈춤 (3D는 Phase3가 직접 처리)
document.addEventListener("visibilitychange", () => {
  if (currentState !== "phase1") return;
  if (document.hidden) F.Timer.pause();
  else if (!firstInputHandler) F.Timer.resume();   // 아직 첫 입력 전이면 계속 대기
});

// ---------- 1-3. 엔딩 수집 (이 브라우저에 기록이 남음) ----------
// 엔딩을 보면 자동으로 기록됨. B(타이틀)·C(엔딩 화면)는 FCredit.Endings 로 읽어서 표시만 하면 됨.
const ENDINGS = [
  { id: "normal", name: "꿈에서 깨어나다" },   // 출입문 탈출
  { id: "happy", name: "리얼 해피엔딩" },      // 히든 루트 (교수님 안아주기)
];
const ENDING_KEY = "fcredit-endings-v1";

function endingsLoad() {
  try {
    const raw = localStorage.getItem(ENDING_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (err) {
    return [];                       // 저장소를 못 쓰는 환경이면 기록 없이 진행
  }
}

let endingsFound = endingsLoad();

F.Endings = {
  TOTAL: ENDINGS.length,
  // 엔딩 기록 (main이 startEnding 때 자동 호출. 처음 본 엔딩이면 true)
  record(id) {
    if (!ENDINGS.some((e) => e.id === id) || endingsFound.includes(id)) return false;
    endingsFound.push(id);
    try { localStorage.setItem(ENDING_KEY, JSON.stringify(endingsFound)); } catch (err) { /* 무시 */ }
    console.log(`[main] 새 엔딩 발견: ${id} (${endingsFound.length}/${ENDINGS.length})`);
    return true;
  },
  count: () => endingsFound.length,
  has: (id) => endingsFound.includes(id),
  // [{ id, name, found }] — 못 찾은 엔딩은 name 이 "???"
  list: () => ENDINGS.map((e) => ({ id: e.id, name: endingsFound.includes(e.id) ? e.name : "???", found: endingsFound.includes(e.id) })),
  // 표시용 한 줄: "발견한 엔딩 1/2"
  summary: () => `발견한 엔딩 ${endingsFound.length}/${ENDINGS.length}`,
  // 테스트용: 기록 지우기 (Console 에서 FCredit.Endings.clear())
  clear() {
    endingsFound = [];
    try { localStorage.removeItem(ENDING_KEY); } catch (err) { /* 무시 */ }
  },
};

// ---------- 2. 화면 오류 표시 ----------
const errorBox = document.getElementById("boot-error");

function showError(message) {
  console.error("[main] " + message);
  if (!errorBox) return;
  errorBox.hidden = false;
  errorBox.textContent += (errorBox.textContent ? "\n" : "") + "⚠ " + message;
}

// 실행 중 생기는 모든 오류를 화면에도 표시 (F12를 안 열어도 알 수 있게)
window.addEventListener("error", (e) => {
  showError(`오류: ${e.message} (${e.filename || "?"}:${e.lineno || "?"})`);
});
window.addEventListener("unhandledrejection", (e) => {
  showError(`비동기 오류: ${e.reason}`);
});

// ---------- 3. 안전한 함수 호출 ----------
// 다른 담당자의 모듈이 아직 없거나 오류가 나도 게임 전체가 멈추지 않게 한다.

// 모듈이 없을 때 대신 실행할 동작 (게임이 다음 단계로 넘어갈 수 있게)
const FALLBACK = {
  "Phase1.start": () => {
    showError("Phase1 모듈이 없어 2D 단계를 건너뜁니다.");
    setTimeout(() => window.dispatchEvent(new CustomEvent("phase1Complete", { detail: { choice: "none" } })), 0);
  },
  "Transition.start": () => {
    setTimeout(() => window.dispatchEvent(new CustomEvent("transitionComplete")), 0);
  },
  "Phase3.start": () => {
    showError("3D 모듈(Phase3)을 불러오지 못했습니다. 인터넷 연결(Three.js CDN) 또는 js/phase3.js 오류를 확인하세요.");
  },
  "Phase4.startEnding": (endingType) => {
    showError(`엔딩 모듈(Phase4)이 없습니다. (endingType: ${endingType})`);
  },
};

function call(moduleName, fnName, ...args) {
  const mod = F[moduleName];
  const fn = mod && mod[fnName];
  const key = `${moduleName}.${fnName}`;

  if (typeof fn !== "function") {
    console.warn(`[main] FCredit.${key}() 가 없습니다 → 대체 동작 실행`);
    if (FALLBACK[key]) FALLBACK[key](...args);
    return undefined;
  }
  try {
    return fn.apply(mod, args);
  } catch (err) {
    showError(`FCredit.${key}() 실행 중 오류: ${err && err.message ? err.message : err}`);
    console.error(err);
    if (FALLBACK[key]) FALLBACK[key](...args);
    return undefined;
  }
}

// 있으면 호출, 없으면 조용히 넘어감 (선택 함수용)
function callIfExists(moduleName, fnName, ...args) {
  const mod = F[moduleName];
  if (mod && typeof mod[fnName] === "function") return call(moduleName, fnName, ...args);
  return undefined;
}

// ---------- 4. 단계 시작 함수 ----------
function startPhase1() {
  setState("phase1");
  timerForPhase1();
  call("Phase1", "start");
}

function startPhase3() {
  setState("phase3");
  timerForPhase3();
  call("Phase3", "start");
}

function startEnding(endingType) {
  setState("ending");
  const isNew = F.Endings.record(endingType === "happy" ? "happy" : "normal");
  window.lastEndingIsNew = isNew;      // (참고용) 이번 엔딩이 처음 본 것인지
  F.Timer.pause();
  F.Timer.show(false);
  call("Phase4", "startEnding", endingType);
}

// 다시 시작: from = "phase1"(처음부터) 또는 "phase3"(3D부터)
function restart(from) {
  console.log(`[main] 재시작 요청: ${from}`);
  call("Phase4", "stop");
  call("Phase3", "stop");
  call("Phase3", "reset");
  if (from === "phase1") {
    call("Phase1", "stop");
    call("Phase1", "reset");
    startPhase1();
  } else {
    startPhase3();
  }
}

// ---------- 5. 이벤트 연결 (모듈 → main) ----------
// 상태 검사: 같은 이벤트가 두 번 와도 한 번만 처리 (중복 실행 방지)
function ignore(eventName) {
  console.warn(`[main] '${eventName}' 이벤트 무시 (현재 상태: ${currentState})`);
}

// B의 2D 게임이 끝남 → 전환 연출 시작
window.addEventListener("phase1Complete", (e) => {
  if (currentState !== "phase1") return ignore("phase1Complete");
  console.log("[main] 2D 선택 결과:", e.detail);
  setState("transition");
  F.Timer.pause();
  call("Transition", "start");
});

// B의 전환 연출이 '완전히 검은 화면'에 도달 → 2D 끄고 3D 켜기
// (이 처리는 즉시(동기) 실행되므로, Transition은 이 이벤트 직후 검은 화면을 걷어내면 된다)
window.addEventListener("transitionComplete", () => {
  if (currentState !== "transition") return ignore("transitionComplete");
  call("Phase1", "stop");
  startPhase3();
});

// A의 3D 게임 탈출 성공 → C의 엔딩
window.addEventListener("phase3Complete", (e) => {
  if (currentState !== "phase3") return ignore("phase3Complete");
  const endingType = (e.detail && e.detail.endingType) || "normal";
  call("Phase3", "stop");
  startEnding(endingType);
});

// A의 3D 게임 오버 (게임오버 화면은 Phase3가 직접 표시) → 기록만
window.addEventListener("phase3GameOver", (e) => {
  console.log("[main] 게임 오버:", e.detail);
});

// 누구든 재시작 요청 가능
window.addEventListener("restartRequest", (e) => {
  const from = (e.detail && e.detail.from) || "phase3";
  restart(from);
});

// C의 엔딩 연출 종료
window.addEventListener("endingComplete", () => {
  if (currentState !== "ending") return ignore("endingComplete");
  setState("finished");
});

// ---------- 6. 외부 공개 함수 ----------
F.Main = {
  restart,
  getState: () => currentState,
};

// ---------- 7. 부팅 ----------
function boot() {
  console.log("[main] F-Credit Kitchen 부팅 시작");
  timerCreateUI();

  // 모듈 등록 여부 확인 (파일 오류나 인터넷 문제로 등록 안 됐을 수 있음)
  ["Phase1", "Transition", "Phase3", "Phase4"].forEach((name) => {
    if (!F[name]) showError(`FCredit.${name} 모듈이 등록되지 않았습니다. (해당 js 파일 오류 또는 인터넷 연결 확인)`);
  });

  // 초기화 (한 번만)
  call("Phase1", "init");
  callIfExists("Transition", "init");
  call("Phase3", "init");
  call("Phase4", "init");

  // 시작 위치 결정 (테스트용 주소 지원)
  const start = new URLSearchParams(location.search).get("start");
  if (start === "phase3") startPhase3();
  else if (start === "ending") startEnding(new URLSearchParams(location.search).get("type") || "normal");
  else startPhase1();
}

boot();
