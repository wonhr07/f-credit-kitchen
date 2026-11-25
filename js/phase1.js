// =========================================================
// F-Credit Kitchen | Phase 1 (팀원 B) | 타이틀 화면 + 디자인 공지 v5 반영
// 이 파일은 js/phase1.js 전체를 교체합니다.
// 공통 타이머는 A의 main.js가 담당합니다. 이 파일에서는 타이머를 만들지 않습니다.
// =========================================================
window.FCredit = window.FCredit || {};

// 선택형 요리 퍼즐. 기존 순서와 판정 규칙을 유지합니다.
const P1_RECIPE = ["pasta", "tomato", "egg", "cheese"];
const P1_INGREDIENTS = [
  { id: "pasta", label: "스파게티 면" },
  { id: "tomato", label: "토마토" },
  { id: "egg", label: "계란" },
  { id: "cheese", label: "치즈" },
];

let p1Root = null;
let p1Initialized = false;
let p1Running = false;
let p1Stage = "title"; // title / cook / ready / choice / finishing
let p1Steps = [];
let p1Message = "스파게티 면 → 토마토 → 계란 → 치즈 순서대로 재료를 넣어보세요.";
let p1MessageKind = "normal";
let p1FinishTimer = null;
let p1DialogueTimer = null;
let p1DialogueVersion = 0;
let p1Sentence = "";

function p1Element() {
  return p1Root || (p1Root = document.getElementById("phase1-root"));
}

function p1Sound(name) {
  const sound = window.FCredit?.Phase4;
  if (sound && typeof sound.playSound === "function") {
    try { sound.playSound(name); } catch (error) { console.warn("[Phase1] sound:", error); }
  }
}

function p1ClearTimers() {
  if (p1FinishTimer !== null) { clearTimeout(p1FinishTimer); p1FinishTimer = null; }
  if (p1DialogueTimer !== null) { clearTimeout(p1DialogueTimer); p1DialogueTimer = null; }
  p1DialogueVersion++;
}

function p1ResetData() {
  p1ClearTimers();
  p1Stage = "title";
  p1Steps = [];
  p1Message = "스파게티 면 → 토마토 → 계란 → 치즈 순서대로 재료를 넣어보세요.";
  p1MessageKind = "normal";
  p1Sentence = "";
  p1Element()?.classList.remove("p1-horror");
}

function p1ProfessorSays() {
  if (p1Stage === "finishing") return "…카메라 말고, 바로 옆의 자네를 보고 있네.";
  if (p1Stage === "choice") return "마지막 평가를 시작하지. 무엇을 제출하겠나?";
  if (p1Stage === "ready") return "음식은 완성했군. 이제 시식대로 가져오게.";
  if (p1Steps.length >= 3) return "아주 좋아. 이제 자네 이름이 화면에 선명하게 보이는군.";
  if (p1Steps.length >= 2) return "방금… 카메라가 자네를 보고 있었나?";
  return "요리는 정해진 순서가 중요한 법이지.";
}

function p1IngredientButtons() {
  return P1_INGREDIENTS.map(({ id, label }) => {
    const selected = p1Steps.includes(id);
    const disabled = p1Stage !== "cook" || selected;
    return `<button type="button" class="p1-ingredient${selected ? " p1-picked" : ""}" data-action="ingredient" data-item="${id}" ${disabled ? "disabled" : ""} aria-label="${label}${selected ? " 넣기 완료" : " 넣기"}">
      <canvas class="p1-pixel-icon" data-pixel="${id}" width="16" height="16" aria-hidden="true"></canvas>
      <span>${label}</span><span class="p1-picked-mark" aria-hidden="true">${selected ? "✓" : "+"}</span>
    </button>`;
  }).join("");
}

