// =========================================================
// F-Credit Kitchen | Transition (팀원 B) | 공지 v5 반영
// Phase 1과 3D를 겹치지 않게 연결합니다.
// 완전히 암전된 순간 transitionComplete를 보냅니다.
// =========================================================
window.FCredit = window.FCredit || {};

let trRoot = null;
let trRunning = false;
let trTasks = [];
let trNoiseTick = null;
let trNoiseCanvas = null;
let trNoiseCtx = null;

function trSound(name) {
  const module = window.FCredit?.Phase4;
  if (module && typeof module.playSound === "function") {
    try { module.playSound(name); } catch (e) { console.warn("[Transition] sound:", e); }
  }
}
function trLater(fn, ms) {
  const id = setTimeout(fn, ms);
  trTasks.push(id);
}
function trClear() {
  trTasks.forEach(clearTimeout);
  trTasks = [];
  if (trNoiseTick !== null) { clearInterval(trNoiseTick); trNoiseTick = null; }
  if (trRoot) { trRoot.innerHTML = ""; trRoot.style.background = ""; }
  trNoiseCanvas = null;
  trNoiseCtx = null;
  trRunning = false;
}
function trDrawNoise() {
  if (!trNoiseCanvas || !trNoiseCtx) return;
  const w = trNoiseCanvas.width, h = trNoiseCanvas.height;
  const frame = trNoiseCtx.createImageData(w,h);
  for (let i = 0; i < frame.data.length; i += 4) {
    const brightness = Math.random() < .52 ? 0 : 255;
    frame.data[i] = frame.data[i+1] = frame.data[i+2] = brightness;
    frame.data[i+3] = Math.random() < .22 ? 180 : 0;
  }
  trNoiseCtx.putImageData(frame,0,0);
}

window.FCredit.Transition = {
  init() {
    // 있으면 main.js가 호출합니다. 호출을 반복해도 문제가 없습니다.
    trRoot = document.getElementById("transition-root");
  },
  start() {
    if (trRunning) return;
    if (!trRoot) this.init();
    if (!trRoot) { console.error("[Transition] #transition-root가 없습니다."); return; }
    trClear();
    trRunning = true;
    const phase1 = document.getElementById("phase1-root");
    phase1?.classList.add("p1-horror");
    trRoot.innerHTML = `<div class="tr-screen" role="presentation"><canvas class="tr-noise" width="144" height="81"></canvas>
      <div class="tr-scanlines"></div><div class="tr-vignette"></div>
      <div class="tr-glitch-label">SIGNAL LOST</div><div class="tr-blackout"></div></div>`;
    trNoiseCanvas = trRoot.querySelector(".tr-noise");
    trNoiseCtx = trNoiseCanvas?.getContext("2d") || null;
    trDrawNoise();
    trNoiseTick = setInterval(trDrawNoise, 90);
    trLater(() => { trRoot.querySelector(".tr-screen")?.classList.add("tr-glitching"); trSound("glitch"); }, 850);
    trLater(() => { trRoot.querySelector(".tr-screen")?.classList.add("tr-dark"); trSound("tvOff"); }, 1700);
    trLater(() => {
      const screen = trRoot.querySelector(".tr-screen");
      if (!screen) return;
      // 이 순간 완전히 검은 화면이 2D를 가립니다.
      // A의 main.js는 즉시(동기) 2D를 끄고 3D를 켭니다.
      window.dispatchEvent(new CustomEvent("transitionComplete"));
      screen.classList.add("tr-reveal");
      trLater(trClear, 620);
    }, 2220);
  },
  stop() { trClear(); },
};