function p1WorkArea() {
  if (p1Stage === "ready") return `<div class="p1-recipe-note p1-recipe-done"><span class="p1-pin"></span><strong>요리 완성!</strong><small>시식대로 제출하면 최종 평가가 시작됩니다.</small></div>
    <button type="button" class="p1-button p1-submit" data-action="serve">시식대로 제출하기 ▶</button>`;
  if (p1Stage === "choice") return `<div class="p1-eval-title">마지막 평가 · 무엇을 제출할까요?</div>
    <div class="p1-choices"><button type="button" class="p1-button p1-choice" data-action="choice" data-original="A. 토마토">A. 토마토</button>
    <button type="button" class="p1-button p1-choice" data-action="choice" data-original="B. 당신의 학점">B. 당신의 학점</button></div>
    <div class="p1-warning-note">※ 방송 신호가 불안정합니다.</div>`;
  if (p1Stage === "finishing") return `<div class="p1-final-line" role="status">방송 카메라가 멈췄습니다.<span>교수가 옆의 학생을 바라봅니다…</span></div>`;
  return `<div class="p1-recipe-note"><span class="p1-pin" aria-hidden="true"></span>
    <div class="p1-recipe-kicker">TODAY'S RECIPE</div>
    <div class="p1-recipe-name">토마토 에그 파스타</div>
    <strong>스파게티 면 → 토마토 → 계란 → 치즈</strong>
    <small>재료를 올바른 순서로 눌러 냄비에 넣으세요.</small></div>
    <div class="p1-ingredients" aria-label="재료 선택">${p1IngredientButtons()}</div>`;
}

// A가 제공하는 엔딩 기록 모듈이 있는 경우에만 정보를 표시합니다.
// 최신 A 파일이 아직 적용되지 않은 독립 테스트 환경에서도 오류 없이 동작해야 합니다.
function p1EndingSummary() {
  const endings = window.FCredit?.Endings;
  if (!endings || typeof endings.summary !== "function") return "엔딩 기록 준비 중";
  try {
    const result = endings.summary();
    if (typeof result === "string" && result.trim()) return result.trim();
    if (typeof result === "number" && Number.isFinite(result)) return `발견한 엔딩 ${result}/2`;
    if (result && typeof result === "object") {
      if (typeof result.text === "string" && result.text.trim()) return result.text.trim();
      if (typeof result.label === "string" && result.label.trim()) return result.label.trim();
      const found = result.found ?? result.discovered ?? result.unlocked ?? result.count;
      const total = result.total ?? 2;
      if (Number.isFinite(found) && Number.isFinite(total)) return `발견한 엔딩 ${found}/${total}`;
    }
  } catch (error) {
    console.warn("[Phase1] 엔딩 기록 표시 실패:", error);
  }
  return "엔딩 기록 준비 중";
}

function p1TitleMarkup() {
  return `<section class="p1-screen p1-title-screen" aria-label="교수님의 15분 냉장고 시작 화면">
    <div class="p1-title-tv">
      <header class="p1-title-tvbar">
        <span class="p1-title-standby">● ON AIR 준비 중</span>
        <span class="p1-title-channel">F-CREDIT TV</span>
        <span class="p1-title-episode">기말 특집 · 1:1 요리 대결</span>
      </header>
      <div class="p1-title-hero">
        <div class="p1-title-ribbon">★ FINAL EXAM SPECIAL ★</div>
        <p class="p1-title-eyebrow">15분 안에 한 학기가 결정된다!</p>
        <h1 class="p1-title-heading">교수님의 <span>15분 냉장고</span></h1>
        <p class="p1-title-sub">기말 과제 잔혹사 <span>·</span> F-Credit Kitchen</p>
        <div class="p1-title-duel" aria-hidden="true">
          <div class="p1-title-contestant">
            <div class="p1-title-face"><canvas data-pixel="professor" width="64" height="64"></canvas></div>
            <strong>교수님</strong><small>PROFESSOR</small>
          </div>
          <div class="p1-title-vs">VS<span>★</span></div>
          <div class="p1-title-contestant p1-title-contestant-student">
            <div class="p1-title-face"><canvas data-pixel="student" width="64" height="64"></canvas></div>
            <strong>학생</strong><small>CHALLENGER</small>
          </div>
        </div>
        <div class="p1-title-controls">
          <button class="p1-button p1-title-start" type="button" data-action="begin" aria-label="게임 시작">▶ 게임 시작</button>
          <p class="p1-title-hint">버튼을 누르면 방송이 시작됩니다!</p>
          <div class="p1-title-endings" role="status"><span class="p1-title-trophy" aria-hidden="true">★</span><span data-endings-summary>엔딩 기록 준비 중</span></div>
        </div>
      </div>
      <footer class="p1-title-bottom"><span>오늘의 도전: 요리를 완성하고 최종 평가를 받으세요</span><span>F-CREDIT KITCHEN · 01</span></footer>
    </div>
    <div class="p1-footnote">F-CREDIT TV · LIVE BROADCAST</div>
  </section>`;
}

function p1Markup() {
  const uncanny = p1Steps.length >= 2 || p1Stage !== "cook";
  const looking = p1Stage === "finishing";
  const dishCount = p1Steps.length;
  const label = P1_INGREDIENTS.find(x => x.id === P1_RECIPE[dishCount])?.label || "완성";
  return `<section class="p1-screen${uncanny ? " p1-uncanny" : ""}${looking ? " p1-looking" : ""}" aria-label="교수님의 15분 냉장고 2D 요리 게임">
    <div class="p1-broadcast">
      <header class="p1-broadcast-bar"><span class="p1-on-air">● ON AIR</span><span class="p1-channel">F-CREDIT KITCHEN</span><span class="p1-episode">기말 특집 · 1:1 대결</span></header>
      <div class="p1-stage-banner">기말 요리 평가<span>교수님 VS 학생</span></div>
      <div class="p1-stage">
        <aside class="p1-fridge-zone"><div class="p1-speech-tag">냉장고</div>
          <div class="p1-fridge" aria-hidden="true"><div class="p1-fridge-top"><i></i></div><div class="p1-fridge-bottom"><i></i></div><div class="p1-fridge-magnet">★</div></div>
          <button class="p1-button p1-drawer" type="button" data-action="drawer">야채칸 조사</button>
        </aside>
        <div class="p1-duel">
          <div class="p1-chef p1-professor"><div class="p1-nameplate">교수님 <small>PROFESSOR</small></div>
            <div class="p1-portrait"><canvas data-pixel="professor" width="64" height="64" aria-label="회색 머리와 뿔테 안경을 쓴 교수"></canvas></div>
            <div class="p1-counter"><div class="p1-counter-top"><div class="p1-burner"></div><div class="p1-pot-visual"><div class="p1-steam">♨</div><div class="p1-pot-lid"></div></div></div></div>
          </div>
          <div class="p1-versus">VS</div>
          <div class="p1-chef p1-student"><div class="p1-nameplate">학생 <small>STUDENT</small></div>
            <div class="p1-portrait"><canvas data-pixel="student" width="64" height="64" aria-label="방송 세트의 학생 캐릭터"></canvas></div>
            <div class="p1-counter"><div class="p1-counter-top"><div class="p1-burner"></div><div class="p1-pot-visual${dishCount === 4 ? " p1-pot-ready" : ""}"><div class="p1-steam">♨</div><div class="p1-pot-lid"></div></div></div>
              <div class="p1-pot-count">재료 ${dishCount} / 4</div>
            </div>
          </div>
        </div>
        <aside class="p1-tasting-zone"><div class="p1-speech-tag">시식대</div><div class="p1-tasting-table"><div class="p1-tasting-plate"></div></div><div class="p1-tasting-label">심사 준비 중</div></aside>
      </div>
      <div class="p1-production-strip"><span class="p1-camera"><i></i> REC · 방송 카메라</span><span class="p1-seat-row">▣　▣　▣　▣　▣</span><span class="p1-audience-label">빈 관객석</span></div>
      <div class="p1-panels">
        <div class="p1-dialog-box"><div class="p1-speaker-name">교수님</div>
          <p class="p1-dialog-line" data-dialogue aria-live="off"></p><span class="p1-dialog-next" aria-hidden="true">▼</span>
          <div class="p1-feedback p1-feedback-${p1MessageKind}" role="status" aria-live="polite"></div>
          <div class="p1-progress"><span>조리 진행도</span><strong>${dishCount}/4</strong><div class="p1-progress-rail"><div class="p1-progress-fill" style="width:${dishCount * 25}%"></div></div></div>
        </div>
        <div class="p1-work-box">${p1WorkArea()}${p1Stage === "cook" ? `<div class="p1-next-step">다음 재료 <strong>${label}</strong></div>` : ""}</div>
      </div>
    </div>
    <div class="p1-footnote">F-CREDIT TV · LIVE BROADCAST</div>
  </section>`;
}

// Canvas 픽셀 그림: 별도의 이미지 파일을 사용하지 않습니다.
const P1_PIXEL_GRIDS = {
  pasta: [
    "................",
    "................",
    "..11.11.11.11...",
    "..12.12.12.12...",
    "..12.12.12.12...",
    "..12.12.12.12...",
    "..12.12.12.12...",
    "..11111111111...",
    "..33333333333...",
    "..11111111111...",
    "..12.12.12.12...",
    "..12.12.12.12...",
    "..12.12.12.12...",
    "..11.11.11.11...",
    "................",
    "................"
  ],
  tomato: [
    "................",".......3........",".....3333.......","...3331333......","....31113.......","...11111111.....","..1222222221....",".122222222221...",".122222222221...",".122222222221...","..1222222221....","...12222221.....","....111111......","................","................","................"
  ],
  egg: [
    "................","......111.......",".....12221......","....1222221.....","...122222221....","...122222221....","..12222222221...","..12222222221...","..12222222221...","..12222222221...","...122222221....","....1222221.....",".....11111......","................","................","................"
  ],
  cheese: [
    "................","................","...1111111111...","...1222222221...","...1222222221...","...1223222221...","...1222222321...","...1222222221...","...1232222221...","...1222222221...","...1111111111...","................","................","................","................","................"
  ]
};

function p1DrawGrid(canvas, grid, colors) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  grid.forEach((row, y) => [...row].forEach((c, x) => {
    if (colors[c]) { ctx.fillStyle = colors[c]; ctx.fillRect(x, y, 1, 1); }
  }));
}

function p1Palette() {
  const style = getComputedStyle(p1Element());
  const color = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  // 공지 v5의 공용 변수 사용. 기존 A 파일에 변수가 없는 경우에도 동작하도록 기본값만 보완.
  return {
    line: color("--fc-pixel-line", "#2b2024"),
    pink: color("--fc-pink", "#ff8fab"),
    mint: color("--fc-mint", "#a8e6cf"),
    yellow: color("--fc-yellow", "#ffd84d"),
    red: color("--fc-red", "#e84a5f"),
    cream: color("--fc-bg", "#fff4dc"),
    pale: color("--fc-panel", "#fffaf0"),
    hair: color("--p1-pixel-hair", "#9ca3ae"),
    skin: color("--p1-pixel-skin", "#f8c7a8"),
    suit: color("--p1-pixel-suit", "#4c4957"),
  };
}

function p1PixelPortrait(canvas, type, horror, p) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 64, 64);
  const paint = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const L = p.line, S = p.skin, W = p.pale;
  if (type === "professor") {
    // 회색 머리, 검은 뿔테 안경, 어두운 정장, 흰 셔츠, 빨간 넥타이.
    paint(8, 43, 48, 21, L); paint(11, 44, 42, 20, p.suit);
    paint(25, 45, 14, 19, W); paint(31, 48, 3, 16, p.red); paint(30, 53, 5, 7, p.red);
    paint(18, 12, 28, 32, L); paint(20, 14, 24, 28, S);
    paint(16, 11, 32, 11, L); paint(18, 10, 28, 10, p.hair);
    paint(16, 18, 5, 12, p.hair); paint(43, 18, 5, 12, p.hair);
    paint(22, 24, 9, 8, L); paint(33, 24, 9, 8, L); paint(31, 26, 2, 2, L);
    if (horror) {
      paint(24, 26, 5, 4, W); paint(35, 26, 5, 4, W);
      paint(23, 36, 18, 2, p.red);
      for (let x = 24; x < 42; x += 4) { paint(x, 34, 1, 6, p.red); }
    } else {
      paint(24, 26, 5, 4, W); paint(35, 26, 5, 4, W);
      paint(27, 27, 2, 2, L); paint(38, 27, 2, 2, L);
      paint(28, 36, 8, 2, L);
    }
  } else {
    paint(9, 43, 46, 21, L); paint(12, 45, 40, 19, p.mint);
    paint(22, 46, 20, 18, W); paint(29, 51, 6, 13, p.pink);
    paint(19, 13, 26, 30, L); paint(21, 15, 22, 26, S);
    paint(17, 11, 30, 10, L); paint(19, 12, 26, 9, p.line);
    paint(21, 24, 8, 3, W); paint(36, 24, 8, 3, W);
    paint(25, 25, 2, 2, L); paint(39, 25, 2, 2, L);
    paint(28, 35, 8, 2, L);
  }
}

function p1DrawPixels() {
  const root = p1Element();
  if (!root) return;
  const p = p1Palette();
  const ingredientColors = {
    pasta: {"1":p.line,"2":p.yellow,"3":p.pink},
    tomato:{"1":p.line,"2":p.red,"3":p.mint},
    egg:   {"1":p.line,"2":p.cream},
    cheese:{"1":p.line,"2":p.yellow,"3":p.pink},
  };
  root.querySelectorAll("canvas[data-pixel]").forEach(canvas => {
    const type = canvas.dataset.pixel;
    if (type === "professor" || type === "student") p1PixelPortrait(canvas, type, type === "professor" && p1Stage === "finishing", p);
    else if (P1_PIXEL_GRIDS[type]) p1DrawGrid(canvas, P1_PIXEL_GRIDS[type], ingredientColors[type]);
  });
}

// 말풍선이 한 글자씩 나옵니다. 버튼 입력 등으로 재렌더될 때 이전 타이머를 제거합니다.
function p1TypeDialogue(sentence) {
  if (p1DialogueTimer !== null) { clearTimeout(p1DialogueTimer); p1DialogueTimer = null; }
  const target = p1Element()?.querySelector("[data-dialogue]");
  if (!target) return;
  const chars = Array.from(sentence);
  const token = ++p1DialogueVersion;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduce) { target.textContent = sentence; return; }
  let cursor = 0;
  const draw = () => {
    if (token !== p1DialogueVersion || !p1Running) return;
    cursor = Math.min(cursor + 1, chars.length);
    let shown = chars.slice(0, cursor).join("");
    if (p1Steps.length >= 3 && cursor < chars.length && cursor % 9 === 0) {
      shown += "▓"; // 잠깐 섞였다 사라지는 방송 오류 문자
    }
    target.textContent = shown;
    if (cursor < chars.length) p1DialogueTimer = setTimeout(draw, 34);
    else p1DialogueTimer = null;
  };
  draw();
}

function p1Render() {
  const root = p1Element();
  if (!root) return;
  if (p1Stage === "title") {
    // 타이틀 화면에서는 아직 2D 요리 게임이나 효과음을 시작하지 않습니다.
    root.innerHTML = p1TitleMarkup();
    const label = root.querySelector("[data-endings-summary]");
    if (label) label.textContent = p1EndingSummary();
    p1DrawPixels();
    return;
  }
  const sentence = p1ProfessorSays();
  root.innerHTML = p1Markup();
  p1DrawPixels();
  const feedback = root.querySelector(".p1-feedback");
  if (feedback) feedback.textContent = p1Message;
  if (sentence === p1Sentence) {
    const dialogue = root.querySelector("[data-dialogue]");
    if (dialogue) dialogue.textContent = sentence;
    if (p1DialogueTimer !== null) { clearTimeout(p1DialogueTimer); p1DialogueTimer = null; p1DialogueVersion++; }
  } else {
    p1Sentence = sentence;
    p1TypeDialogue(sentence);
  }
}

function p1Click(event) {
  if (!p1Running) return;
  const button = event.target.closest?.("button[data-action]");
  if (!button || !p1Element()?.contains(button)) return;
  const action = button.dataset.action;
  if (action === "begin" && p1Stage === "title") {
    // 첫 사용자 클릭에서 바로 효과음을 실행해야 브라우저의 자동재생 차단을 피할 수 있습니다.
    // A의 공통 타이머는 A의 main.js가 이 첫 클릭을 감지하여 처리합니다.
    p1Stage = "cook";
    p1Sound("tvOn");
    p1Render();
    return;
  }
  if (action === "drawer") {
    p1Message = "야채칸이 뻑뻑하다"; // 3D 냉장고 퍼즐 복선
    p1MessageKind = "warning";
    p1Sound("click");
    p1Render();
    return;
  }
  if (action === "ingredient" && p1Stage === "cook") {
    const id = button.dataset.item;
    if (p1Steps.includes(id)) return;
    if (id !== P1_RECIPE[p1Steps.length]) {
      p1Message = "조리 순서가 잘못됐어요! 레시피 메모를 확인하세요.";
      p1MessageKind = "warning";
      p1Sound("click");
      p1Render();
      return;
    }
    p1Steps.push(id);
    p1Message = `${P1_INGREDIENTS.find(x => x.id === id)?.label || "재료"}을(를) 냄비에 넣었습니다. (${p1Steps.length}/4)`;
    p1MessageKind = "success";
    p1Sound("ingredient");
    if (p1Steps.length === P1_RECIPE.length) {
      p1Stage = "ready";
      p1Message = "요리 완성! 시식대로 제출하세요.";
    }
    p1Render();
    return;
  }
  if (action === "serve" && p1Stage === "ready") {
    p1Stage = "choice";
    p1Message = "방송 화면의 글자가 이상하게 보입니다.";
    p1MessageKind = "warning";
    p1Sound("click");
    p1Render();
    return;
  }
  if (action === "choice" && p1Stage === "choice") {
    p1Stage = "finishing"; // 중복 클릭/이벤트 중복 전송 방지
    p1Message = "교수님이 카메라가 아닌, 옆의 학생을 바라봅니다.";
    p1MessageKind = "warning";
    p1Sound("click");
    p1Render();
    // 교수의 마지막 대사는 타자 효과를 유지하고, 완료 이벤트만 예약합니다.
    p1FinishTimer = setTimeout(() => {
      p1FinishTimer = null;
      if (!p1Running || p1Stage !== "finishing") return;
      // v2 확정: 어떤 버튼이든 choice 값은 B.
      window.dispatchEvent(new CustomEvent("phase1Complete", { detail: { choice: "B" } }));
    }, 1100);
  }
}

function p1HoverChoice(event, entering) {
  if (!p1Running || p1Stage !== "choice") return;
  const button = event.target.closest?.(".p1-choice");
  if (!button || !p1Element()?.contains(button)) return;
  if (event.relatedTarget && button.contains(event.relatedTarget)) return;
  button.textContent = entering ? "당신의 학점" : button.dataset.original;
}
function p1Over(e) { p1HoverChoice(e, true); }
function p1Out(e) { p1HoverChoice(e, false); }
function p1FocusIn(e) { p1HoverChoice(e, true); }
function p1FocusOut(e) { p1HoverChoice(e, false); }
function p1Bind(root) {
  root.addEventListener("click", p1Click);
  root.addEventListener("pointerover", p1Over);
  root.addEventListener("pointerout", p1Out);
  root.addEventListener("focusin", p1FocusIn);
  root.addEventListener("focusout", p1FocusOut);
}
function p1Unbind(root) {
  root.removeEventListener("click", p1Click);
  root.removeEventListener("pointerover", p1Over);
  root.removeEventListener("pointerout", p1Out);
  root.removeEventListener("focusin", p1FocusIn);
  root.removeEventListener("focusout", p1FocusOut);
}

window.FCredit.Phase1 = {
  init() {
    if (p1Initialized) return;
    if (!p1Element()) throw new Error("#phase1-root가 없습니다.");
    p1Initialized = true;
  },
  start() {
    this.init();
    const root = p1Element();
    if (p1Running) p1Unbind(root);
    p1ResetData();
    p1Running = true;
    root.hidden = false;
    p1Bind(root);
    p1Render();
  },
  stop() {
    p1ClearTimers();
    const root = p1Element();
    if (root) {
      p1Unbind(root);
      root.hidden = true;
      root.innerHTML = "";
      root.classList.remove("p1-horror");
    }
    p1Running = false;
  },
  reset() {
    p1ResetData();
    if (p1Running) p1Render();
  },
};
