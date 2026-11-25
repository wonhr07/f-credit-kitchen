// =========================================================
// js/phase3.js — 3D 1인칭 탈출 게임 (담당: 팀원 A)
//
// [STEP 8 버전] 3D 주방 + 1인칭 이동 + 조사·퍼즐 + 타이머 연동 + 교수 추격 + 히든 루트
//  - 교수와 1대1 요리 대결 TV쇼 세트 (조리대 2개 나란히: 왼쪽 교수 / 오른쪽 나)
//  - 냉장고, 식탁(시식대), 방송 카메라, 빈 관객석, 현수막, 출입문, 교수(정지 상태)
//  - 어두운 조명, 그림자, 깜빡이는 천장 전등, 안개
//  - WASD 이동, 마우스 시점(Pointer Lock), 벽·가구 충돌, 조준점
//  - ESC → 일시정지 화면 → 클릭하면 이어하기, 탭 전환 시 자동 일시정지
//  - [E] 조사: 내 조리대 서랍 → 숟가락 → 숟가락으로 뻑뻑한 야채칸 비틀기(1)
//            → 전등 스위치 끄기 → 벽의 야광 손글씨 퀴즈(0) → 성적표 퀴즈(0)
//    → 출입문 번호키 100 → 열쇠 줍기 → 문 열기 → 문 밖으로 나가면 phase3Complete
//  - 교수: WAIT(나를 응시) → 대결 시간 종료(contestTimeUp) → SERVE(시식대에 음식)
//          → DETECT(나를 봄) → CHASE(가구를 귀신처럼 통과) → GAMEOVER("F학점 확정!")
//  - 히든 루트: (열쇠를 주운 뒤 카메라에서 테이프가 튀어나옴) 방송 카메라 [E] → 녹화 테이프 영상(cutscene.js) → 교수 조리대 출석인정서
//    + 내 조리대 볼펜(그냥 주우면 페이크) → 서명 → 안 잡힘 → [E] 교수님 안아주기 → "happy" 엔딩
//  - [임시] 버튼은 다른 모듈과의 연결 테스트용, 나중에 삭제
// =========================================================

import * as THREE from "three";   // index.html의 importmap → CDN

window.FCredit = window.FCredit || {};

// =========================================================
// 1. 설정값 (여기 숫자만 바꿔서 조절)
// =========================================================
const CONFIG = {
  ROOM_W: 8,              // 방 가로 (x, 미터)
  ROOM_D: 10,             // 방 세로 (z)
  ROOM_H: 3,              // 천장 높이
  WALL_T: 0.2,            // 벽 두께
  EYE_HEIGHT: 1.6,        // 플레이어 눈높이
  START_POS: { x: 1.5, z: 3.2 },  // 플레이어 시작 위치 (내 조리대 뒤)
  LIGHT_SCALE: 1.6,       // ★ 밝기 (1.0 = 아주 어두움, 2.0 = 꽤 밝음)
  SHADOWS: true,          // 저사양 PC에서 끊기면 false
  DEBUG_AUTO_PAN: false,  // STEP 2 확인용 자동 회전 (이제 사용 안 함)

  // ----- 1인칭 이동 (STEP 3) -----
  MOVE_SPEED: 2.2,        // ★ 걷는 속도 (미터/초). 빠르면 1.8, 느리면 2.8
  MOUSE_SENS: 0.0022,     // ★ 마우스 감도 기본값 (일시정지 화면의 슬라이더로 0.4~2배 조절)
  PLAYER_RADIUS: 0.3,     // 플레이어 몸 두께 (벽에 이만큼 못 붙음)
  PITCH_LIMIT: 85,        // 위아래로 볼 수 있는 최대 각도
  HEAD_BOB: true,         // 걸을 때 화면이 살짝 흔들림
  STEP_DISTANCE: 0.75,    // 이 거리마다 발소리

  // ----- 조사·퍼즐 (STEP 6) -----
  PASSWORD: "100",        // 출입문 번호키 (냉장고 1, 그릇 0, 성적표 퀴즈 0)
  INTERACT_DIST: 2.2,     // 이 거리 안의 물건만 [E] 조사 가능
  DOOR_X: 2.3,            // 출입문 가운데 x 위치

  // ----- 교수 추격 (STEP 7) -----
  PROF_START: { x: -1.5, z: 3.2 },   // 교수 시작 위치 (교수 조리대 뒤)
  PROF_SERVE_SPEED: 1.0,  // 시식대로 걸어가는 속도
  PROF_CHASE_SPEED: 1.5,  // ★ 추격 속도 (플레이어 2.2보다 느리게. 어려우면 1.2, 쉬우면 1.8)
  PROF_DETECT_TIME: 1.6,  // 음식을 놓고 나를 쳐다보는 시간 (초) → 그다음 추격
  CATCH_DIST: 0.7,        // 이 거리 안으로 오면 잡힘
};

// =========================================================
// 2. 모듈 내부 변수
// =========================================================
let initialized = false;

// 휴대폰·태블릿(터치) 조작 모드: ?touch=1 강제, ?touch=0 끔, 그 외 자동 감지
const IS_TOUCH = (() => {
  const q = new URLSearchParams(location.search).get("touch");
  if (q === "1") return true;
  if (q === "0") return false;
  return !!(window.matchMedia && matchMedia("(hover: none) and (pointer: coarse)").matches);
})();
// 임시 테스트 버튼은 내 컴퓨터(Live Server)나 ?dev=1 에서만 보임 → 친구들 시험판에는 안 보임
const SHOW_DEV = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || location.protocol === "file:"
  || new URLSearchParams(location.search).get("dev") === "1";
const TOUCH_SENS = 0.006;     // 손가락 드래그 시점 감도
const JOY_R = 52;             // 조이스틱 반지름(px)
const touch = { joyId: null, jx: 0, jy: 0, x: 0, y: 0, lookId: null, lx: 0, ly: 0 };
let root = null;
let renderer = null;
let scene = null;
let camera = null;
let clock = null;
let rafId = null;            // 애니메이션 루프 번호 (null = 정지)

// 1인칭 이동 상태
let active = false;          // start()~stop() 사이 = 3D 단계 진행 중
let playing = false;         // 마우스가 잠겨 실제로 조작 중 (일시정지면 false)
let yaw = 0;                 // 좌우 시선 (라디안)
let pitch = 0;               // 위아래 시선 (라디안)
let sensScale = 1.0;         // 감도 배율 (슬라이더)
let lockReadyAt = 0;         // 이 시각 이후에만 다시 마우스 잠금 가능 (Chrome 제한 대응)
let stepAccum = 0;           // 발소리용 이동 거리 누적
let bobPhase = 0;            // 걸을 때 머리 흔들림
const keys = { forward: false, back: false, left: false, right: false };

// 화면 UI 요소
const ui = { overlay: null, crosshair: null, hint: null, prompt: null, toast: null, hud: null, panel: null, whiteout: null };

// 퍼즐 진행 상태 (reset()에서 처음으로 되돌림)
const puzzle = {
  drawerOpen: false,   // 냉장고 야채칸 (숫자 1)
  bowlLifted: false,   // 시식대 그릇 (숫자 0)
  sheetRead: false,    // 성적표 퀴즈 (숫자 0)
  unlocked: false,     // 번호키 정답 입력
  hasKey: false,       // 열쇠 주움
  doorOpen: false,     // 문 열림
  finished: false,     // 문 밖으로 나감 (엔딩으로)
  input: "",           // 번호키에 입력 중인 숫자
  hasSpoon: false,     // 서랍에서 숟가락을 주웠는지
  pried: false,        // 숟가락으로 야채칸을 비틀어 열었는지
  lightsOff: false,    // 전등이 꺼져 있는지
  quizSeen: false,     // 야광 퀴즈를 봤는지
  // 히든 루트
  watched: false,      // 녹화 테이프 영상을 봤는지
  hasCert: false,      // 출석인정서를 주웠는지
  hasPen: false,       // 볼펜을 주웠는지
  signed: false,       // 출석인정서에 서명했는지 → 교수에게 안 잡힘
  hugged: false,       // 교수님을 안아줌 → 해피엔딩
};
let signAnim = null;         // 서명 애니메이션 진행 정보
// 교수 상태: WAIT(대기·응시) / SERVE(음식 놓으러 감) / DETECT(나를 봄) / CHASE(추격) / GAMEOVER(잡힘)
const prof = { state: "WAIT", timer: 0, ghostAmt: 0, trail: [], trailTimer: 0 };
let panelMode = null;        // 열려 있는 창: null | "sheet" | "keypad"
let lookTarget = null;       // 지금 조준점이 가리키는 조사 대상
let toastTimer = null;
let raycaster = null;
const screenCenter = { x: 0, y: 0 };

// 3D 세계에서 나중 단계가 사용할 것들을 한곳에 모음
const world = {
  colliders: [],      // STEP 3: 벽/가구 충돌용 상자(Box3) 목록
  interactables: [],  // STEP 6: 조사 가능한 오브젝트 목록
  ceilingLight: null, // 깜빡이는 전등
  bulb: null,         // 전구 모양 (깜빡일 때 같이 어두워짐)
  doorPivot: null,    // STEP 6: 문 열기 회전축
  professor: null,    // STEP 7: 교수 실루엣
  professorHead: null, // 교수 머리 (고개 돌리기용)
  profMeshes: [],     // 교수 몸의 모든 부품 (투명하게 만들 때 사용)
  ghosts: [],         // 가구 통과 시 따라오는 잔상
  food: null,         // 교수가 시식대에 올리는 음식
  cert: null,         // 출석인정서 (교수 조리대 위)
  pen: null,          // 볼펜 (내 조리대 위)
  profLenses: [],     // 교수 안경알 (안아주면 빛이 꺼짐)
  myDrawers: [],      // 내 조리대 서랍 3개
  spoon: null,        // 숟가락 (가운데 서랍 안)
  glowQuiz: null,     // 불을 끄면 보이는 야광 손글씨 퀴즈 (남쪽 벽)
  ambient: null, hemi: null,   // 전체 조명 (불 끄기용)
  drawer: null,       // 냉장고 야채칸 (앞으로 빠짐)
  bowl: null,         // 시식대 그릇 (들림)
  key: null,          // 열쇠 (번호키 정답 후 나타남)
  doorCollider: null, // 문이 열리면 충돌 목록에서 뺐다가 reset 때 다시 넣음
  animated: [],       // 부드럽게 움직이는 물건 목록
};

// =========================================================
// 3. 공용 도우미
// =========================================================
function emit(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function sound(name) {
  const P4 = window.FCredit.Phase4;
  if (P4 && typeof P4.playSound === "function") P4.playSound(name);
}

// [E] 안내 문구를 터치 화면용으로 바꿔 줌
function tipText(t) {
  if (!IS_TOUCH) return t;
  return t.replace("[E] 닫기", "화면을 탭하면 닫기").replace("[E] 서명하기", "화면을 탭하면 서명").replace("[E] ", "");
}

// 저폴리 느낌의 재질 (flatShading = 면이 각지게 보임)
function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.0, flatShading: true, ...extra });
}

// 상자 하나를 만들어 장면(또는 그룹)에 추가
// x, y, z = 상자 '바닥 중앙' 위치가 아니라 '정중앙' 위치
function addBox(parent, w, h, d, x, y, z, material, opts = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = opts.cast !== false;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// 오브젝트의 월드 공간 경계 상자를 충돌 목록에 등록
function addCollider(object3d, name) {
  object3d.updateWorldMatrix(true, true);   // 부모 위치까지 반영
  const box = new THREE.Box3().setFromObject(object3d);
  box.userData = { name };
  world.colliders.push(box);
  return box;
}

// 픽셀 느낌의 체크무늬 바닥 텍스처 (이미지 파일 없이 Canvas로 생성)
function makeTileTexture(c1, c2, repeatX, repeatY) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 16;
  const g = cv.getContext("2d");
  g.fillStyle = c1; g.fillRect(0, 0, 16, 16);
  g.fillStyle = c2; g.fillRect(0, 0, 8, 8); g.fillRect(8, 8, 8, 8);
  g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(0, 0, 16, 1); g.fillRect(0, 0, 1, 16); // 줄눈
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.magFilter = THREE.NearestFilter;   // 흐리지 않고 픽셀이 또렷하게
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 숫자 쪽지 텍스처 (구겨진 메모지에 큰 숫자)
function makeNoteTexture(digit, color = "#1b1b1b") {
  const cv = document.createElement("canvas");
  cv.width = 128; cv.height = 96;
  const g = cv.getContext("2d");
  g.fillStyle = "#e9e2c8"; g.fillRect(0, 0, 128, 96);
  g.strokeStyle = "rgba(0,0,0,0.15)"; g.lineWidth = 2;
  g.beginPath(); g.moveTo(10, 30); g.lineTo(118, 34); g.moveTo(8, 70); g.lineTo(120, 66); g.stroke(); // 구김
  g.fillStyle = color; g.font = "bold 70px sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(digit, 64, 52);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 바닥에 눕힌 쪽지 하나 만들기
function makeNote(digit, color) {
  const note = new THREE.Mesh(
    new THREE.PlaneGeometry(0.16, 0.12),
    mat(0xffffff, { map: makeNoteTexture(digit, color), flatShading: false })
  );
  note.rotation.x = -Math.PI / 2;
  return note;
}

// 조사 가능한 물건 등록
//  getPrompt(): 안내 문구 (null이면 안내 안 함), onUse(): [E]를 눌렀을 때
function registerInteract(object3d, getPrompt, onUse) {
  object3d.userData.interact = { getPrompt, onUse };
  if (!world.interactables.includes(object3d)) world.interactables.push(object3d);
}

function unregisterInteract(object3d) {
  const i = world.interactables.indexOf(object3d);
  if (i >= 0) world.interactables.splice(i, 1);
}

// 부드럽게 움직일 물건 등록: userData.goal = { px, py, pz, ry } 중 필요한 값만
function animateTo(object3d, goal) {
  object3d.userData.goal = { ...(object3d.userData.goal || {}), ...goal };
  if (!world.animated.includes(object3d)) world.animated.push(object3d);
}

function updateAnimations(dt) {
  const k = Math.min(1, dt * 6);
  for (const o of world.animated) {
    const g = o.userData.goal;
    if (!g) continue;
    if (g.px !== undefined) o.position.x += (g.px - o.position.x) * k;
    if (g.py !== undefined) o.position.y += (g.py - o.position.y) * k;
    if (g.pz !== undefined) o.position.z += (g.pz - o.position.z) * k;
    if (g.ry !== undefined) o.rotation.y += (g.ry - o.rotation.y) * k;
    if (g.rx !== undefined) o.rotation.x += (g.rx - o.rotation.x) * k;
  }
}

// =========================================================
// 4. 방 만들기: 바닥, 천장, 벽 4개
// =========================================================
function buildRoom() {
  const { ROOM_W: W, ROOM_D: D, ROOM_H: H, WALL_T: T } = CONFIG;

  // 바닥 (체크무늬 타일)
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    mat(0xffffff, { map: makeTileTexture("#3a3a36", "#26302c", W / 2, D / 2), flatShading: false })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = "바닥";
  scene.add(floor);

  // 천장
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat(0x1c1c1c));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = H;
  scene.add(ceiling);

  // 벽 4개 (두께가 있는 상자 → 충돌 처리에 사용)
  const wallMat = mat(0x4a4f45);
  // 북쪽 벽은 출입문 자리(가로 1.0, 높이 2.1)를 비워 두고 세 조각으로
  const dL = CONFIG.DOOR_X - 0.5, dR = CONFIG.DOOR_X + 0.5, dH = 2.1;
  const leftW = dL - (-W / 2 - T), rightW = (W / 2 + T) - dR;
  const walls = [
    // [가로, 세로, 깊이, x, z, 이름]
    [leftW, H, T, -W / 2 - T + leftW / 2, -D / 2 - T / 2, "북쪽 벽(왼쪽)"],
    [rightW, H, T, dR + rightW / 2, -D / 2 - T / 2, "북쪽 벽(오른쪽)"],
    [W + T * 2, H, T, 0,  D / 2 + T / 2, "남쪽 벽"],
    [T, H, D, -W / 2 - T / 2, 0, "서쪽 벽"],
    [T, H, D,  W / 2 + T / 2, 0, "동쪽 벽"],
  ];
  walls.forEach(([w, h, d, x, z, name]) => {
    const wall = addBox(scene, w, h, d, x, h / 2, z, wallMat, { cast: false });
    wall.name = name;
    addCollider(wall, name);
  });
  // 문 위쪽 벽 (충돌 불필요)
  addBox(scene, dR - dL, H - dH, T, CONFIG.DOOR_X, dH + (H - dH) / 2, -D / 2 - T / 2, wallMat, { cast: false });

  // 문 밖: 하얀 빛 (문이 열리면 보임)
  const outside = new THREE.MeshBasicMaterial({ color: 0xf4f1e6, fog: false });
  addBox(scene, 1.4, 2.6, 0.05, CONFIG.DOOR_X, 1.3, -D / 2 - 1.2, outside, { cast: false });
  addBox(scene, 1.4, 0.05, 1.2, CONFIG.DOOR_X, 0.0, -D / 2 - 0.6, outside, { cast: false });

  // 벽 아래쪽 띠 (더러운 타일 느낌)
  const trimMat = mat(0x2b2f2a);
  addBox(scene, dL + W / 2, 1.0, 0.02, (-W / 2 + dL) / 2, 0.5, -D / 2 + 0.01, trimMat, { cast: false });
  addBox(scene, W / 2 - dR, 1.0, 0.02, (dR + W / 2) / 2, 0.5, -D / 2 + 0.01, trimMat, { cast: false });
  addBox(scene, W, 1.0, 0.02, 0, 0.5,  D / 2 - 0.01, trimMat, { cast: false });
  addBox(scene, 0.02, 1.0, D, -W / 2 + 0.01, 0.5, 0, trimMat, { cast: false });
  addBox(scene, 0.02, 1.0, D,  W / 2 - 0.01, 0.5, 0, trimMat, { cast: false });
}

// =========================================================
// 5. 가구 만들기
// =========================================================

// 냉장고: 서쪽 벽 쪽. 아래쪽 야채칸이 앞으로 빠지면 숫자 '1' 쪽지
function buildFridge() {
  const g = new THREE.Group();
  g.name = "냉장고";
  const body = mat(0xb8bcb4);
  addBox(g, 0.9, 2.0, 0.8, 0, 1.0, 0, body);                           // 몸통
  addBox(g, 0.86, 0.02, 0.02, 0.0, 1.35, 0.41, mat(0x333333));         // 냉동실/냉장실 경계선
  addBox(g, 0.04, 0.35, 0.05, 0.35, 1.6, 0.43, mat(0x555555));         // 위 손잡이
  addBox(g, 0.04, 0.4, 0.05, 0.35, 1.0, 0.43, mat(0x555555));          // 가운데 손잡이

  // 야채칸 (서랍): 앞판 + 안쪽 통 + 채소 + 쪽지 → 함께 앞으로 빠짐
  const drawer = new THREE.Group();
  drawer.name = "야채칸";
  const front = addBox(drawer, 0.84, 0.42, 0.04, 0, 0.32, 0.0, mat(0x9fa69a));   // 앞판 (살짝 다른 색)
  drawer.userData.front = front;
  addBox(drawer, 0.5, 0.04, 0.03, 0, 0.47, 0.03, mat(0x555555));      // 손잡이
  addBox(drawer, 0.78, 0.3, 0.5, 0, 0.26, -0.27, mat(0xd6e0d0));      // 안쪽 통
  const cabbage = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), mat(0x5e8a3a));
  cabbage.position.set(-0.22, 0.47, -0.3);
  drawer.add(cabbage);
  const note = makeNote("1");
  note.position.set(0.12, 0.42, -0.25);
  drawer.add(note);
  drawer.position.set(0, 0, 0.4);                                       // 닫힌 위치 (몸통 앞면)
  drawer.userData.closedZ = 0.4;
  g.add(drawer);
  world.drawer = drawer;

  g.position.set(-CONFIG.ROOM_W / 2 + 0.45, 0, -0.6);
  g.rotation.y = Math.PI / 2;   // 앞면이 방 안쪽(+x)을 향하게
  scene.add(g);
  world.fridge = g;
  addCollider(g, "냉장고");

  // puzzle.drawerOpen = 숫자를 찾았는지 / drawer.userData.out = 지금 열려 있는지
  // 처음엔 뻑뻑해서 안 열림 → 서랍에서 찾은 숟가락으로 비틀어 열어야 함
  registerInteract(g,
    () => {
      if (!puzzle.pried) return puzzle.hasSpoon ? "숟가락으로 야채칸 비틀어 열기" : "냉장고 야채칸 열기";
      return drawer.userData.out ? "야채칸 닫기" : "냉장고 야채칸 열기";
    },
    () => {
      if (!puzzle.pried) {
        if (!puzzle.hasSpoon) {
          sound("click");
          showToast("야채칸이 뻑뻑해서 안 열린다. …뭔가로 비틀어 열어야 할 것 같다.");
          return;
        }
        puzzle.pried = true;
        puzzle.drawerOpen = true;
        drawer.userData.out = true;
        drawer.position.z = drawer.userData.closedZ + 0.55;          // 튕겨 나옴
        animateTo(drawer, { pz: drawer.userData.closedZ + 0.42 });
        front.rotation.x = -0.18;                                     // 앞판이 비틀려 찌그러짐
        front.rotation.z = 0.05;
        sound("crack");
        showToast("빠직! 숟가락으로 비틀자 야채칸이 튕겨 나왔다. 쪽지에 숫자 '1'이 적혀 있다.", 4000);
        updateHUD();
        return;
      }
      drawer.userData.out = !drawer.userData.out;
      animateTo(drawer, { pz: drawer.userData.closedZ + (drawer.userData.out ? 0.42 : 0) });
      if (!drawer.userData.out) { sound("click"); return; }
      if (!puzzle.drawerOpen) {
        puzzle.drawerOpen = true;
        sound("pickup");
        showToast("뻑뻑하던 야채칸이 열렸다. 쪽지에 숫자 '1'이 적혀 있다.");
        updateHUD();
      } else {
        sound("click");
        showToast("야채칸 쪽지: '1'");
      }
    });
  return g;
}

// Canvas로 글자 판 텍스처 만들기 (이름표, 현수막 공용)
function makeLabelTexture(text, bg, fg, w = 256, h = 64, fontPx = 30) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const g = cv.getContext("2d");
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = "#c9a227"; g.lineWidth = 4; g.strokeRect(4, 4, w - 8, h - 8);
  g.fillStyle = fg; g.font = `bold ${fontPx}px sans-serif`;
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 요리 대결 조리대 1개
//  - 요리사는 남쪽(+z)에 서서 북쪽(카메라/관객석)을 바라보며 요리
//  - 앞판(북쪽)은 카메라를 향하고, 위에 이름표가 요리사 쪽을 향함
function buildCookingStation(x, z, frontColor, label, nameText) {
  const g = new THREE.Group();
  g.name = label;
  const len = 2.0, dep = 0.8;
  addBox(g, len, 0.85, dep, 0, 0.425, 0, mat(0x3a3a3a));                 // 하부장
  g.userData.front = addBox(g, len - 0.1, 0.6, 0.02, 0, 0.45, -dep / 2 - 0.01, mat(frontColor)); // 앞판 (카메라 쪽)
  addBox(g, len + 0.06, 0.06, dep + 0.06, 0, 0.88, 0, mat(0x9a9a92));    // 상판 (스테인리스)
  addBox(g, 0.55, 0.02, 0.5, -0.5, 0.92, 0, mat(0x111111));              // 가스레인지
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.22, 10), mat(0x777777));
  pot.position.set(-0.5, 1.04, 0);
  pot.castShadow = true;
  g.add(pot);
  addBox(g, 0.45, 0.03, 0.3, 0.45, 0.925, 0.1, mat(0x8a6a44));           // 도마
  addBox(g, 0.25, 0.01, 0.04, 0.45, 0.945, 0.1, mat(0xcccccc));          // 칼
  // 이름표 (요리사 쪽을 향해 비스듬히)
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.125),
    mat(0xffffff, { map: makeLabelTexture(nameText, "#1a1a1a", "#e8d8a8"), flatShading: false })
  );
  sign.position.set(0, 0.98, dep / 2 - 0.05);
  sign.rotation.x = -0.5;
  g.add(sign);
  g.userData.sign = sign;
  g.position.set(x, 0, z);
  scene.add(g);
  addCollider(g, label);
  return g;
}

// 조리대 2개: 나란히 (왼쪽 = 교수, 오른쪽 = 나)
function buildCookingStations() {
  world.profStation = buildCookingStation(-1.5, 2.2, 0x1b1a1a, "교수 조리대", "교수");
  const mine = buildCookingStation( 1.5, 2.2, 0x6a6a6a, "내 조리대", "학생");
  world.myStation = mine;
  buildMyDrawers(mine);
  buildCertificate();
  buildPen();
  // 출석인정서와 볼펜을 다 가졌는데 서명 창을 닫았다면, 내 조리대에서 다시 서명
  registerInteract(mine,
    () => (puzzle.hasCert && puzzle.hasPen && !puzzle.signed ? "출석인정서에 서명하기" : null),
    () => openSignPanel());
}

// ---------- 내 조리대 서랍 3개 (빈 서랍 / 숟가락 / F 쪽지) ----------
function buildMyDrawers(station) {
  const contents = ["empty", "spoon", "fnote"];
  [-0.62, 0, 0.62].forEach((dx, i) => {
    const d = new THREE.Group();
    d.name = `서랍 ${i + 1}`;
    addBox(d, 0.56, 0.2, 0.03, 0, 0, 0, mat(0x4a4a4a));                 // 서랍 앞판
    addBox(d, 0.2, 0.025, 0.03, 0, 0.03, 0.025, mat(0x9a9a92));         // 손잡이
    addBox(d, 0.52, 0.12, 0.36, 0, -0.03, -0.19, mat(0x2a2a2a));        // 서랍 통 (닫히면 안 보임)
    if (contents[i] === "spoon") {
      const spoon = new THREE.Group();
      spoon.name = "숟가락";
      addBox(spoon, 0.15, 0.008, 0.018, 0, 0, 0, mat(0xc8c8c8, { metalness: 0.6, roughness: 0.3 }));
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), mat(0xc8c8c8, { metalness: 0.6, roughness: 0.3 }));
      head.scale.set(1.3, 0.3, 1);
      head.position.x = 0.09;
      spoon.add(head);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.25), new THREE.MeshBasicMaterial());
      hit.visible = false;                                               // 조준 쉽게
      spoon.add(hit);
      spoon.position.set(0, 0.04, -0.18);
      spoon.rotation.y = 0.4;
      d.add(spoon);
      world.spoon = spoon;
      registerInteract(spoon,
        () => (d.userData.out && !puzzle.hasSpoon ? "숟가락 줍기" : null),
        () => {
          puzzle.hasSpoon = true;
          spoon.visible = false;
          sound("pickup");
          showToast("숟가락을 주웠다. 단단하다.");
          updateHUD();
        });
    }
    if (contents[i] === "fnote") {
      const note = makeNote("F", "#b01010");     // 빨간 글씨 F
      note.position.set(0, 0.035, -0.18);
      d.add(note);
    }
    d.position.set(dx, 0.68, 0.415);                                      // 조리대 앞쪽(요리하는 쪽)
    d.userData.closedZ = 0.415;
    d.userData.out = false;
    d.userData.content = contents[i];
    d.userData.seen = false;
    station.add(d);
    world.myDrawers.push(d);
    registerInteract(d,
      () => {
        if (d.userData.content === "spoon" && d.userData.out && !puzzle.hasSpoon) return null;   // 숟가락부터 줍게
        return d.userData.out ? "서랍 닫기" : "서랍 열기";
      },
      () => {
        d.userData.out = !d.userData.out;
        animateTo(d, { pz: d.userData.closedZ + (d.userData.out ? 0.3 : 0) });
        sound("click");
        if (!d.userData.out || d.userData.seen) return;
        d.userData.seen = true;
        if (d.userData.content === "empty") showToast("비어 있다.");
        else if (d.userData.content === "spoon") showToast("숟가락이 하나 들어 있다.");
        else {
          // 갑툭튀: 화면이 F로 도배됨 → 사라진 뒤 쪽지 안내
          scareF(() => showToast("…빨간 글씨로 'F'라고 적힌 쪽지다."));
        }
      });
  });
}

// ---------- 전등 스위치 + 야광 손글씨 퀴즈 (둘째 자리) ----------
const GLOW_LINES = ["3350 = 0", "3503 = 0", "22030 = 1", "2050303 = 2", "2530030 = 1", "300332 = ?"];

function drawGlowQuiz(canvas, withBackground) {
  const g = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  g.clearRect(0, 0, W, H);
  if (withBackground) { g.fillStyle = "#06080a"; g.fillRect(0, 0, W, H); }
  g.save();
  g.scale(W / 1024, H / 640);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.shadowColor = "#7dff6a";
  g.shadowBlur = 22;
  g.fillStyle = "#c8ffb8";
  g.textBaseline = "middle";
  const hand = (str, x, y, size) => {                      // 떨리는 손글씨
    g.font = `bold ${size}px 'Malgun Gothic', sans-serif`;
    let cx = x;
    for (const ch of str) {
      const w = g.measureText(ch).width;
      g.save();
      g.translate(cx + w / 2, y + (rnd() - 0.5) * 8);
      g.rotate((rnd() - 0.5) * 0.18);
      g.fillText(ch, -w / 2, 0);
      g.restore();
      cx += w + 2;
    }
  };
  GLOW_LINES.forEach((line, i) => hand(line, 250, 70 + i * 82, 60));
  g.shadowBlur = 12;
  hand("답 = 비밀번호 두 번째 숫자", 270, 590, 30);
  g.restore();
  return canvas;
}

function buildLightSwitchAndQuiz() {
  // 스위치: 출입문 오른쪽 벽
  const sw = new THREE.Group();
  sw.name = "전등 스위치";
  addBox(sw, 0.1, 0.14, 0.02, 0, 0, 0, mat(0xd8d4c8), { cast: false });
  const nub = addBox(sw, 0.03, 0.05, 0.02, 0, 0.02, 0.015, mat(0x888888), { cast: false });
  sw.userData.nub = nub;
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.2), new THREE.MeshBasicMaterial());
  hit.visible = false;
  sw.add(hit);
  sw.position.set(CONFIG.DOOR_X + 1.0, 1.3, -CONFIG.ROOM_D / 2 + 0.02);
  scene.add(sw);
  registerInteract(sw, () => (puzzle.lightsOff ? "전등 스위치 켜기" : "전등 스위치 끄기"), () => setLights(puzzle.lightsOff));

  // 야광 퀴즈: 남쪽 벽 (시작할 때 등 뒤) — 불이 꺼졌을 때만 보임
  const cv = document.createElement("canvas");
  cv.width = 1024; cv.height = 640;
  drawGlowQuiz(cv, false);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const quiz = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 1.62),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false, depthWrite: false })
  );
  quiz.name = "야광 글씨";
  quiz.position.set(0, 1.75, CONFIG.ROOM_D / 2 - 0.02);
  quiz.rotation.y = Math.PI;                               // 방 안쪽을 보게
  quiz.visible = false;
  scene.add(quiz);
  world.glowQuiz = quiz;
  registerInteract(quiz, () => (puzzle.lightsOff ? "야광 글씨 자세히 보기" : null), () => openGlowPanel());
}

// on = true 면 켜기, false 면 끄기 (silent = 재시작용: 소리·메시지·교수 이동 없음)
function setLights(on, silent = false) {
  const wasOff = puzzle.lightsOff;
  puzzle.lightsOff = !on;
  const S = CONFIG.LIGHT_SCALE;
  const L = world.ceilingLight;
  if (L) L.intensity = on ? L.userData.baseIntensity : 0;
  if (world.bulb) world.bulb.material.color.setHex(on ? 0xffe2b0 : 0x1a1612);
  if (world.ambient) world.ambient.intensity = world.ambient.userData.base * (on ? 1 : 0.11);
  if (world.hemi) world.hemi.intensity = world.hemi.userData.base * (on ? 1 : 0.09);
  if (world.glowQuiz) world.glowQuiz.visible = !on;
  if (silent) return;
  sound("switch");
  if (!on) {
    if (!puzzle.quizSeen) showToast("딸깍. …벽에 뭔가 빛나고 있다.", 3500);
    puzzle.quizSeen = true;
    updateHUD();
  } else if (wasOff) {
    professorCreepCloser();
  }
}

// 불을 다시 켜면, 교수가 한 걸음 가까이 와 있음 (대기 중일 때만, 공격은 안 함)
let creepCount = 0;
function professorCreepCloser() {
  const g = world.professor;
  if (!g || prof.state !== "WAIT") return;
  const p = camera.position;
  const dx = p.x - g.position.x, dz = p.z - g.position.z;
  const d = Math.hypot(dx, dz);
  if (d < 1.8) return;
  const ox = g.position.x, oz = g.position.z;
  for (const step of [Math.min(0.7, d - 1.8), 0.35]) {     // 가구 안에 서지 않도록, 안 되면 반 걸음
    g.position.x = ox + (dx / d) * step;
    g.position.z = oz + (dz / d) * step;
    if (!profInsideFurniture()) break;
    g.position.x = ox; g.position.z = oz;
  }
  if (g.position.x === ox && g.position.z === oz) return;   // 갈 곳이 없으면 그대로
  g.lookAt(p.x, 0, p.z);
  creepCount++;
  if (creepCount === 1) showToast("…방금, 교수님이 움직였나?", 3000);
}

function openGlowPanel() {
  panelMode = "glow";
  ui.panel.innerHTML = "";
  const cv = document.createElement("canvas");
  cv.width = 1024; cv.height = 640;
  drawGlowQuiz(cv, true);
  cv.className = "p3-glow-view";
  ui.panel.appendChild(cv);
  const tip = document.createElement("p");
  tip.className = "p3-panel-tip";
  tip.textContent = tipText("[E] 닫기");
  ui.panel.appendChild(tip);
  ui.panel.hidden = false;
  ui.prompt.hidden = true;
  ui.toast.hidden = true;
  clearTimeout(toastTimer);
  clearKeys();
}

// ---------- 히든 루트: 출석인정서 ----------
// 서명 곡선 (손글씨처럼 보이는 고정된 선)
const SIGN_PATH = (() => {
  const pts = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    pts.push([150 + t * 110 + Math.sin(t * 19) * 7, 336 + Math.sin(t * 11) * 9 - Math.cos(t * 23) * 4]);
  }
  return pts;
})();

// 출석인정서 그림 (signProgress: 0 = 서명 없음 ~ 1 = 서명 완료)
function drawCertificate(canvas, signProgress = 0) {
  const g = canvas.getContext("2d");
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.scale(canvas.width / 300, canvas.height / 400);
  const F = "'Malgun Gothic', sans-serif";
  const t = (str, x, y, size, color = "#222", align = "left", w = "normal") => {
    g.font = `${w} ${size}px ${F}`; g.fillStyle = color; g.textAlign = align; g.textBaseline = "middle"; g.fillText(str, x, y);
  };
  g.fillStyle = "#f8f4e6"; g.fillRect(0, 0, 300, 400);
  g.strokeStyle = "#8a6a2a"; g.lineWidth = 3; g.strokeRect(10, 10, 280, 380);
  g.lineWidth = 1; g.strokeRect(16, 16, 268, 368);
  t("출 석 인 정 서", 150, 52, 24, "#3a2a10", "center", "bold");
  t("과    목 :  기말 요리 평가", 40, 104, 13);
  t("학    번 :  2026-1515", 40, 130, 13);
  t("성    명 :  학  생", 40, 156, 13);
  t("위 학생의 이번 학기 출석을", 150, 206, 14, "#222", "center");
  t("모두 인정합니다.", 150, 228, 14, "#222", "center");
  t("2026.  12.  09.", 150, 266, 12, "#444", "center");
  t("담당교수   교 수 님", 150, 292, 13, "#222", "center");
  g.strokeStyle = "rgba(200,30,30,0.8)"; g.lineWidth = 2; g.beginPath(); g.arc(232, 292, 12, 0, Math.PI * 2); g.stroke();
  t("교수", 232, 292, 9, "rgba(200,30,30,0.85)", "center", "bold");
  t("학생 서명 :", 40, 340, 13, "#222", "left", "bold");
  g.strokeStyle = "#888"; g.lineWidth = 1; g.beginPath(); g.moveTo(140, 352); g.lineTo(268, 352); g.stroke();
  if (signProgress > 0) {
    const n = Math.max(2, Math.floor(SIGN_PATH.length * Math.min(1, signProgress)));
    g.strokeStyle = "#1a2a6a"; g.lineWidth = 2.5; g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath();
    SIGN_PATH.slice(0, n).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
  }
  return canvas;
}

function makeCertCanvas(signProgress = 0, width = 300) {
  const cv = document.createElement("canvas");
  cv.width = width; cv.height = Math.round(width * 4 / 3);
  return drawCertificate(cv, signProgress);
}

function buildCertificate() {
  const tex = new THREE.CanvasTexture(makeCertCanvas(0, 256));
  tex.colorSpace = THREE.SRGBColorSpace;
  const cert = new THREE.Group();
  cert.name = "출석인정서";
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.28), mat(0xffffff, { map: tex, flatShading: false }));
  paper.rotation.x = -Math.PI / 2;
  cert.add(paper);
  const hitbox = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.38), new THREE.MeshBasicMaterial());
  hitbox.visible = false;                      // 조준하기 쉽게 보이지 않는 판정 상자
  cert.add(hitbox);
  cert.position.set(-1.45, 0.915, 2.15);       // 교수 조리대 위 (가운데)
  cert.rotation.y = 0.25;
  scene.add(cert);
  world.cert = cert;
  registerInteract(cert,
    () => (puzzle.hasCert ? null : puzzle.watched ? "출석인정서 줍기" : "출석인정서 살펴보기"),
    () => {
      if (!puzzle.watched) {
        showToast("교수님의 출석인정서다. …지금은 손대면 안 될 것 같다.");
        return;
      }
      puzzle.hasCert = true;
      cert.visible = false;
      sound("pickup");
      updateHUD();
      if (puzzle.hasPen) openSignPanel();
      else showToast("출석인정서를 주웠다. 학생 서명란이 비어 있다… 쓸 것이 필요하다.");
    });
}

// ---------- 히든 루트: 볼펜 (그냥 주우면 쓸모없는 페이크) ----------
function buildPen() {
  const pen = new THREE.Group();
  pen.name = "볼펜";
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.14, 8), mat(0x1a2a5a));
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.035, 8), mat(0xb01818));
  cap.position.y = 0.06;
  const stick = new THREE.Group();
  stick.add(body, cap);
  stick.rotation.z = Math.PI / 2;              // 눕힘
  pen.add(stick);
  const hitbox = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.25), new THREE.MeshBasicMaterial());
  hitbox.visible = false;
  pen.add(hitbox);
  pen.position.set(1.4, 0.925, 2.32);          // 내 조리대 위 (도마 옆)
  pen.rotation.y = 0.5;
  scene.add(pen);
  world.pen = pen;
  registerInteract(pen,
    () => (puzzle.hasPen ? null : "볼펜 줍기"),
    () => {
      puzzle.hasPen = true;
      pen.visible = false;
      sound("pickup");
      updateHUD();
      if (puzzle.hasCert && !puzzle.signed) openSignPanel();
      else showToast("볼펜을 주웠다. …어디에 쓰지?");
    });
}

// 식탁(시식대): 조리대 앞쪽, 냉장고 옆. 엎어진 그릇을 들면 숫자 '0' 쪽지
function buildTable() {
  const g = new THREE.Group();
  g.name = "식탁";
  const wood = mat(0x4a3424);
  addBox(g, 1.6, 0.06, 0.8, 0, 0.75, 0, wood);                          // 상판
  [[-0.7, -0.33], [0.7, -0.33], [-0.7, 0.33], [0.7, 0.33]].forEach(([x, z]) => {
    addBox(g, 0.06, 0.72, 0.06, x, 0.36, z, wood);                      // 다리 4개
  });
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.02, 12), mat(0xd8d4c8));
  plate.position.set(-0.4, 0.79, 0);                                     // 빈 접시 (교수가 나중에 음식을 올림)
  g.add(plate);
  // 교수가 대결 종료 후 올려 두는 토마토 파스타 (처음엔 숨김)
  const food = new THREE.Group();
  const pasta = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xd9b25a));
  const sauce = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xa3170e));
  sauce.position.y = 0.04;
  food.add(pasta, sauce);
  food.position.set(-0.4, 0.8, 0);
  food.visible = false;
  g.add(food);
  world.food = food;

  // 그릇 밑: 케첩 자국만 (숫자는 없음 — 페이크)
  const smudge = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.004, 10), mat(0x8c1009));
  smudge.position.set(0.4, 0.782, 0);
  g.add(smudge);

  // 엎어진 그릇 (반구)
  const bowl = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    mat(0xcfc8b8, { side: THREE.DoubleSide })
  );
  bowl.position.set(0.4, 0.78, 0);
  bowl.castShadow = true;
  bowl.userData.downY = 0.78;
  g.add(bowl);
  world.bowl = bowl;

  g.position.set(-1.2, 0, -0.6);
  scene.add(g);
  world.table = g;
  addCollider(g, "식탁");

  // puzzle.bowlLifted = 숫자를 찾았는지 / bowl.userData.up = 지금 들려 있는지
  registerInteract(g,
    () => (bowl.userData.up ? "그릇 내려놓기" : "시식대 그릇 들어보기"),   // 숫자 없음 (헛걸음용)
    () => {
      bowl.userData.up = !bowl.userData.up;
      animateTo(bowl, bowl.userData.up
        ? { py: bowl.userData.downY + 0.32, px: 0.62 }
        : { py: bowl.userData.downY, px: 0.4 });
      if (!bowl.userData.up) { sound("click"); return; }
      sound("click");
      if (!puzzle.bowlLifted) {
        puzzle.bowlLifted = true;
        // 갑툭튀: 그릇 밑에서 케첩이 화면으로 확 튀어 흘러내림
        scareKetchup(() => showToast("…케첩이다. 그릇 밑엔 아무것도 없다."));
      }
    });
  return g;
}

// 성적표 보면대: 출입문 앞. 케첩 묻은 성적표 (퀴즈 → 마지막 숫자)
function buildGradeSheetStand() {
  const g = new THREE.Group();
  g.name = "성적표";
  const metal = mat(0x222222);
  addBox(g, 0.4, 0.03, 0.4, 0, 0.015, 0, metal);                         // 받침
  addBox(g, 0.04, 1.05, 0.04, 0, 0.55, 0, metal);                        // 기둥
  const board = new THREE.Group();
  addBox(board, 0.5, 0.64, 0.02, 0, 0, 0, metal);                        // 판
  let sheetMat;
  const GS = window.FCredit.GradeSheet;
  if (GS && typeof GS.createCanvas === "function") {
    const tex = new THREE.CanvasTexture(GS.createCanvas("quiz", 512));
    tex.colorSpace = THREE.SRGBColorSpace;
    sheetMat = mat(0xffffff, { map: tex, flatShading: false });
  } else {
    sheetMat = mat(0xefe7d2);                                            // 공용 파일이 없을 때 대체
  }
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.6), sheetMat);
  sheet.position.z = 0.012;
  board.add(sheet);
  board.position.set(0, 1.25, 0.03);
  board.rotation.x = -0.35;                                              // 위를 향해 비스듬히
  g.add(board);
  g.position.set(CONFIG.DOOR_X - 1.0, 0, -CONFIG.ROOM_D / 2 + 0.75);
  g.rotation.y = 0.35;                                                   // 방 안쪽을 향해
  scene.add(g);
  addCollider(g, "성적표 보면대");

  registerInteract(g, () => "성적표 확인하기", () => openSheetPanel());
  return g;
}

// 방송 카메라 (삼각대 + 본체, 조리대 쪽을 향함)
function buildTVCamera() {
  const g = new THREE.Group();
  g.name = "방송 카메라";
  const dark = mat(0x151515);
  [0, 2.094, 4.189].forEach((a) => {                                    // 삼각대 다리 3개
    const leg = addBox(g, 0.04, 1.3, 0.04, Math.sin(a) * 0.25, 0.62, Math.cos(a) * 0.25, dark);
    leg.rotation.set(-Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35);   // 위쪽이 가운데로 모이게
  });
  addBox(g, 0.35, 0.3, 0.6, 0, 1.38, 0, mat(0x2a2a2a));                 // 본체
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.25, 10), dark);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 1.38, 0.42);
  g.add(lens);
  g.userData.lens = lens;
  world.tvCamera = g;
  const rec = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  rec.position.set(0.12, 1.56, 0.2);                                    // 녹화 중 빨간 불
  g.add(rec);
  g.position.set(0.3, 0, -2.4);
  scene.add(g);
  addCollider(g, "방송 카메라");
  // 녹화 테이프: 번호키를 풀고 열쇠를 주운 뒤에야 카메라 옆구리에서 튀어나옴 (히든 루트 난이도)
  const tape = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.2), mat(0x111111));
  const label = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.06, 0.13), mat(0xe8dcc8));
  const redMark = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.02, 0.05), new THREE.MeshBasicMaterial({ color: 0xff2a3c }));
  redMark.position.set(0, 0.012, -0.02);
  tape.add(shell, label, redMark);
  tape.position.set(0.2, 1.4, 0.05);
  tape.visible = false;
  g.add(tape);
  world.tape = tape;
  registerInteract(g,
    () => (!puzzle.hasKey ? null : puzzle.watched ? "녹화 테이프 다시 보기" : "튀어나온 녹화 테이프 재생하기"),
    () => playTape());
  return g;
}

// 빈 관객석: 긴 의자 2줄 (출입문 쪽 길은 비워 둠)
function buildAudienceSeats() {
  const seatMat = mat(0x3b2a2a);
  [-3.5, -4.3].forEach((z, row) => {
    const g = new THREE.Group();
    g.name = `관객석 ${row + 1}열`;
    addBox(g, 4.0, 0.08, 0.45, 0, 0.45, 0, seatMat);                    // 앉는 판
    addBox(g, 4.0, 0.45, 0.06, 0, 0.7, -0.2, seatMat);                  // 등받이
    [-1.9, 0, 1.9].forEach((lx) => addBox(g, 0.08, 0.45, 0.4, lx, 0.22, 0, mat(0x1a1a1a)));
    g.position.set(-1.6, 0, z);
    scene.add(g);
    addCollider(g, g.name);
  });
}

// 벽 현수막: "기말 요리 평가"
function buildBanner() {
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.6),
    mat(0xffffff, { map: makeLabelTexture("기말 요리 평가", "#3a0d0d", "#e8d8a8"), flatShading: false })
  );
  banner.position.set(-1.4, 2.35, -CONFIG.ROOM_D / 2 + 0.02);
  scene.add(banner);
  return banner;
}

// 출입문: 북쪽 벽, 경첩(회전축)을 기준으로 열리게 그룹 구성
function buildDoor() {
  const doorW = 1.0, doorH = 2.1, x = 2.3, z = -CONFIG.ROOM_D / 2;
  // 문틀
  const frameMat = mat(0x2a2018);
  addBox(scene, 0.08, doorH + 0.08, 0.26, x - doorW / 2 - 0.04, (doorH + 0.08) / 2, z, frameMat, { cast: false });
  addBox(scene, 0.08, doorH + 0.08, 0.26, x + doorW / 2 + 0.04, (doorH + 0.08) / 2, z, frameMat, { cast: false });
  addBox(scene, doorW + 0.16, 0.08, 0.26, x, doorH + 0.04, z, frameMat, { cast: false });

  // 회전축 (문 왼쪽 끝) — STEP 6에서 doorPivot.rotation.y를 바꾸면 문이 열림
  const pivot = new THREE.Group();
  pivot.name = "출입문";
  pivot.position.set(x - doorW / 2, 0, z + 0.12);
  const panelMesh = addBox(pivot, doorW, doorH, 0.06, doorW / 2, doorH / 2, 0, mat(0x5a3a24));
  addBox(pivot, 0.08, 0.04, 0.06, doorW - 0.12, 1.0, 0.06, mat(0xb0a060));  // 손잡이
  addBox(pivot, 0.18, 0.18, 0.02, doorW - 0.12, 1.2, 0.04, mat(0x222222));  // 번호키 패드
  scene.add(pivot);
  world.doorPivot = pivot;
  world.interactables.push(pivot);

  // 문 위 비상구 표시 (스스로 빛나는 재질)
  addBox(scene, 0.6, 0.2, 0.04, x, doorH + 0.3, z + 0.12,
    new THREE.MeshStandardMaterial({ color: 0x113311, emissive: 0x22ff55, emissiveIntensity: 0.8 }), { cast: false });

  world.doorCollider = addCollider(panelMesh, "출입문");   // 닫혀 있는 동안은 통과 불가

  registerInteract(pivot,
    () => {
      if (puzzle.doorOpen) return null;
      if (!puzzle.unlocked) return "번호키 입력하기";
      return "출입문 열기";
    },
    () => {
      if (!puzzle.unlocked) openKeypadPanel();
      else if (!puzzle.hasKey) showToast("잠겨 있다. 번호키 상자에서 떨어진 열쇠가 필요하다.");
      else openDoor();
    });

  buildKey();
  return pivot;
}

// 열쇠: 번호키 정답 후 문 아래에 나타남
function buildKey() {
  const k = new THREE.Group();
  k.name = "열쇠";
  const gold = mat(0xd4af37, { metalness: 0.6, roughness: 0.4, emissive: 0x3a2a00 });
  addBox(k, 0.08, 0.015, 0.08, 0, 0, 0, gold);           // 손잡이
  addBox(k, 0.16, 0.015, 0.025, 0.11, 0, 0, gold);       // 몸통
  addBox(k, 0.025, 0.015, 0.04, 0.16, 0, 0.03, gold);    // 이빨
  addBox(k, 0.025, 0.015, 0.03, 0.12, 0, 0.025, gold);
  // 조준하기 쉽게 보이지 않는 큰 판정 상자 (Raycaster는 안 보이는 물체도 감지함)
  const hitbox = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.25, 0.45), new THREE.MeshBasicMaterial());
  hitbox.position.set(0.08, 0.1, 0);
  hitbox.visible = false;
  k.add(hitbox);
  k.position.set(CONFIG.DOOR_X + 0.25, 0.02, -CONFIG.ROOM_D / 2 + 0.45);
  k.rotation.y = 0.6;
  k.visible = false;
  scene.add(k);
  world.key = k;
}

function spawnKey() {
  const k = world.key;
  k.visible = true;
  registerInteract(k, () => (puzzle.hasKey ? null : "열쇠 줍기"), () => {
    puzzle.hasKey = true;
    k.visible = false;
    unregisterInteract(k);
    sound("pickup");
    showToast("열쇠를 얻었다.");
    updateHUD();
    // 히든 루트 시작 신호: 잠시 뒤 방송 카메라에서 테이프가 튀어나옴
    setTimeout(() => {
      if (!active || !puzzle.hasKey || puzzle.finished || !world.tape) return;
      world.tape.visible = true;
      world.tape.position.x = 0.2;
      animateTo(world.tape, { px: 0.3 });
      sound("tape");
      showToast("…딸깍. 어디선가 테이프가 튀어나오는 소리가 났다.");
    }, 2200);
  });
}

function openDoor() {
  puzzle.doorOpen = true;
  animateTo(world.doorPivot, { ry: Math.PI / 2 * 0.92 });   // 밖으로 열림
  const i = world.colliders.indexOf(world.doorCollider);
  if (i >= 0) world.colliders.splice(i, 1);
  sound("doorOpen");
  showToast("문이 열렸다... 밖으로 나가자.");
  updateHUD();
}

// =========================================================
// 교수 행동 (상태 기계)
// =========================================================
const SERVE_SPOT = { x: -1.2, z: 0.05 };   // 시식대 앞 (음식 놓는 자리)

function setProfState(next) {
  console.log(`[Phase3] 교수 상태: ${prof.state} → ${next}`);
  prof.state = next;
  prof.timer = 0;
}

// 대결 시간 종료 (main.js 타이머가 보냄)
function onContestTimeUp() {
  if (!active || prof.state !== "WAIT") return;
  setProfState("SERVE");
  showToast("…대결 시간이 끝났다. 교수가 움직인다.", 3500);
}

// 교수가 (tx, tz)를 바라보게 부드럽게 회전
function faceTowards(tx, tz, dt, speed = 4) {
  const g = world.professor;
  const want = Math.atan2(tx - g.position.x, tz - g.position.z);
  let diff = want - g.rotation.y;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));       // -π~π 사이로
  g.rotation.y += diff * Math.min(1, dt * speed);
}

// (tx, tz)쪽으로 speed만큼 이동, 도착하면 true
function moveTowards(tx, tz, speed, dt) {
  const g = world.professor;
  const dx = tx - g.position.x, dz = tz - g.position.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) return true;
  const step = Math.min(d, speed * dt);
  g.position.x += (dx / d) * step;
  g.position.z += (dz / d) * step;
  return false;
}

// 교수가 가구 안에 있는지 (= 통과 중인지)
function profInsideFurniture() {
  const p = world.professor.position;
  const r = 0.2;
  for (const box of world.colliders) {
    if (box.userData && /벽/.test(box.userData.name)) continue;     // 벽은 제외
    if (p.x > box.min.x - r && p.x < box.max.x + r && p.z > box.min.z - r && p.z < box.max.z + r) return true;
  }
  return false;
}

// 귀신 이펙트: 가구를 통과하는 동안 몸이 반투명하게 깜빡이고 잔상이 따라옴
function updateGhostEffect(dt) {
  const g = world.professor;
  const moving = prof.state === "SERVE" || prof.state === "CHASE";
  const target = moving && profInsideFurniture() ? 1 : 0;
  prof.ghostAmt += (target - prof.ghostAmt) * Math.min(1, dt * 8);
  const a = prof.ghostAmt;

  // 몸: 반투명 + 지직거림
  const flicker = a > 0.05 ? (Math.random() < 0.25 ? 0.15 : 0.45 + Math.random() * 0.2) : 1;
  const opacity = 1 - a + a * flicker;
  for (const m of world.profMeshes) m.material.opacity = opacity;
  g.scale.set(1 + a * (Math.random() - 0.5) * 0.08, 1 + a * (Math.random() - 0.5) * 0.04, 1);

  // 잔상: 지나온 위치를 기록해서 늦게 따라오게
  prof.trailTimer += dt;
  if (prof.trailTimer > 0.06) {
    prof.trailTimer = 0;
    prof.trail.unshift({ x: g.position.x, z: g.position.z, ry: g.rotation.y });
    if (prof.trail.length > 12) prof.trail.pop();
  }
  world.ghosts.forEach((ghost, i) => {
    const t = prof.trail[(i + 1) * 3];
    if (!t || a < 0.02) { ghost.visible = false; return; }
    ghost.visible = true;
    ghost.position.set(t.x, 0, t.z);
    ghost.rotation.y = t.ry;
    ghost.userData.mat.opacity = a * (0.45 / (i + 1));
  });
}

function updateProfessor(dt) {
  const g = world.professor;
  if (!g) return;
  const p = camera.position;
  prof.timer += dt;

  if (prof.state === "WAIT") {
    faceTowards(p.x, p.z, dt, 1.5);                // 가만히 서서 천천히 나를 따라 봄
  } else if (prof.state === "SERVE") {
    faceTowards(SERVE_SPOT.x, SERVE_SPOT.z, dt);
    if (moveTowards(SERVE_SPOT.x, SERVE_SPOT.z, CONFIG.PROF_SERVE_SPEED, dt)) {
      world.food.visible = true;                   // 시식대에 음식을 올림
      sound("detect");
      setProfState("DETECT");
      showToast("\"…이제 평가할 시간이군.\"", 3000);
    }
  } else if (prof.state === "DETECT") {
    faceTowards(p.x, p.z, dt, 6);                  // 홱 돌아서 나를 봄
    if (prof.timer > CONFIG.PROF_DETECT_TIME) {
      setProfState("CHASE");
      sound("ambience");                           // 긴장감 배경음 (반복)
    }
  } else if (prof.state === "CHASE") {
    faceTowards(p.x, p.z, dt, 6);
    const d0 = Math.hypot(p.x - g.position.x, p.z - g.position.z);
    if (!(puzzle.signed && d0 < 1.1)) {                  // 서명했으면 가까이 와서 멈춰 기다림
      moveTowards(p.x, p.z, CONFIG.PROF_CHASE_SPEED, dt);   // 직선으로 다가옴 (가구 통과)
    }
    const d = Math.hypot(p.x - g.position.x, p.z - g.position.z);
    if (d < CONFIG.CATCH_DIST && canBeCaught()) triggerGameOver();
  }

  // 고개를 살짝 끄덕이듯 흔들림 (기분 나쁘게)
  if (world.professorHead) world.professorHead.rotation.z = 0.21 + Math.sin(elapsed * 1.3) * 0.04;
  updateGhostEffect(dt);
}

// 잡힐 수 있는지 (히든 루트에서 서명한 출석인정서가 있으면 false로 바꿀 예정)
function canBeCaught() {
  return !puzzle.signed;     // 서명한 출석인정서가 있으면 잡히지 않음
}

// 잡힘: 교수가 눈앞으로 → 화면 왜곡 → "F학점 확정!"
function triggerGameOver() {
  if (prof.state === "GAMEOVER" || puzzle.finished) return;
  setProfState("GAMEOVER");
  playing = false;
  clearKeys();
  closePanel();
  stopSound("ambience");
  sound("gameover");

  // 교수를 바로 눈앞에 세우고, 시선을 교수 얼굴로
  const g = world.professor;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  g.position.set(camera.position.x + fx * 0.55, 0, camera.position.z + fz * 0.55);
  g.lookAt(camera.position.x, 0, camera.position.z);
  for (const m of world.profMeshes) m.material.opacity = 1;
  g.scale.set(1, 1, 1);
  pitch = 0.05;
  camera.rotation.set(pitch, yaw, 0);

  const T = window.FCredit.Timer;
  if (T) T.pause();
  root.classList.add("p3-distort");               // 화면 왜곡 (CSS 애니메이션)
  ui.crosshair.hidden = true;
  ui.hint.hidden = true;
  ui.prompt.hidden = true;
  emit("phase3GameOver", { reason: "caught" });

  setTimeout(() => {
    if (prof.state !== "GAMEOVER") return;
    releaseLock();
    root.classList.remove("p3-distort");
    showOverlay("caught");
  }, 1400);
}

function stopSound(name) {
  const P4 = window.FCredit.Phase4;
  if (P4 && typeof P4.stopSound === "function") P4.stopSound(name);
}

function resetProfessor() {
  const g = world.professor;
  if (!g) return;
  prof.state = "WAIT";
  prof.timer = 0;
  prof.ghostAmt = 0;
  prof.trail.length = 0;
  g.position.set(CONFIG.PROF_START.x, 0, CONFIG.PROF_START.z);
  g.rotation.set(0, 0, 0);
  g.lookAt(CONFIG.START_POS.x, 0, CONFIG.START_POS.z);
  g.scale.set(1, 1, 1);
  for (const m of world.profMeshes) m.material.opacity = 1;
  world.ghosts.forEach((gh) => { gh.visible = false; });
  if (world.food) world.food.visible = false;
  if (root) root.classList.remove("p3-distort");
}

// 문이 열린 뒤 문턱을 넘으면 3D 종료 → 엔딩
function checkExit() {
  if (!puzzle.doorOpen || puzzle.finished) return;
  const p = camera.position;
  if (p.z < -CONFIG.ROOM_D / 2 + 0.55 && Math.abs(p.x - CONFIG.DOOR_X) < 0.55) {
    puzzle.finished = true;
    playing = false;
    clearKeys();
    stopSound("ambience");
    console.log("[Phase3] 탈출 성공 → phase3Complete");
    emit("phase3Complete", { endingType: "normal" });
  }
}

// 교수 실루엣: 자기 조리대 뒤에서 대기 (STEP 7에서 움직임 추가)
function buildProfessor() {
  const g = new THREE.Group();
  g.name = "교수";
  const black = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 1.45, 8), black);
  body.position.y = 0.72;
  body.castShadow = true;
  g.add(body);

  // 셔츠 깃 + 넥타이 (교수님 차림)
  const white = mat(0xd8d8d0);
  const collarL = addBox(g, 0.09, 0.05, 0.02, -0.05, 1.41, 0.2, white);
  const collarR = addBox(g, 0.09, 0.05, 0.02, 0.05, 1.41, 0.2, white);
  collarL.rotation.z = -0.5; collarR.rotation.z = 0.5;
  const tie = addBox(g, 0.06, 0.38, 0.02, 0, 1.2, 0.245, mat(0x5a0d0d));
  tie.rotation.x = -0.07;

  // 머리 (C안: 하얗게 반사되는 안경, 꿰맨 입, 고개를 갸웃)
  const headPivot = new THREE.Group();          // 목을 기준으로 기울이기
  headPivot.position.y = 1.47;
  headPivot.rotation.z = 0.21;
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), black);
  head.position.y = 0.18;
  head.castShadow = true;
  headPivot.add(head);

  const glassMat = new THREE.MeshBasicMaterial({ color: 0xeef2ff });   // 조명과 상관없이 하얗게 빛남
  const rimMat = mat(0x777777);
  [-0.075, 0.075].forEach((ex) => {
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.01, 14), glassMat);
    lens.rotation.x = Math.PI / 2;               // 앞을 보게 세움
    lens.position.set(ex, 0.21, 0.19);
    lens.userData.isLens = true;
    headPivot.add(lens);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.006, 14), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(ex, 0.21, 0.186);
    headPivot.add(rim);
  });
  addBox(headPivot, 0.04, 0.008, 0.008, 0, 0.215, 0.192, rimMat, { cast: false });   // 안경 다리(코)

  const stitch = mat(0x8a1a1a);
  addBox(headPivot, 0.11, 0.008, 0.008, 0, 0.09, 0.178, stitch, { cast: false });    // 꿰맨 입
  [-0.04, -0.02, 0, 0.02, 0.04].forEach((sx) => {
    addBox(headPivot, 0.006, 0.035, 0.008, sx, 0.09, 0.18, stitch, { cast: false });  // 실밥
  });
  g.add(headPivot);
  world.professorHead = headPivot;

  // 투명 효과용: 교수의 모든 재질을 투명 가능하게 (복제해서 다른 물건에 영향 없게)
  g.traverse((o) => {
    if (o.isMesh || o.material) {
      o.material = o.material.clone();
      o.material.transparent = true;
      world.profMeshes.push(o);
      if (o.userData.isLens) world.profLenses.push(o);
    }
  });

  // 히든 루트: 서명한 출석인정서가 있을 때만 "[E] 교수님 안아주기"
  registerInteract(g,
    () => (puzzle.signed && !puzzle.finished && prof.state !== "GAMEOVER" ? "교수님 안아주기" : null),
    () => hugProfessor());

  // 잔상 3개 (가구를 통과할 때 뒤따라오는 검은 그림자)
  for (let i = 0; i < 3; i++) {
    const ghostMat = new THREE.MeshBasicMaterial({ color: 0x220a0a, transparent: true, opacity: 0, depthWrite: false });
    const ghost = new THREE.Group();
    const gb = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 1.45, 8), ghostMat);
    gb.position.y = 0.72;
    const gh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), ghostMat);
    gh.position.y = 1.65;
    ghost.add(gb, gh);
    ghost.visible = false;
    ghost.userData.mat = ghostMat;
    scene.add(ghost);
    world.ghosts.push(ghost);
  }
  g.position.set(CONFIG.PROF_START.x, 0, CONFIG.PROF_START.z);   // 교수 조리대 뒤 (플레이어 바로 왼쪽)
  g.lookAt(CONFIG.START_POS.x, 0, CONFIG.START_POS.z);            // 옆에 선 플레이어를 응시
  scene.add(g);
  world.professor = g;
  return g;
}

// =========================================================
// 6. 조명
// =========================================================
function buildLights() {
  const S = CONFIG.LIGHT_SCALE;

  // 아주 어두운 전체 조명 (완전한 검정 방지)
  world.ambient = new THREE.AmbientLight(0x404858, 0.35 * S);
  world.ambient.userData.base = world.ambient.intensity;
  scene.add(world.ambient);
  // 위쪽은 차갑고 아래는 어두운 은은한 하늘빛
  world.hemi = new THREE.HemisphereLight(0x8899aa, 0x101010, 0.35 * S);
  world.hemi.userData.base = world.hemi.intensity;
  scene.add(world.hemi);

  // 천장 전등 (그림자를 만드는 유일한 조명 → 성능 절약)
  const spot = new THREE.SpotLight(0xffe2b0, 40 * S, 12, Math.PI / 3, 0.6, 1.5);
  spot.position.set(0, CONFIG.ROOM_H - 0.15, 1.6);
  spot.target.position.set(0, 0, 1.6);
  spot.castShadow = CONFIG.SHADOWS;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.bias = -0.0005;
  scene.add(spot, spot.target);
  spot.userData.baseIntensity = spot.intensity;
  world.ceilingLight = spot;

  // 전구 모양 + 전선
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffe2b0 })
  );
  bulb.position.set(0, CONFIG.ROOM_H - 0.2, 1.6);
  scene.add(bulb);
  addBox(scene, 0.01, 0.15, 0.01, 0, CONFIG.ROOM_H - 0.08, 1.6, mat(0x111111), { cast: false });
  world.bulb = bulb;

  // 냉장고 쪽 차가운 빛 (냉장고 문틈에서 새는 빛 느낌, 그림자 없음)
  const fridgeGlow = new THREE.PointLight(0x88bbff, 3 * S, 4, 2);
  fridgeGlow.position.set(-CONFIG.ROOM_W / 2 + 1.2, 1.0, -0.6);
  scene.add(fridgeGlow);

  // 비상구 표시 아래 초록빛
  const exitGlow = new THREE.PointLight(0x33ff66, 2 * S, 3, 2);
  exitGlow.position.set(2.3, 2.3, -CONFIG.ROOM_D / 2 + 0.4);
  scene.add(exitGlow);
}

// 전등 깜빡임 (대부분 켜져 있다가 가끔 '지직')
let flickerTimer = 0;
function updateFlicker(dt) {
  const L = world.ceilingLight;
  if (!L || puzzle.lightsOff) return;     // 불을 껐으면 깜빡임 없음
  flickerTimer -= dt;
  if (flickerTimer <= 0) {
    const off = Math.random() < 0.35;
    L.intensity = L.userData.baseIntensity * (off ? 0.1 + Math.random() * 0.3 : 1);
    world.bulb.material.color.setHex(off ? 0x332a20 : 0xffe2b0);
    flickerTimer = off ? 0.05 + Math.random() * 0.12 : 0.6 + Math.random() * 2.5;
  }
}

// =========================================================
// 7. 화면 UI: 조준점, 조작 안내, 시작/일시정지 화면
// =========================================================
function buildUI() {
  ui.crosshair = document.createElement("div");
  ui.crosshair.className = "p3-crosshair";
  ui.crosshair.hidden = true;

  ui.hint = document.createElement("div");
  ui.hint.className = "p3-hint";
  ui.hint.textContent = IS_TOUCH ? "왼쪽 드래그 이동 · 오른쪽 드래그 시점" : "WASD 이동 · 마우스 시점 · ESC 일시정지";
  ui.hint.hidden = true;

  ui.overlay = document.createElement("div");
  ui.overlay.className = "p3-overlay";
  ui.overlay.addEventListener("click", onOverlayClick);
  ui.overlay.addEventListener("input", onOverlayInput);

  ui.prompt = document.createElement("div");      // "[E] 냉장고 야채칸 열기"
  ui.prompt.className = "p3-prompt";
  ui.prompt.hidden = true;

  ui.toast = document.createElement("div");       // 잠깐 떴다 사라지는 메시지
  ui.toast.className = "p3-toast";
  ui.toast.hidden = true;

  ui.hud = document.createElement("div");         // 오른쪽 위 진행 상황
  ui.hud.className = "p3-hud";
  ui.hud.hidden = true;

  ui.panel = document.createElement("div");       // 성적표 보기 / 번호키 창
  ui.panel.className = "p3-panel";
  ui.panel.hidden = true;

  ui.whiteout = document.createElement("div");    // 안아주기 → 하얗게 밝아지는 화면
  ui.whiteout.className = "p3-whiteout";
  ui.whiteout.hidden = true;
  ui.whiteout.innerHTML = `<p class="p3-whiteout-msg">"…고맙네."</p>`;

  root.append(ui.crosshair, ui.hint, ui.prompt, ui.toast, ui.hud, ui.panel, ui.whiteout, ui.overlay);
  if (IS_TOUCH) buildTouchUI();
  updateHUD();
}

// ---------- 진행 상황 표시 ----------
function updateHUD() {
  if (!ui.hud) return;
  // 찾은 숫자는 그대로, 퀴즈를 본 자리는 "Q", 아직 모르는 자리는 "?"
  const d1 = puzzle.unlocked || puzzle.drawerOpen ? "1" : "?";
  const d2 = puzzle.unlocked ? "0" : puzzle.quizSeen ? "Q" : "?";
  const d3 = puzzle.unlocked ? "0" : puzzle.sheetRead ? "Q" : "?";
  const keyText = puzzle.doorOpen ? "문 열림" : puzzle.hasKey ? "열쇠 있음" : puzzle.unlocked ? "열쇠를 주워라" : "열쇠 없음";
  ui.hud.innerHTML = `
    <div class="p3-hud-row">암호 <span class="p3-digit">${d1}</span><span class="p3-digit">${d2}</span><span class="p3-digit">${d3}</span></div>
    <div class="p3-hud-row p3-hud-key ${puzzle.hasKey || puzzle.doorOpen ? "p3-on" : ""}">🔑 ${keyText}</div>
    ${puzzle.hasCert ? `<div class="p3-hud-row p3-hud-item">📄 출석인정서${puzzle.signed ? " (서명 완료)" : ""}</div>` : ""}
    ${puzzle.hasPen && !puzzle.signed ? `<div class="p3-hud-row p3-hud-item">🖊 볼펜</div>` : ""}
    ${puzzle.hasSpoon && !puzzle.pried ? `<div class="p3-hud-row p3-hud-item">🥄 숟가락</div>` : ""}`;
}

// ---------- 잠깐 뜨는 메시지 ----------
function showToast(msg, ms = 3200) {
  if (!ui.toast) return;
  ui.toast.textContent = msg;
  ui.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast.hidden = true; }, ms);
}

// ---------- 성적표 크게 보기 ----------
function openSheetPanel() {
  panelMode = "sheet";
  puzzle.sheetRead = true;
  updateHUD();
  ui.panel.innerHTML = "";
  const GS = window.FCredit.GradeSheet;
  if (GS && typeof GS.createCanvas === "function") {
    const cv = GS.createCanvas("quiz", 600);
    cv.className = "p3-sheet-view";
    ui.panel.appendChild(cv);
  } else {
    ui.panel.innerHTML = `<p class="p3-panel-msg">Q. 태양계 행성들의 위성 개수를 전부 곱하시오.</p>`;
  }
  const tip = document.createElement("p");
  tip.className = "p3-panel-tip";
  tip.textContent = tipText("[E] 닫기");
  ui.panel.appendChild(tip);
  ui.panel.hidden = false;
  ui.prompt.hidden = true;
  ui.toast.hidden = true;          // 뒤에 메시지가 비치지 않게
  clearTimeout(toastTimer);
  clearKeys();
}

// ---------- 번호키 ----------
function openKeypadPanel() {
  panelMode = "keypad";
  puzzle.input = "";
  ui.panel.hidden = false;
  ui.prompt.hidden = true;
  ui.toast.hidden = true;          // 뒤에 메시지가 비치지 않게
  clearTimeout(toastTimer);
  clearKeys();
  renderKeypad("세 자리 숫자를 입력하세요");
}

function renderKeypad(msg, state = "") {
  const slots = [0, 1, 2].map((i) => `<span class="p3-slot">${puzzle.input[i] ?? "_"}</span>`).join("");
  ui.panel.innerHTML = `
    <div class="p3-keypad ${state}">
      <p class="p3-keypad-title">번 호 키</p>
      <div class="p3-slots">${slots}</div>
      <p class="p3-panel-msg">${msg}</p>
      ${IS_TOUCH ? `<div class="p3-numpad">${["1","2","3","4","5","6","7","8","9","del","0","close"].map((k) =>
        `<button type="button" data-k="${k}">${k === "del" ? "←" : k === "close" ? "닫기" : k}</button>`).join("")}</div>`
        : `<p class="p3-panel-tip">숫자 키 입력 · Backspace 지우기 · [E] 닫기</p>`}
    </div>`;
}

function onKeypadDigit(d) {
  if (puzzle.input.length >= 3 || puzzle.unlocked) return;
  puzzle.input += d;
  sound("click");
  renderKeypad("세 자리 숫자를 입력하세요");
  if (puzzle.input.length === 3) {
    if (puzzle.input === CONFIG.PASSWORD) {
      puzzle.unlocked = true;
      sound("correct");
      renderKeypad("철컥! 번호키 상자가 열렸다.", "p3-ok");
      spawnKey();
      updateHUD();
      setTimeout(() => {
        if (panelMode === "keypad") closePanel();
        showToast("번호키 상자에서 열쇠가 떨어졌다. 바닥을 보자.");
      }, 1100);
    } else {
      sound("wrong");
      renderKeypad("삐빅- 틀렸습니다", "p3-wrong");
      setTimeout(() => {
        if (panelMode === "keypad" && !puzzle.unlocked) {
          puzzle.input = "";
          renderKeypad("세 자리 숫자를 입력하세요");
        }
      }, 800);
    }
  }
}

// ---------- 히든 루트: 서명 ----------
function openSignPanel() {
  if (puzzle.signed) return;
  panelMode = "sign";
  signAnim = null;
  ui.panel.innerHTML = "";
  const cv = makeCertCanvas(0, 450);
  cv.className = "p3-sheet-view";
  ui.panel.appendChild(cv);
  const tip = document.createElement("p");
  tip.className = "p3-panel-tip";
  tip.textContent = tipText("볼펜으로 학생 서명란에 서명할까?   [E] 서명하기");
  ui.panel.appendChild(tip);
  ui.panel.hidden = false;
  ui.prompt.hidden = true;
  ui.toast.hidden = true;
  clearTimeout(toastTimer);
  clearKeys();
}

function startSigning() {
  if (signAnim || puzzle.signed) return;
  const cv = ui.panel.querySelector("canvas");
  const tip = ui.panel.querySelector(".p3-panel-tip");
  if (tip) tip.textContent = "슥슥…";
  sound("sign");
  signAnim = { start: performance.now() };
  const step = () => {
    if (panelMode !== "sign" || !signAnim) return;            // 창이 닫히면 중단
    const p = (performance.now() - signAnim.start) / 1200;
    if (cv) drawCertificate(cv, p);
    if (p < 1) { requestAnimationFrame(step); return; }
    puzzle.signed = true;
    signAnim = null;
    updateHUD();
    setTimeout(() => {
      if (panelMode === "sign") closePanel();
      showToast("출석인정서에 서명했다. …교수님께 이걸 드리면 어떨까?", 4000);
    }, 700);
  };
  requestAnimationFrame(step);
}

// ---------- 히든 루트: 녹화 테이프 영상 ----------
function playTape() {
  const CS = window.FCredit.Cutscene;
  if (!CS || typeof CS.play !== "function") {
    showToast("테이프가 망가져 있다.");
    return;
  }
  panelMode = "cutscene";
  clearKeys();
  ui.prompt.hidden = true;
  ui.toast.hidden = true;
  const T = window.FCredit.Timer;
  if (T) T.pause();                                   // 영상 보는 동안 대결 시간 정지
  sound("tape");
  const firstTime = !puzzle.watched;
  CS.play(() => {
    if (panelMode === "cutscene") panelMode = null;
    puzzle.watched = true;
    clock.getDelta();
    if (playing && T) T.resume();
    if (firstTime) showToast("…교수님에게 저런 일이. 교수 조리대 위의 종이가 마음에 걸린다.", 4500);
  });
}

// ---------- 히든 루트: 안아주기 → 리얼 해피엔딩 ----------
function hugProfessor() {
  if (!puzzle.signed || puzzle.finished || prof.state === "GAMEOVER") return;
  puzzle.hugged = true;
  puzzle.finished = true;
  playing = false;
  clearKeys();
  closePanel();
  stopSound("ambience");
  sound("hug");
  const T = window.FCredit.Timer;
  if (T) { T.pause(); T.show(false); }          // 하얀 화면 위에 타이머가 보이지 않게
  console.log("[Phase3] 교수님을 안아줌 → 해피엔딩");

  // 교수가 나를 바라보고, 안경 빛이 꺼짐
  const g = world.professor;
  g.lookAt(camera.position.x, 0, camera.position.z);
  for (const m of world.profMeshes) m.material.opacity = 1;
  g.scale.set(1, 1, 1);
  world.profLenses.forEach((l) => l.material.color.setHex(0x3a3a3a));
  world.ghosts.forEach((gh) => { gh.visible = false; });
  ui.crosshair.hidden = true;
  ui.hint.hidden = true;
  ui.prompt.hidden = true;
  ui.hud.hidden = true;
  ui.toast.hidden = true;

  // 화면이 하얗게 밝아짐
  ui.whiteout.hidden = false;
  requestAnimationFrame(() => ui.whiteout.classList.add("p3-on"));
  setTimeout(() => {
    if (!puzzle.hugged) return;
    releaseLock();
    emit("phase3Complete", { endingType: "happy" });
  }, 3600);
}

function closePanel() {
  if (panelMode === "cutscene") {
    const CS = window.FCredit.Cutscene;
    if (CS && CS.isPlaying()) CS.stop();            // ESC 등으로 닫히면 영상도 끝냄
  }
  signAnim = null;
  panelMode = null;
  if (ui.panel) { ui.panel.hidden = true; ui.panel.innerHTML = ""; }
}

// ---------- 조준점이 가리키는 물건 찾기 (Raycaster) ----------
function updateLookTarget() {
  lookTarget = null;
  let prompt = null;
  if (playing && !panelMode && !puzzle.finished) {
    raycaster.setFromCamera(screenCenter, camera);
    const hits = raycaster.intersectObjects(world.interactables, true);
    for (const hit of hits) {
      let o = hit.object;
      while (o && !(o.userData && o.userData.interact)) o = o.parent;   // 등록된 부모 찾기
      if (!o || o.visible === false) continue;
      const text = o.userData.interact.getPrompt();
      if (text) { lookTarget = o; prompt = text; break; }   // 가장 가까운 '조사 가능한' 물건
      // 지금 조사할 게 없는 물건(조리대, 교수 등)이면 그 뒤의 물건을 계속 찾음
    }
  }
  if (prompt) {
    ui.prompt.textContent = IS_TOUCH ? `▶ ${prompt}` : `[E] ${prompt}`;
    ui.prompt.hidden = false;
  } else if (ui.prompt) {
    ui.prompt.hidden = true;
  }
}

function useLookTarget() {
  if (!lookTarget) return;
  try {
    lookTarget.userData.interact.onUse();
  } catch (err) {
    console.error("[Phase3] 조사 중 오류:", err);
  }
}

// 오버레이 화면 종류: "start"(처음) / "pause"(ESC) / "caught"(임시 게임오버)
function showOverlay(mode) {
  setTouchUI(false);
  ui.crosshair.hidden = true;
  ui.hint.hidden = true;
  ui.prompt.hidden = true;
  ui.hud.hidden = true;
  ui.overlay.hidden = false;
  ui.overlay.dataset.mode = mode;

  if (mode === "caught") {
    ui.overlay.innerHTML = `
      <div class="p3-box p3-box-caught">
        <div class="p3-badges"><span class="p3-badge p3-badge-rec">● REC</span><span class="p3-badge">평가 종료</span></div>
        <p class="p3-gameover" data-text="F학점 확정!">F학점 확정!</p>
        <p class="p3-msg">교수님에게 잡혔습니다.</p>
        <button class="p3-btn" data-act="restart">다시 시작</button>
      </div>`;
    return;
  }

  const isPause = mode === "pause";
  const title = isPause ? "일시정지" : "안녕?";
  ui.overlay.innerHTML = `
    <div class="p3-box">
      <div class="p3-badges">
        <span class="p3-badge p3-badge-rec">● REC</span>
        <span class="p3-badge">${isPause ? "PAUSE" : "SIGNAL LOST"}</span>
      </div>
      <p class="p3-title${isPause ? "" : " p3-title-glitch"}" data-text="${title}">${title}</p>
      <p class="p3-msg">▶ 화면을 ${IS_TOUCH ? "터치" : "클릭"}하면 ${isPause ? "이어서 합니다" : "시작합니다"}</p>
      ${IS_TOUCH ? `<table class="p3-keys">
        <tr><td><kbd>왼쪽</kbd></td><td>드래그해서 이동</td></tr>
        <tr><td><kbd>오른쪽</kbd></td><td>드래그해서 시점 돌리기</td></tr>
        <tr><td><kbd>▶ 버튼</kbd></td><td>물건을 보면 오른쪽 아래에 뜸 → 탭</td></tr>
        <tr><td><kbd>II</kbd></td><td>일시정지</td></tr>
      </table>` : `<table class="p3-keys">
        <tr><td><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></td><td>이동</td></tr>
        <tr><td><kbd>마우스</kbd></td><td>시점 회전</td></tr>
        <tr><td><kbd>E</kbd></td><td>조사하기</td></tr>
        <tr><td><kbd>ESC</kbd></td><td>일시정지 (마우스 풀기)</td></tr>
      </table>`}
      <label class="p3-sens">${IS_TOUCH ? "시점" : "마우스"} 감도
        <input type="range" min="0.4" max="2" step="0.1" value="${sensScale}">
        <span class="p3-sens-val">${sensScale.toFixed(1)}배</span>
      </label>
      <div class="p3-tmp"${SHOW_DEV ? "" : " hidden"}>
        [임시 테스트]
        <button data-act="escape">탈출 성공</button>
        <button data-act="caught">교수에게 잡힘</button>
        <button data-act="timeup">대결 시간 종료</button>
      </div>
    </div>`;
}

function hideOverlay() {
  setTouchUI(true);
  ui.overlay.hidden = true;
  ui.crosshair.hidden = false;
  ui.hint.hidden = false;
  ui.hud.hidden = false;
}

// 감도 슬라이더
function onOverlayInput(e) {
  if (e.target && e.target.type === "range") {
    sensScale = parseFloat(e.target.value) || 1;
    const label = ui.overlay.querySelector(".p3-sens-val");
    if (label) label.textContent = sensScale.toFixed(1) + "배";
  }
}

// 오버레이 클릭: 버튼이면 버튼 동작, 빈 곳이면 마우스 잠금(게임 시작/재개)
function onOverlayClick(e) {
  const t = e.target;
  const btn = t.closest ? t.closest("button") : null;
  if (btn) {
    const act = btn.dataset.act;
    if (act === "escape") {
      emit("phase3Complete", { endingType: "normal" });
    } else if (act === "caught") {
      triggerGameOver();
    } else if (act === "timeup") {
      const T = window.FCredit.Timer;
      if (T) T.set(0);              // 타이머를 0으로 → 클릭해서 재개하면 contestTimeUp
      else onContestTimeUp();
      const msg = ui.overlay.querySelector(".p3-msg");
      if (msg) msg.textContent = "대결 시간을 0으로 만들었습니다. 클릭해서 이어 하세요.";
    } else if (act === "restart") {
      emit("restartRequest", { from: "phase3" });
    }
    return;
  }
  if (t.closest && t.closest("label, input")) return;   // 슬라이더 조작은 무시
  if (ui.overlay.dataset.mode === "caught") return;
  if (IS_TOUCH) { goFullscreen(); enterPlay(); return; }
  requestLock();
}

// =========================================================
// 8. Pointer Lock (마우스 잠금)
// =========================================================
function requestLock() {
  if (!active) return;
  if (performance.now() < lockReadyAt) {
    // Chrome은 ESC로 풀린 직후 약 1초 동안 다시 잠그지 못하게 막음
    const msg = ui.overlay.querySelector(".p3-msg");
    if (msg) msg.textContent = "잠시 후 다시 클릭하세요...";
    return;
  }
  try {
    const p = renderer.domElement.requestPointerLock();
    if (p && typeof p.catch === "function") {
      p.catch((err) => {
        console.warn("[Phase3] 마우스 잠금 실패:", err && err.message);
        const msg = ui.overlay.querySelector(".p3-msg");
        if (msg) msg.textContent = "잠시 후 다시 클릭하세요...";
      });
    }
  } catch (err) {
    console.warn("[Phase3] 마우스 잠금 실패:", err);
  }
}

function releaseLock() {
  if (IS_TOUCH) { if (playing) pausePlay(); return; }
  if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
}

// 플레이 시작/재개 (PC = 마우스 잠김, 폰 = 시작 화면 터치)
function enterPlay() {
  if (!active || prof.state === "GAMEOVER") return;
  const T = window.FCredit.Timer;
  playing = true;
  clock.getDelta();          // 멈춰 있던 시간만큼 한 번에 움직이지 않게
  hideOverlay();
  if (T) T.resume();         // 플레이 중에만 대결 시간이 흐름
}

// 일시정지 (PC = 마우스 풀림, 폰 = II 버튼·화면 세로·앱 전환)
function pausePlay() {
  const T = window.FCredit.Timer;
  if (T) T.pause();
  playing = false;
  clearKeys();
  closePanel();
  if (active && !puzzle.finished && ui.overlay.dataset.mode !== "caught") showOverlay("pause");
}

function onPointerLockChange() {
  if (IS_TOUCH) return;
  const locked = document.pointerLockElement === renderer.domElement;
  if (locked) enterPlay();
  else {
    pausePlay();
    lockReadyAt = performance.now() + 1100;
  }
}

function onPointerLockError() {
  console.warn("[Phase3] pointerlockerror");
  const msg = ui.overlay && ui.overlay.querySelector(".p3-msg");
  if (msg) msg.textContent = "잠시 후 다시 클릭하세요...";
}

// =========================================================
// 9. 입력: 마우스 시점, 키보드
// =========================================================
function onMouseMove(e) {
  if (!playing || panelMode) return;
  const mx = e.movementX || 0, my = e.movementY || 0;
  if (Math.abs(mx) > 300 || Math.abs(my) > 300) return;   // 가끔 생기는 튐 현상 무시
  const sens = CONFIG.MOUSE_SENS * sensScale;
  yaw -= mx * sens;
  pitch -= my * sens;
  const lim = THREE.MathUtils.degToRad(CONFIG.PITCH_LIMIT);
  pitch = Math.max(-lim, Math.min(lim, pitch));
}

// e.code 사용: 한글 입력 상태(ㅈㅁㄴㅇ)에서도 W/A/S/D로 인식됨
const KEY_MAP = { KeyW: "forward", ArrowUp: "forward", KeyS: "back", ArrowDown: "back",
                  KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right" };

function onKeyDown(e) {
  if (!playing) return;

  // [E] 조사하기 / 열린 창 닫기
  if (e.code === "KeyE") {
    e.preventDefault();
    if (e.repeat) return;
    pressE();
    return;
  }

  // 번호키 창이 열려 있으면 숫자 입력
  if (panelMode === "keypad") {
    const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
    if (m) { e.preventDefault(); onKeypadDigit(m[1]); }
    else if (e.code === "Backspace") { e.preventDefault(); keypadBackspace(); }
    return;
  }
  if (panelMode) return;

  const k = KEY_MAP[e.code];
  if (k) { keys[k] = true; e.preventDefault(); }
}

function pressE() {
  if (panelMode === "cutscene") {
    const CS = window.FCredit.Cutscene;
    if (CS) CS.skip();
  } else if (panelMode === "sign") {
    startSigning();
  } else if (panelMode) closePanel();
  else useLookTarget();
}

function keypadBackspace() {
  if (puzzle.unlocked) return;
  puzzle.input = puzzle.input.slice(0, -1);
  renderKeypad("세 자리 숫자를 입력하세요");
}

// =========================================================
// 9-3. 갑툭튀 연출 (한 번씩만)
//   scareF(): 서랍 F 쪽지 → 화면이 빨간 F로 순식간에 도배 (약 1.4초)
//   scareKetchup(): 시식대 그릇 → 피 같은 케첩이 화면에 튀고 흘러내림 (약 3.5초, 케첩임)
//   소리는 C의 효과음을 씀 (detect, glitch, ingredient)
// =========================================================
let scareBusy = false;

function makeScareCanvas(cls) {
  const cv = document.createElement("canvas");
  cv.className = `p3-scare ${cls}`;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = root.getBoundingClientRect();
  cv.width = Math.max(320, Math.round(r.width * dpr));
  cv.height = Math.max(180, Math.round(r.height * dpr));
  root.appendChild(cv);
  return cv;
}

function buzz(ms) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (err) { /* 진동 없는 기기 */ }
}

function scareF(onDone) {
  if (scareBusy) { if (onDone) onDone(); return; }
  scareBusy = true;
  // A가 만든 갑툭튀 전용 소리 (js/bgm.js). 없으면 C의 효과음으로 대신
  const BG = window.FCredit.BGM;
  if (!(BG && typeof BG.sting === "function" && BG.sting("fscare"))) { sound("glitch"); sound("detect"); }
  buzz([120, 40, 200]);
  const cv = makeScareCanvas("p3-scare-f");
  const g = cv.getContext("2d");
  const W = cv.width, H = cv.height;
  // F 하나하나의 위치·크기·기울기 (미리 정해 두고, 시간이 지날수록 더 많이 보여줌)
  let seed = 1515;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const COLORS = ["#ff2a3c", "#c0101e", "#8b1e2b", "#ff2a3c", "#ece3de", "#5a0a12"];
  const fs = [];
  for (let i = 0; i < 260; i++) {
    const size = H * (0.05 + Math.pow(rnd(), 2.2) * 0.42);
    fs.push({ x: rnd() * W, y: rnd() * H, size, rot: (rnd() - 0.5) * 0.9, c: COLORS[Math.floor(rnd() * COLORS.length)], outline: rnd() < 0.35 });
  }
  const t0 = performance.now();
  const HOLD = 1150, FADE = 380;
  const frame = () => {
    const t = performance.now() - t0;
    if (!cv.isConnected) return;
    if (t > HOLD + FADE) {
      cv.remove();
      root.classList.remove("p3-shake");
      scareBusy = false;
      if (onDone) onDone();
      return;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    g.globalAlpha = t > HOLD ? 1 - (t - HOLD) / FADE : 1;
    g.fillStyle = `rgba(8, 0, 2, ${0.55 + 0.3 * Math.random()})`;   // 깜빡이는 어두운 바탕
    g.fillRect(0, 0, W, H);
    const n = Math.min(fs.length, Math.floor(25 + (t / 260) * fs.length));   // 0.26초 만에 화면을 다 채움
    const jitter = H * 0.006;
    for (let i = 0; i < n; i++) {
      const f = fs[i];
      g.save();
      g.translate(f.x + (Math.random() - 0.5) * jitter, f.y + (Math.random() - 0.5) * jitter);
      g.rotate(f.rot);
      g.font = `bold ${Math.round(f.size)}px "Galmuri14", "Galmuri11", sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      if (f.outline) { g.lineWidth = Math.max(2, f.size * 0.06); g.strokeStyle = "#000"; g.strokeText("F", 0, 0); }
      g.fillStyle = f.c;
      g.fillText("F", 0, 0);
      g.restore();
    }
    // 가운데 거대한 F (빨강·하늘색으로 갈라짐)
    const big = H * (0.95 + 0.04 * Math.sin(t / 30));
    g.font = `bold ${Math.round(big)}px "Galmuri14", "Galmuri11", sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const sx = (Math.random() - 0.5) * W * 0.012;
    g.fillStyle = "rgba(0, 240, 255, 0.75)"; g.fillText("F", W / 2 - big * 0.035 + sx, H / 2);
    g.fillStyle = "#000"; g.fillText("F", W / 2 + big * 0.035 + sx, H / 2 + big * 0.02);
    g.fillStyle = "#ff2a3c"; g.fillText("F", W / 2 + sx, H / 2);
    // 가로로 찢어지는 줄
    for (let k = 0; k < 3; k++) {
      if (Math.random() < 0.5) continue;
      const y = Math.random() * H, h = H * (0.01 + Math.random() * 0.04);
      try { const img = g.getImageData(0, y, W, h); g.putImageData(img, (Math.random() - 0.5) * W * 0.06, y); } catch (err) { /* 무시 */ }
    }
    requestAnimationFrame(frame);
  };
  root.classList.add("p3-shake");
  frame();
}

// 울퉁불퉁한 방울 모양
function splatPath(g, cx, cy, r, rnd) {
  const N = 40, waves = [];
  for (let i = 0; i < 4; i++) waves.push({ f: 2 + Math.floor(rnd() * 6), p: rnd() * 6.28, a: (0.08 + rnd() * 0.16) / (i + 1) });
  g.beginPath();
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    let k = 1;
    waves.forEach((w) => { k += w.a * Math.sin(w.f * a + w.p); });
    const x = cx + Math.cos(a) * r * k, y = cy + Math.sin(a) * r * k;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
}

function scareKetchup(onDone) {
  if (scareBusy) { if (onDone) onDone(); return; }
  scareBusy = true;
  sound("detect");
  sound("ingredient");
  buzz(260);
  const cv = makeScareCanvas("p3-scare-ketchup");
  const g = cv.getContext("2d");
  const W = cv.width, H = cv.height, U = Math.min(W, H);
  let seed = 808;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // 큰 덩어리 4~5개 (화면 가운데 쪽), 각 덩어리에서 흘러내리는 줄기 + 튄 방울
  const blobs = [];
  const nb = 5;
  for (let i = 0; i < nb; i++) {
    const cx = W * (0.18 + rnd() * 0.64), cy = H * (0.12 + rnd() * 0.5);
    const r = U * (0.07 + rnd() * 0.11);
    const drips = [];
    const nd = 2 + Math.floor(rnd() * 4);
    for (let d = 0; d < nd; d++) drips.push({ x: cx + (rnd() - 0.5) * r * 1.4, w: U * (0.012 + rnd() * 0.022), len: H * (0.15 + rnd() * 0.55), speed: 0.6 + rnd() * 0.8 });
    const dots = [];
    for (let d = 0; d < 22; d++) {
      const a = rnd() * 6.28, dist = r * (1.2 + rnd() * 2.2);
      dots.push({ x: cx + Math.cos(a) * dist, y: cy + Math.sin(a) * dist, s: U * (0.004 + rnd() * 0.016), a });
    }
    blobs.push({ cx, cy, r, drips, dots, at: i * 70 + rnd() * 60, seed: 100 + i * 37 });
  }
  const t0 = performance.now();
  const HOLD = 2600, FADE = 900;
  const frame = () => {
    const t = performance.now() - t0;
    if (!cv.isConnected) return;
    if (t > HOLD + FADE) {
      cv.remove();
      root.classList.remove("p3-shake");
      scareBusy = false;
      if (onDone) onDone();
      return;
    }
    if (t > 260) root.classList.remove("p3-shake");
    g.clearRect(0, 0, W, H);
    g.globalAlpha = t > HOLD ? 1 - (t - HOLD) / FADE : 1;
    if (t < 120) { g.fillStyle = `rgba(160, 10, 10, ${0.35 * (1 - t / 120)})`; g.fillRect(0, 0, W, H); }   // 번쩍
    for (const b of blobs) {
      const lt = t - b.at;
      if (lt < 0) continue;
      const pop = Math.min(1, lt / 90);                         // 순식간에 튀어 붙음
      const r = b.r * (0.6 + 0.4 * pop) * (1 + 0.15 * Math.max(0, 1 - lt / 160));
      // 흘러내림
      for (const d of b.drips) {
        const len = Math.min(d.len, Math.max(0, (lt - 150) / 1000) * d.len * d.speed);
        if (len <= 0) continue;
        const y0 = b.cy;
        const grad = g.createLinearGradient(0, y0, 0, y0 + len);
        grad.addColorStop(0, "#9e150d"); grad.addColorStop(1, "#6e0906");
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(d.x - d.w / 2, y0);
        g.quadraticCurveTo(d.x - d.w * 0.3, y0 + len * 0.6, d.x - d.w * 0.2, y0 + len);
        g.lineTo(d.x + d.w * 0.2, y0 + len);
        g.quadraticCurveTo(d.x + d.w * 0.3, y0 + len * 0.6, d.x + d.w / 2, y0);
        g.fill();
        g.beginPath(); g.arc(d.x, y0 + len, d.w * 0.45, 0, Math.PI * 2); g.fill();
      }
      // 튄 방울
      g.fillStyle = "#a3170e";
      for (const dt of b.dots) {
        const k = Math.min(1, lt / 120);
        const x = b.cx + (dt.x - b.cx) * k, y = b.cy + (dt.y - b.cy) * k;
        g.save(); g.translate(x, y); g.rotate(dt.a);
        g.beginPath(); g.ellipse(0, 0, dt.s * 1.8, dt.s, 0, 0, Math.PI * 2); g.fill();
        g.restore();
      }
      // 덩어리 몸통 + 진한 테두리 + 광택
      let s2 = b.seed;
      const r2 = () => (s2 = (s2 * 16807) % 2147483647) / 2147483647;
      splatPath(g, b.cx, b.cy, r, r2);
      const body = g.createRadialGradient(b.cx - r * 0.25, b.cy - r * 0.25, r * 0.1, b.cx, b.cy, r * 1.15);
      body.addColorStop(0, "#7c0b08"); body.addColorStop(0.55, "#9e150d"); body.addColorStop(1, "#b8241a");
      g.fillStyle = body;
      g.fill();
      g.strokeStyle = "rgba(70, 4, 2, 0.75)";
      g.lineWidth = Math.max(1.5, U * 0.003);
      g.stroke();
      const hl = g.createRadialGradient(b.cx - r * 0.35, b.cy - r * 0.35, 0, b.cx - r * 0.35, b.cy - r * 0.35, r * 0.35);
      hl.addColorStop(0, "rgba(255, 230, 220, 0.7)"); hl.addColorStop(1, "rgba(255, 200, 190, 0)");
      g.fillStyle = hl;
      g.beginPath(); g.ellipse(b.cx - r * 0.35, b.cy - r * 0.35, r * 0.35, r * 0.18, -0.6, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    requestAnimationFrame(frame);
  };
  root.classList.add("p3-shake");
  frame();
}

function clearScares() {
  root && root.querySelectorAll(".p3-scare").forEach((el) => el.remove());
  if (root) root.classList.remove("p3-shake");
  scareBusy = false;
}

// =========================================================
// 9-2. 터치 조작 (휴대폰): 왼쪽 드래그 = 이동 조이스틱, 오른쪽 드래그 = 시점,
//      물건을 보면 오른쪽 아래 ▶ 버튼, 왼쪽 위 II = 일시정지, 창이 열리면 화면 탭 = 닫기
// =========================================================
function buildTouchUI() {
  root.classList.add("p3-touch");
  ui.joy = document.createElement("div");
  ui.joy.className = "p3-joy";
  ui.joy.innerHTML = `<div class="p3-joy-knob"></div>`;
  ui.joyKnob = ui.joy.firstElementChild;
  ui.pauseBtn = document.createElement("button");
  ui.pauseBtn.type = "button";
  ui.pauseBtn.className = "p3-pause-btn";
  ui.pauseBtn.textContent = "II 정지";
  ui.pauseBtn.addEventListener("click", (e) => { e.stopPropagation(); if (playing) pausePlay(); });
  root.append(ui.joy, ui.pauseBtn);
  setTouchUI(false);

  // ▶ 버튼(조사)
  ui.prompt.addEventListener("click", (e) => {
    e.stopPropagation();
    if (playing && !panelMode) useLookTarget();
  });
  // 번호키 숫자판
  ui.panel.addEventListener("click", (e) => {
    const b = e.target.closest ? e.target.closest("button[data-k]") : null;
    if (!b) return;
    e.stopPropagation();
    const k = b.dataset.k;
    if (k === "del") keypadBackspace();
    else if (k === "close") closePanel();
    else onKeypadDigit(k);
  });
  // 창(성적표·야광글씨·서명·녹화 영상)이 열려 있을 때 화면 탭 = [E]
  //  아이폰 Safari는 그냥 화면(div)을 탭하면 click이 안 생기는 경우가 있어서
  //  손가락을 뗀 순간(touchend)에 직접 처리하고, 뒤따라오는 click은 무시한다.
  const panelTap = (target) => {
    if (!active || !playing || !panelMode || panelMode === "keypad") return false;
    if (target && target.closest && target.closest(".p3-overlay, .p3-pause-btn, button")) return false;
    pressE();
    return true;
  };
  let tapStart = null, lastTapAt = 0;
  document.addEventListener("touchstart", (e) => {
    const t = e.changedTouches[0];
    tapStart = t ? { x: t.clientX, y: t.clientY, at: performance.now() } : null;
  }, { capture: true, passive: true });
  document.addEventListener("touchend", (e) => {
    const t = e.changedTouches[0];
    if (!tapStart || !t) return;
    const moved = Math.hypot(t.clientX - tapStart.x, t.clientY - tapStart.y);
    const quick = performance.now() - tapStart.at < 600;
    tapStart = null;
    if (moved < 14 && quick && panelTap(e.target)) lastTapAt = performance.now();
  }, { capture: true });
  document.addEventListener("click", (e) => {
    if (performance.now() - lastTapAt < 700) return;      // 방금 touchend로 처리한 탭
    panelTap(e.target);
  });

  root.addEventListener("touchstart", onTouchStart, { passive: false });
  root.addEventListener("touchmove", onTouchMove, { passive: false });
  root.addEventListener("touchend", onTouchEnd);
  root.addEventListener("touchcancel", onTouchEnd);

  // 세로로 돌리면 자동 일시정지 (세로 화면에는 '가로로 돌려주세요' 안내가 덮음)
  if (window.matchMedia) {
    const mq = matchMedia("(orientation: portrait)");
    const onOri = () => { if (mq.matches && playing) pausePlay(); };
    if (mq.addEventListener) mq.addEventListener("change", onOri);
  }
}

function setTouchUI(on) {
  if (!IS_TOUCH || !ui.joy) return;
  ui.joy.hidden = !on;
  ui.pauseBtn.hidden = !on;
  if (!on) resetTouch();
}

function resetTouch() {
  touch.joyId = touch.lookId = null;
  touch.x = touch.y = 0;
  if (ui.joy) {
    ui.joy.classList.remove("p3-joy-on");
    ui.joy.style.left = ui.joy.style.top = "";
    ui.joyKnob.style.transform = "";
  }
}

function isUITarget(t) {
  return !!(t && t.closest && t.closest(".p3-overlay, .p3-prompt, .p3-pause-btn, .p3-panel, button"));
}

function onTouchStart(e) {
  if (isUITarget(e.target)) return;
  if (!playing || panelMode) return;     // 창이 열려 있으면 탭(click)으로 닫히게 그대로 둠
  e.preventDefault();
  const rect = root.getBoundingClientRect();
  for (const t of e.changedTouches) {
    const x = t.clientX - rect.left, y = t.clientY - rect.top;
    if (x < rect.width * 0.45 && touch.joyId === null) {
      touch.joyId = t.identifier;
      touch.jx = x; touch.jy = y;
      ui.joy.style.left = `${x}px`;
      ui.joy.style.top = `${y}px`;
      ui.joy.classList.add("p3-joy-on");
    } else if (touch.lookId === null) {
      touch.lookId = t.identifier;
      touch.lx = t.clientX; touch.ly = t.clientY;
    }
  }
}

function onTouchMove(e) {
  if (touch.joyId === null && touch.lookId === null) return;
  e.preventDefault();
  const rect = root.getBoundingClientRect();
  for (const t of e.changedTouches) {
    if (t.identifier === touch.joyId) {
      let dx = t.clientX - rect.left - touch.jx, dy = t.clientY - rect.top - touch.jy;
      const len = Math.hypot(dx, dy);
      if (len > JOY_R) { dx = dx / len * JOY_R; dy = dy / len * JOY_R; }
      touch.x = dx / JOY_R; touch.y = dy / JOY_R;
      ui.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    } else if (t.identifier === touch.lookId && playing && !panelMode) {
      const dx = t.clientX - touch.lx, dy = t.clientY - touch.ly;
      touch.lx = t.clientX; touch.ly = t.clientY;
      const sens = TOUCH_SENS * sensScale;
      yaw -= dx * sens;
      pitch -= dy * sens;
      const lim = THREE.MathUtils.degToRad(CONFIG.PITCH_LIMIT);
      pitch = Math.max(-lim, Math.min(lim, pitch));
    }
  }
}

function onTouchEnd(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === touch.joyId) {
      touch.joyId = null; touch.x = touch.y = 0;
      ui.joy.classList.remove("p3-joy-on");
      ui.joy.style.left = ui.joy.style.top = "";
      ui.joyKnob.style.transform = "";
    } else if (t.identifier === touch.lookId) touch.lookId = null;
  }
}

// 시작 화면을 터치하면 전체 화면 + 가로 고정 시도 (안 되는 폰은 그냥 넘어감)
function goFullscreen() {
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) {
      const p = el.requestFullscreen();
      if (p && p.then) p.then(() => {
        if (screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(() => {});
      }).catch(() => {});
    }
  } catch (err) { /* 지원 안 하는 브라우저 */ }
}

function onKeyUp(e) {
  const k = KEY_MAP[e.code];
  if (k) keys[k] = false;
}

function clearKeys() {
  keys.forward = keys.back = keys.left = keys.right = false;
}

// 탭 전환/창 최소화 시 자동 일시정지
function onVisibilityChange() {
  if (document.hidden && active) releaseLock();   // 폰: 앱 전환 시 일시정지
}

function onWindowBlur() {
  clearKeys();   // 키를 누른 채 다른 창으로 가면 계속 걸어가는 문제 방지
}

// =========================================================
// 10. 이동과 충돌
// =========================================================
// 위치 (x, z)에 반지름 r인 원을 놓았을 때 충돌 상자와 겹치는지
function hitsCollider(x, z) {
  const r = CONFIG.PLAYER_RADIUS;
  for (const box of world.colliders) {
    const cx = Math.max(box.min.x, Math.min(x, box.max.x));
    const cz = Math.max(box.min.z, Math.min(z, box.max.z));
    const dx = x - cx, dz = z - cz;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

function updateMovement(dt) {
  if (panelMode) {               // 성적표·번호키 창을 보는 동안은 멈춤
    camera.rotation.set(pitch, yaw, 0);
    return;
  }
  // 입력 → 이동 방향 (카메라가 보는 방향 기준, 바닥과 평행)
  const f = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0) - touch.y;
  const rgt = (keys.right ? 1 : 0) - (keys.left ? 1 : 0) + touch.x;
  const mag = Math.min(1, Math.hypot(f, rgt));
  const moving = mag > 0.15;                     // 조이스틱을 살짝만 건드린 건 무시

  if (moving) {
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    let mx = -sin * f + cos * rgt;
    let mz = -cos * f - sin * rgt;
    const len = Math.hypot(mx, mz) || 1;          // 대각선이 더 빠르지 않게
    const step = CONFIG.MOVE_SPEED * dt * mag;      // 조이스틱을 덜 밀면 천천히
    mx = (mx / len) * step;
    mz = (mz / len) * step;

    const p = camera.position;
    const stuck = hitsCollider(p.x, p.z);         // 혹시 끼어 있으면 빠져나올 수 있게
    const ox = p.x, oz = p.z;
    // x, z를 따로 검사 → 벽에 비스듬히 부딪히면 벽을 따라 미끄러짐
    if (stuck || !hitsCollider(p.x + mx, p.z)) p.x += mx;
    if (stuck || !hitsCollider(p.x, p.z + mz)) p.z += mz;

    // 안전장치: 어떤 경우에도 방 밖으로 못 나감
    const r = CONFIG.PLAYER_RADIUS;
    p.x = Math.max(-CONFIG.ROOM_W / 2 + r, Math.min(CONFIG.ROOM_W / 2 - r, p.x));
    p.z = Math.max(-CONFIG.ROOM_D / 2 + r, Math.min(CONFIG.ROOM_D / 2 - r, p.z));

    // 발소리
    const moved = Math.hypot(p.x - ox, p.z - oz);
    stepAccum += moved;
    if (stepAccum >= CONFIG.STEP_DISTANCE) {
      stepAccum = 0;
      sound("footstep");
    }
    if (moved > 0.0001) bobPhase += dt * 9;
  }

  // 높이 고정 (바닥 아래로 떨어지지 않음) + 걸을 때 살짝 흔들림
  const bob = CONFIG.HEAD_BOB && moving ? Math.sin(bobPhase) * 0.03 : 0;
  camera.position.y = CONFIG.EYE_HEIGHT + bob;
  camera.rotation.set(pitch, yaw, 0);
}

// =========================================================
// 11. 카메라 위치 초기화
// =========================================================
function resetCamera() {
  yaw = 0;
  pitch = 0;
  stepAccum = 0;
  bobPhase = 0;
  camera.position.set(CONFIG.START_POS.x, CONFIG.EYE_HEIGHT, CONFIG.START_POS.z);
  camera.rotation.set(0, 0, 0);   // 정면 = 북쪽(카메라·관객석·출입문 방향)
}

// 퍼즐과 물건 위치를 처음 상태로
function resetPuzzle() {
  Object.assign(puzzle, { drawerOpen: false, bowlLifted: false, sheetRead: false, unlocked: false,
                          hasKey: false, doorOpen: false, finished: false, input: "",
                          watched: false, hasCert: false, hasPen: false, signed: false, hugged: false,
                          hasSpoon: false, pried: false, quizSeen: false });
  if (puzzle.lightsOff) setLights(true, true);
  puzzle.lightsOff = false;
  creepCount = 0;
  if (world.drawer && world.drawer.userData.front) world.drawer.userData.front.rotation.set(0, 0, 0);
  world.myDrawers.forEach((d) => { d.position.z = d.userData.closedZ; d.userData.out = false; d.userData.seen = false; d.userData.goal = null; });
  if (world.spoon) world.spoon.visible = true;
  signAnim = null;
  if (world.cert) world.cert.visible = true;
  if (world.pen) world.pen.visible = true;
  if (world.tape) { world.tape.visible = false; world.tape.position.x = 0.2; world.tape.userData.goal = null; }
  world.profLenses.forEach((l) => l.material.color.setHex(0xeef2ff));
  if (ui.whiteout) { ui.whiteout.classList.remove("p3-on"); ui.whiteout.hidden = true; }
  closePanel();
  if (world.drawer) { world.drawer.position.z = world.drawer.userData.closedZ; world.drawer.userData.goal = null; world.drawer.userData.out = false; }
  if (world.bowl) { world.bowl.position.set(0.4, world.bowl.userData.downY, 0); world.bowl.userData.goal = null; world.bowl.userData.up = false; }
  if (world.doorPivot) { world.doorPivot.rotation.y = 0; world.doorPivot.userData.goal = null; }
  if (world.doorCollider && !world.colliders.includes(world.doorCollider)) world.colliders.push(world.doorCollider);
  if (world.key) { world.key.visible = false; unregisterInteract(world.key); }
  world.animated.length = 0;
  lookTarget = null;
  clearTimeout(toastTimer);
  if (ui.toast) ui.toast.hidden = true;
  updateHUD();
}

// =========================================================
// 12. 창 크기 변경 / 애니메이션 루프
// =========================================================
function onResize() {
  if (!renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

let elapsed = 0;
function loop() {
  rafId = requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.1);  // 탭 전환 후 큰 값 방지

  updateAnimations(dt);            // 야채칸·그릇·문 움직임 (일시정지 중에도 마저 진행)
  updateTheme(dt);                 // 디자인 테마 (시간에 따라 무너지는 효과, 화면 잡음)
  if (playing) {
    elapsed += dt;
    updateMovement(dt);
    updateFlicker(dt);
    updateLookTarget();
    if (panelMode !== "cutscene") updateProfessor(dt);   // 영상 보는 동안은 교수도 멈춤
    checkExit();
  } else if (CONFIG.DEBUG_AUTO_PAN) {
    elapsed += dt;
    camera.rotation.y = Math.sin(elapsed * 0.35) * 1.2;
  }

  renderer.render(scene, camera);
}

// =========================================================
// 12-2. 디자인 테마 (3D 시안) — 주소 끝 ?theme=1 / 2 / 3
//   1: 파스텔 방송 세트 + 어둠   (2D 밝은 방송과 같은 색, 갈색 외곽선, 조명만 어둡게)
//   2: 방송 사고               (2D 호러 화면과 같은 검정·검붉은 색, 짙은 화면 효과)
//   3: 점점 무너지는 방송       (1에서 시작해 대결 시간이 줄수록 2로 변함, 추격 때 완전히 2)
//   없음: 3 (기본으로 확정) · 0: 기존 모습(비교용)
// =========================================================
const THEME = (() => {
  const q = new URLSearchParams(location.search).get("theme");
  if (q === null) return 3;
  const t = Number(q);
  return [1, 2, 3].includes(t) ? t : 0;
})();
// 테마 3 시작 무너짐 정도: 2D에서 이미 방송 사고가 났으니 0이 아니라 이만큼 무너진 채로 시작
const THEME3_K_START = 0.5;

// 원래 색(hex) → 역할 이름. 역할마다 1(파스텔)·2(방송 사고) 색을 정함
const COLOR_ROLE = {
  0x2b2f2a: "trim", 0x1c1c1c: "ceiling",
  0x3a3a3a: "station", 0x1b1a1a: "stationFront", 0x6a6a6a: "stationFront", 0x9a9a92: "top",
  0x111111: "ink", 0x777777: "pot", 0x8a6a44: "board",
  0xb8bcb4: "fridge", 0x9fa69a: "fridgeTrim", 0x333333: "ink", 0x555555: "ink",
  0x4a3424: "table", 0xd8d4c8: "plate", 0xcfc8b8: "plate",
  0x5a3a24: "door", 0x2a2018: "ink", 0x3b2a2a: "bench", 0x1a1a1a: "ink",
  0x2a2a2a: "ink", 0x151515: "ink", 0x222222: "ink", 0x4a4a4a: "drawer",
};
const PAL = {
  // 1: 파스텔 방송 세트 (docs/10 밝은 방송 색)
  1: { wallA: 0xfff4dc, wallB: 0xffe3ec, trim: 0xff8fab, ceiling: 0x3b2a2a,
       floorA: "#e9c89a", floorB: "#c9a070",
       station: 0xff8fab, stationFront: 0xff6f91, top: 0xfffaf0, ink: 0x2b2024, pot: 0xbfefff, board: 0xe9c89a,
       fridge: 0xbfefff, fridgeTrim: 0xfffaf0, table: 0xc98b5a, plate: 0xfffaf0, door: 0xffd84d,
       bench: 0xff8fab, drawer: 0xa8e6cf, outline: 0x2b2024,
       bg: 0x1a1214, fogNear: 6, fogFar: 18,
       amb: 0xffe3ec, ambI: 0.5, hemiSky: 0xfff4dc, hemiGround: 0x3b2a2a, hemiI: 0.4, spot: 0xffe2b0, spotI: 46, fx: 0.25 },
  // 2: 방송 사고 (docs/10 호러 색)
  2: { wallA: 0x1c1719, wallB: 0x121012, trim: 0x8b1e2b, ceiling: 0x0a0809,
       floorA: "#2a1f1a", floorB: "#140e0b",
       station: 0x3a1418, stationFront: 0x8b1e2b, top: 0x2a2426, ink: 0x000000, pot: 0x3a4448, board: 0x3a2a20,
       fridge: 0x2a3a40, fridgeTrim: 0x211d1f, table: 0x3a2418, plate: 0x6a625a, door: 0x5a1620,
       bench: 0x5a1620, drawer: 0x211d1f, outline: 0x000000,
       bg: 0x050304, fogNear: 3.5, fogFar: 12,
       amb: 0x5a2a30, ambI: 0.28, hemiSky: 0x6a3a40, hemiGround: 0x000000, hemiI: 0.22, spot: 0xffb0a0, spotI: 32, fx: 0.85 },
};

const themeState = {
  k: -1,               // 0 = 파스텔, 1 = 방송 사고 (테마 3은 그 사이를 움직임)
  mats: [],            // { m: 재질, c1: 색, c2: 색 }
  walls: [],           // { ctx, tex } 체크무늬 벽 캔버스
  floor: null,         // { ctx, tex }
  timer: 0,
  fxEl: null, noiseCtx: null, noiseTimer: 0, rgbTimer: 4, rgbOn: 0,
};

// 체크무늬 벽 텍스처 (픽셀 느낌, 테마 3에서 색이 바뀌므로 캔버스를 기억)
function makeThemeCanvasTex(repeatX, repeatY) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 16;
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return { ctx: cv.getContext("2d"), tex };
}

function lerpHex(a, b, k) {
  const c = new THREE.Color(a);
  return c.lerp(new THREE.Color(b), k);
}

function paintWall(w, k) {
  const A = "#" + lerpHex(PAL[1].wallA, PAL[2].wallA, k).getHexString();
  const B = "#" + lerpHex(PAL[1].wallB, PAL[2].wallB, k).getHexString();
  const g = w.ctx;
  g.fillStyle = A; g.fillRect(0, 0, 16, 16);
  g.fillStyle = B; g.fillRect(0, 0, 8, 8); g.fillRect(8, 8, 8, 8);
  w.tex.needsUpdate = true;
}

function paintFloor(f, k) {
  const A = "#" + lerpHex(new THREE.Color(PAL[1].floorA).getHex(), new THREE.Color(PAL[2].floorA).getHex(), k).getHexString();
  const B = "#" + lerpHex(new THREE.Color(PAL[1].floorB).getHex(), new THREE.Color(PAL[2].floorB).getHex(), k).getHexString();
  const g = f.ctx;
  g.fillStyle = A; g.fillRect(0, 0, 16, 16);                 // 나무 판자
  g.fillStyle = B;
  g.fillRect(0, 7, 16, 1); g.fillRect(0, 15, 16, 1);         // 판자 줄
  g.fillRect(5, 0, 1, 7); g.fillRect(12, 8, 1, 7);           // 이음새
  f.tex.needsUpdate = true;
}

// 굵은 외곽선 (메시를 조금 크게 복제해서 뒷면만 진하게 칠하는 방법)
const OUTLINE_T = 0.012;
let outlineMat = null;
function addOutline(mesh) {
  const geo = mesh.geometry;
  const p = geo && geo.parameters;
  if (!p) return;
  let sx, sy, sz;
  if (geo.type === "BoxGeometry") {
    if (Math.min(p.width, p.height, p.depth) < 0.025) return;      // 너무 얇은 부품은 생략
    sx = (p.width + OUTLINE_T * 2) / p.width;
    sy = (p.height + OUTLINE_T * 2) / p.height;
    sz = (p.depth + OUTLINE_T * 2) / p.depth;
  } else if (geo.type === "CylinderGeometry") {
    const r = Math.max(p.radiusTop, p.radiusBottom);
    if (r < 0.03) return;
    sx = sz = (r + OUTLINE_T) / r;
    sy = (p.height + OUTLINE_T * 2) / p.height;
  } else return;
  const o = new THREE.Mesh(geo, outlineMat);
  o.scale.set(sx, sy, sz);
  o.castShadow = false;
  o.receiveShadow = false;
  o.userData.isOutline = true;
  mesh.add(o);
}

// 3단 명암 (만화처럼 끊어지는 그림자) — 2D 픽셀 그림과 어울리게
function makeToonGradient() {
  const tex = new THREE.DataTexture(new Uint8Array([70, 150, 255]), 3, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

// =========================================================
// 12-3. 물체 디테일 (C안: 살아있는 세트) — 테마가 켜졌을 때만
//   1단계(항상): 레트로 소품 + 낡은 방송국 (타일, 녹, 테이프, 메모, 낙서, 금, 케이블…)
//   2단계(무너짐 70%↑): 냉장고 틈 빨간 빛, 벽 손자국, 흐르는 자국, 관객석 실루엣
//   3단계(무너짐 90%↑): 카메라 렌즈가 눈동자(나를 따라봄), 빈 타일 구멍 속 눈
//   ※ 충돌 상자는 이미 만들어진 뒤라 디테일은 길을 막지 않음
// =========================================================
const detail = { tier2: [], tier3: [], hideAt3: [], eye: null, holeEyes: [], blink: 0 };

function makeDecalTex(w, h, draw) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const g = cv.getContext("2d");
  draw(g, w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

// 얇은 그림 판(스티커) 붙이기. ry = 바라보는 방향(기본 +z)
function addDecal(parent, w, h, x, y, z, tex, opts = {}) {
  const m = opts.glow
    ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    : new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, flatShading: false, roughness: 0.9, metalness: 0 });
  const d = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  d.position.set(x, y, z);
  d.rotation.set(opts.rx || 0, opts.ry || 0, opts.rz || 0);
  d.castShadow = false;
  d.receiveShadow = false;
  parent.add(d);
  return d;
}

// 고정 시드 난수 (매번 같은 모양)
function seeded(seed) {
  let t = seed;
  return () => { t = (t * 9301 + 49297) % 233280; return t / 233280; };
}

const TEX = {
  rust: () => makeDecalTex(64, 64, (g) => {
    const r = seeded(7);
    for (let i = 0; i < 14; i++) {
      g.fillStyle = `rgba(${120 + r() * 40},${60 + r() * 20},${20 + r() * 10},${0.35 + r() * 0.4})`;
      g.beginPath(); g.arc(32 + (r() - 0.5) * 34, 32 + (r() - 0.5) * 34, 4 + r() * 10, 0, Math.PI * 2); g.fill();
    }
  }),
  memo: () => makeDecalTex(64, 64, (g) => {
    g.fillStyle = "#ffd84d"; g.fillRect(2, 2, 60, 60);
    g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(2, 2, 60, 8);
    g.strokeStyle = "#3b2a2a"; g.lineWidth = 3;
    g.beginPath(); g.moveTo(10, 24); g.lineTo(50, 22); g.moveTo(10, 36); g.lineTo(44, 38); g.moveTo(10, 48); g.lineTo(30, 47); g.stroke();
  }),
  tape: () => makeDecalTex(64, 16, (g) => {
    g.fillStyle = "rgba(232,220,200,.92)"; g.fillRect(0, 2, 64, 12);
    g.fillStyle = "rgba(0,0,0,.08)"; for (let x = 0; x < 64; x += 6) g.fillRect(x, 2, 2, 12);
    g.clearRect(0, 2, 3, 4); g.clearRect(61, 10, 3, 4);
  }),
  label: (text, bg, fg) => makeDecalTex(96, 32, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, 96, 32);
    g.strokeStyle = "#2b2024"; g.lineWidth = 4; g.strokeRect(2, 2, 92, 28);
    g.fillStyle = fg; g.font = "bold 18px 'Galmuri11', monospace"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(text, 48, 17);
  }),
  graffitiF: () => makeDecalTex(64, 64, (g) => {
    g.strokeStyle = "rgba(150,14,28,.9)"; g.lineWidth = 9; g.lineCap = "round";
    g.beginPath(); g.moveTo(20, 56); g.lineTo(22, 10); g.lineTo(50, 8); g.moveTo(21, 32); g.lineTo(42, 31); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.moveTo(21, 56); g.lineTo(21, 63); g.moveTo(49, 9); g.lineTo(50, 18); g.stroke();
  }),
  crack: (seed = 3, color = "rgba(30,20,24,.85)") => makeDecalTex(64, 64, (g) => {
    const r = seeded(seed);
    g.strokeStyle = color; g.lineWidth = 2;
    for (let k = 0; k < 4; k++) {
      let x = 32, y = 32; g.beginPath(); g.moveTo(x, y);
      const a = r() * Math.PI * 2;
      for (let i = 0; i < 5; i++) { x += Math.cos(a + (r() - 0.5)) * 7; y += Math.sin(a + (r() - 0.5)) * 7; g.lineTo(x, y); }
      g.stroke();
    }
  }),
  scratch: () => makeDecalTex(64, 64, (g) => {
    g.strokeStyle = "rgba(240,225,200,.55)"; g.lineWidth = 2;
    [[12, 10], [20, 8], [28, 12], [36, 9]].forEach(([x, y]) => { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 8, y + 46); g.stroke(); });
  }),
  stain: (rgba = "rgba(60,20,16,.55)") => makeDecalTex(64, 64, (g) => {
    const r = seeded(11);
    g.fillStyle = rgba;
    for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(32 + (r() - 0.5) * 26, 32 + (r() - 0.5) * 20, 6 + r() * 12, 4 + r() * 8, r() * 3, 0, Math.PI * 2); g.fill(); }
  }),
  hand: () => makeDecalTex(64, 64, (g) => {
    g.fillStyle = "rgba(122,16,32,.8)";
    g.beginPath(); g.ellipse(32, 42, 13, 15, 0, 0, Math.PI * 2); g.fill();
    [[-14, 30, -0.6], [-7, 18, -0.15], [0, 15, 0], [7, 18, 0.15], [13, 24, 0.35]].forEach(([dx, dy, a]) => {
      g.save(); g.translate(32 + dx, 42 - dy); g.rotate(a); g.fillRect(-3, -14, 6, 16); g.restore();
    });
    g.fillRect(28, 56, 3, 8); g.fillRect(36, 55, 2, 9);
  }),
  drips: () => makeDecalTex(64, 64, (g) => {
    const r = seeded(5);
    g.fillStyle = "rgba(150,14,28,.88)"; g.fillRect(0, 0, 64, 5);
    for (let i = 0; i < 6; i++) {
      const x = 4 + i * 10 + r() * 4, len = 12 + r() * 44;
      g.fillRect(x, 0, 4, len);
      g.beginPath(); g.arc(x + 2, len, 3.5, 0, Math.PI * 2); g.fill();
    }
  }),
  slit: () => makeDecalTex(64, 8, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 8);
    grd.addColorStop(0, "rgba(255,42,60,0)"); grd.addColorStop(0.5, "rgba(255,42,60,1)"); grd.addColorStop(1, "rgba(255,42,60,0)");
    g.fillStyle = grd; g.fillRect(0, 0, 64, 8);
  }),
  person: (seed) => makeDecalTex(48, 96, (g) => {
    const r = seeded(seed);
    g.fillStyle = "rgba(10,6,8,.92)";
    g.beginPath(); g.arc(24, 18, 11 + r() * 2, 0, Math.PI * 2); g.fill();          // 머리
    g.beginPath(); g.moveTo(6, 96); g.lineTo(9, 42); g.quadraticCurveTo(24, 30, 39, 42); g.lineTo(42, 96); g.fill();  // 몸
    g.fillStyle = "rgba(255,42,60,.9)"; g.fillRect(18, 16, 3, 2); g.fillRect(27, 16, 3, 2);   // 눈
  }),
  stationTile: () => {
    const t = makeDecalTex(32, 32, (g) => {
      g.fillStyle = "#ffffff"; g.fillRect(0, 0, 32, 32);
      g.fillStyle = "#b9b0b0"; g.fillRect(0, 0, 32, 2); g.fillRect(0, 0, 2, 32);
      g.fillStyle = "rgba(255,255,255,.6)"; g.fillRect(4, 4, 6, 2);
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  },
};

function tierPush(tier, obj) { (tier === 2 ? detail.tier2 : detail.tier3).push(obj); obj.visible = false; return obj; }

function buildDetails() {
  const W = CONFIG.ROOM_W, D = CONFIG.ROOM_D;

  // ---------- 조리대 2개: 타일 앞판, 상판 손잡이 봉, 기울어진 이름표 ----------
  [world.profStation, world.myStation].forEach((st, i) => {
    if (!st) return;
    const front = st.userData.front;
    if (front && front.material) {
      const t = TEX.stationTile();
      t.repeat.set(9.5, 3);
      front.material.map = t;
      front.material.needsUpdate = true;
    }
    const steel = mat(0xc8ccc4, { metalness: 0.5, roughness: 0.4 });
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.7, 8), steel);   // 앞쪽 수건걸이 봉
    rail.rotation.z = Math.PI / 2;
    rail.position.set(0, 0.74, -0.45);
    st.add(rail);
    if (st.userData.sign) st.userData.sign.rotation.z = i === 0 ? -0.05 : 0.13;            // 이름표가 비뚤어짐
  });
  const mine = world.myStation;
  if (mine) {
    // 앞판(카메라 쪽, -z)에 낙서 F, 빠진 타일, 금
    const fz = -0.425, ry = Math.PI;
    addDecal(mine, 0.32, 0.32, -0.55, 0.45, fz, TEX.graffitiF(), { ry, rz: 0.12 });
    addDecal(mine, 0.3, 0.3, 0.2, 0.55, fz, TEX.crack(9), { ry });
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshBasicMaterial({ color: 0x0a0607 }));
    hole.position.set(0.55, 0.36, fz);
    hole.rotation.y = ry;
    mine.add(hole);
    // 3단계: 빈 타일 구멍 속 빨간 눈 두 개
    [-0.045, 0.045].forEach((dx) => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2a3c }));
      e.position.set(0.55 + dx, 0.37, fz - 0.004);
      mine.add(e);
      detail.holeEyes.push(tierPush(3, e));
    });
    // 2단계: 상판에서 흘러내리는 자국
    tierPush(2, addDecal(mine, 0.5, 0.42, 0.05, 0.63, fz - 0.002, TEX.drips(), { ry }));
  }
  if (world.profStation) {
    tierPush(2, addDecal(world.profStation, 0.4, 0.36, -0.4, 0.66, -0.427, TEX.drips(), { ry: Math.PI }));
  }

  // ---------- 냉장고: 크롬 경첩·윗 그릴, VEGE 라벨, 녹, 메모, 테이프 / 2단계 틈 빛 ----------
  const fr = world.fridge;
  if (fr) {
    const chrome = mat(0xe8e8e8, { metalness: 0.6, roughness: 0.3 });
    [1.85, 1.15, 0.6].forEach((y) => addBox(fr, 0.05, 0.1, 0.05, -0.43, y, 0.41, chrome));   // 경첩
    addBox(fr, 0.6, 0.08, 0.03, 0, 1.88, 0.41, mat(0x555555));                             // 윗 통풍 그릴
    if (world.drawer) {
      addDecal(world.drawer, 0.22, 0.07, -0.22, 0.25, 0.022, TEX.label("VEGE", "#a8e6cf", "#2b2024"));
      addDecal(world.drawer, 0.5, 0.11, 0.1, 0.36, 0.023, TEX.tape(), { rz: 0.08 });
    }
    addDecal(fr, 0.26, 0.26, -0.22, 0.85, 0.402, TEX.rust());
    addDecal(fr, 0.18, 0.18, 0.15, 1.72, 0.402, TEX.rust());
    addDecal(fr, 0.18, 0.18, -0.12, 1.62, 0.404, TEX.memo(), { rz: -0.17 });
    addDecal(fr, 0.2, 0.2, 0.1, 1.15, 0.403, TEX.crack(4), {});
    // 2단계: 냉동실 문틈 · 야채칸 위 틈에서 새는 빨간 빛
    tierPush(2, addDecal(fr, 0.86, 0.04, 0, 1.35, 0.425, TEX.slit(), { glow: true }));
    tierPush(2, addDecal(fr, 0.8, 0.04, 0, 0.545, 0.405, TEX.slit(), { glow: true }));
    const leak = new THREE.PointLight(0xff2a3c, 0.0, 2.2);
    leak.position.set(0, 1.0, 0.7);
    fr.add(leak);
    detail.leak = leak;
  }

  // ---------- 방송 카메라: 테이프, 금 간 렌즈, 바닥 케이블 / 3단계 눈동자 렌즈 ----------
  const cam = world.tvCamera;
  if (cam) {
    addDecal(cam, 0.3, 0.07, 0.176, 1.42, 0, TEX.tape(), { ry: Math.PI / 2, rz: 0.2 });
    const crack = addDecal(cam, 0.2, 0.2, 0, 1.38, 0.548, TEX.crack(2, "rgba(235,235,235,.85)"), {});
    detail.hideAt3.push(crack);
    // 3단계: 렌즈가 눈동자로
    const eye = new THREE.Group();
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshBasicMaterial({ color: 0xece3de }));
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 6), new THREE.MeshBasicMaterial({ color: 0x8b1e2b }));
    iris.position.z = 0.055;
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    pupil.position.z = 0.09;
    eye.add(white, iris, pupil);
    eye.position.set(0, 1.38, 0.56);
    cam.add(eye);
    detail.eye = tierPush(3, eye);
  }
  // 케이블 (카메라 → 내 조리대 방향으로 바닥에 늘어짐)
  const cable = mat(0x151515);
  [[0.3, -2.1, 0.6, 0.3], [0.55, -1.55, 0.6, -0.4], [0.9, -1.05, 0.55, 0.2], [1.1, -0.5, 0.6, -0.15]].forEach(([x, z, len, a]) => {
    const c = addBox(scene, 0.03, 0.02, len, x, 0.01, z, cable, { cast: false });
    c.rotation.y = a;
  });

  // ---------- 식탁: 얼룩 / 출입문: 긁힌 자국 ----------
  if (world.table) addDecal(world.table, 0.4, 0.4, 0.05, 0.782, 0.1, TEX.stain("rgba(120,20,18,.45)"), { rx: -Math.PI / 2 });
  if (world.doorPivot) {
    addDecal(world.doorPivot, 0.45, 0.6, 0.5, 0.7, 0.032, TEX.scratch(), {});
    addDecal(world.doorPivot, 0.3, 0.3, 0.3, 1.6, 0.032, TEX.crack(6), {});
  }

  // ---------- 벽·바닥: 금, 얼룩 / 2단계 손자국, 끌린 자국 ----------
  addDecal(scene, 0.6, 0.6, -2.6, 1.9, -D / 2 + 0.025, TEX.crack(8), {});
  addDecal(scene, 0.5, 0.5, W / 2 - 0.025, 1.5, 0.8, TEX.crack(12), { ry: -Math.PI / 2 });
  addDecal(scene, 0.9, 0.9, 0.6, 0.006, 0.4, TEX.stain(), { rx: -Math.PI / 2 });
  [[CONFIG.DOOR_X - 0.75, 1.3, -0.2], [CONFIG.DOOR_X - 0.95, 1.0, 0.25], [CONFIG.DOOR_X + 0.7, 1.15, 0.1]].forEach(([x, y, rz]) => {
    tierPush(2, addDecal(scene, 0.22, 0.22, x, y, -D / 2 + 0.026, TEX.hand(), { rz }));
  });
  [[-W / 2 + 0.026, 1.45, 1.4], [-W / 2 + 0.026, 1.2, 1.75]].forEach(([x, y, z]) => {
    tierPush(2, addDecal(scene, 0.22, 0.22, x, y, z, TEX.hand(), { ry: Math.PI / 2 }));
  });
  tierPush(2, addDecal(scene, 0.4, 1.6, 2.1, 0.007, -2.6, TEX.stain("rgba(110,14,24,.5)"), { rx: -Math.PI / 2, rz: 0.15 }));

  // ---------- 관객석: 2단계 사람 실루엣 판넬 ----------
  [[-2.6, -3.55, 1], [-0.4, -3.55, 2], [-1.6, -4.35, 3], [0.1, -4.35, 4]].forEach(([x, z, seed]) => {
    tierPush(2, addDecal(scene, 0.42, 0.84, x, 0.49 + 0.42, z, TEX.person(seed), {}));
  });
}

function updateDetailTiers(k) {
  const t2 = k >= 0.7, t3 = k >= 0.9;
  detail.tier2.forEach((o) => { o.visible = t2; });
  detail.tier3.forEach((o) => { o.visible = t3; });
  detail.hideAt3.forEach((o) => { o.visible = !t3; });
  if (detail.leak) detail.leak.intensity = t2 ? 0.6 * CONFIG.LIGHT_SCALE : 0;
}

function updateDetails(dt) {
  if (detail.eye && detail.eye.visible) detail.eye.lookAt(camera.position);   // 카메라 눈이 나를 따라봄
  if (detail.holeEyes.length && detail.holeEyes[0].parent) {
    detail.blink -= dt;
    if (detail.blink <= 0) detail.blink = 2.5 + Math.random() * 3;
    const shut = detail.blink < 0.12;
    const t3 = themeState.k >= 0.9;
    detail.holeEyes.forEach((e) => { e.visible = t3 && !shut; });
  }
  if (detail.leak && detail.leak.intensity > 0) {
    detail.leak.intensity = (0.45 + Math.random() * 0.3) * CONFIG.LIGHT_SCALE;   // 틈 빛이 살짝 일렁임
  }
}

function applyTheme() {
  if (!THEME) return;
  buildDetails();                 // 물체 디테일 (C안) — 재질 바꾸기 전에 붙여야 같이 만화 재질이 됨
  const k0 = THEME === 2 ? 1 : THEME === 3 ? THEME3_K_START : 0;
  outlineMat = new THREE.MeshBasicMaterial({ color: PAL[1].outline, side: THREE.BackSide });
  themeState.outlineC1 = new THREE.Color(PAL[1].outline);
  themeState.outlineC2 = new THREE.Color(PAL[2].outline);
  const gradient = makeToonGradient();
  const skip = new Set();
  // 교수·잔상은 투명도 연출이 있어서 그대로 둠
  if (world.professor) world.professor.traverse((o) => skip.add(o));
  world.ghosts.forEach((gh) => gh.traverse((o) => skip.add(o)));

  const outlineGroups = ["냉장고", "교수 조리대", "내 조리대", "식탁", "방송 카메라", "관객석 1열", "관객석 2열", "성적표", "출입문"];
  const meshes = [];
  scene.traverse((o) => { if (o.isMesh && !skip.has(o)) meshes.push(o); });

  for (const m of meshes) {
    const mt = m.material;
    if (!mt || !mt.isMeshStandardMaterial) continue;
    const hex = mt.color.getHex();
    let c1 = null, c2 = null, map = mt.map || null;

    if (hex === 0x4a4f45 && m.geometry && m.geometry.type === "BoxGeometry") {     // 벽 → 체크무늬
      const pr = m.geometry.parameters;
      const w = makeThemeCanvasTex(Math.max(pr.width, pr.depth) / 0.5, pr.height / 0.5);
      themeState.walls.push(w);
      map = w.tex;
      c1 = c2 = new THREE.Color(0xffffff);
    } else if (m.name === "바닥") {                                                // 바닥 → 나무 판자
      const f = makeThemeCanvasTex(CONFIG.ROOM_W / 0.8, CONFIG.ROOM_D / 0.8);
      themeState.floor = f;
      map = f.tex;
      c1 = c2 = new THREE.Color(0xffffff);
    } else if (COLOR_ROLE[hex]) {
      const role = COLOR_ROLE[hex];
      c1 = new THREE.Color(PAL[1][role]);
      c2 = new THREE.Color(PAL[2][role]);
    }

    // 만화 재질로 바꿈 (색·무늬·투명도 유지)
    const params = { color: mt.color.clone(), gradientMap: gradient, transparent: !!mt.transparent, opacity: mt.opacity ?? 1 };
    if (mt.side !== undefined) params.side = mt.side;
    if (map) params.map = map;
    if (mt.emissive) { params.emissive = mt.emissive.clone(); params.emissiveIntensity = mt.emissiveIntensity ?? 1; }
    const toon = new THREE.MeshToonMaterial(params);
    m.material = toon;
    if (c1) themeState.mats.push({ m: toon, c1, c2 });
  }

  // 외곽선
  scene.traverse((o) => {
    if (!outlineGroups.includes(o.name)) return;
    o.traverse((c) => { if (c.isMesh && c.visible && !c.userData.isOutline && !skip.has(c)) addOutline(c); });
  });

  buildOnAirSign();
  buildFX();
  setThemeK(k0, true);
  console.log(`[Phase3] 디자인 테마 ${THEME} 적용 (색 바꾼 재질 ${themeState.mats.length}개)`);
}

// ON AIR 사인 (현수막 위, 빨갛게 깜빡임)
function buildOnAirSign() {
  const cv = document.createElement("canvas");
  cv.width = 128; cv.height = 40;
  const g = cv.getContext("2d");
  g.fillStyle = "#e84a5f"; g.fillRect(0, 0, 128, 40);
  g.strokeStyle = "#2b2024"; g.lineWidth = 6; g.strokeRect(3, 3, 122, 34);
  g.fillStyle = "#fff"; g.font = "bold 22px 'Galmuri11', monospace"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("● ON AIR", 64, 21);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.28),
    new THREE.MeshBasicMaterial({ map: tex, fog: false }));
  sign.position.set(-1.4, 2.78, -CONFIG.ROOM_D / 2 + 0.03);
  scene.add(sign);
  world.onAir = sign;
}

// 화면 효과: 주사선 + 잡음 + 가장자리 어둡게 (2D 호러와 같은 느낌)
function buildFX() {
  const fx = document.createElement("div");
  fx.className = "p3-fx";
  fx.innerHTML = `<canvas class="p3-fx-noise" width="96" height="54"></canvas><div class="p3-fx-scan"></div><div class="p3-fx-vig"></div>`;
  root.insertBefore(fx, ui.crosshair);           // 3D 화면 위, UI 아래
  themeState.fxEl = fx;
  themeState.noiseCtx = fx.querySelector("canvas").getContext("2d");
}

// k (0 = 파스텔 ~ 1 = 방송 사고)에 맞춰 색·조명·안개·효과를 바꿈
function setThemeK(k, force = false) {
  if (!force && Math.abs(k - themeState.k) < 0.01) return;
  themeState.k = k;
  for (const it of themeState.mats) it.m.color.lerpColors(it.c1, it.c2, k);
  themeState.walls.forEach((w) => paintWall(w, k));
  if (themeState.floor) paintFloor(themeState.floor, k);
  if (outlineMat) outlineMat.color.lerpColors(themeState.outlineC1, themeState.outlineC2, k);
  const P1 = PAL[1], P2 = PAL[2];
  const S = CONFIG.LIGHT_SCALE;
  const mix = (a, b) => a + (b - a) * k;
  scene.background.copy(lerpHex(P1.bg, P2.bg, k));
  scene.fog.color.copy(lerpHex(P1.bg, P2.bg, k));
  scene.fog.near = mix(P1.fogNear, P2.fogNear);
  scene.fog.far = mix(P1.fogFar, P2.fogFar);
  world.ambient.color.copy(lerpHex(P1.amb, P2.amb, k));
  world.ambient.userData.base = mix(P1.ambI, P2.ambI) * S;
  world.hemi.color.copy(lerpHex(P1.hemiSky, P2.hemiSky, k));
  world.hemi.groundColor.copy(lerpHex(P1.hemiGround, P2.hemiGround, k));
  world.hemi.userData.base = mix(P1.hemiI, P2.hemiI) * S;
  const L = world.ceilingLight;
  L.color.copy(lerpHex(P1.spot, P2.spot, k));
  L.userData.baseIntensity = mix(P1.spotI, P2.spotI) * S;
  if (!puzzle.lightsOff) {
    world.ambient.intensity = world.ambient.userData.base;
    world.hemi.intensity = world.hemi.userData.base;
  } else {
    world.ambient.intensity = world.ambient.userData.base * 0.11;
    world.hemi.intensity = world.hemi.userData.base * 0.09;
  }
  if (themeState.fxEl) themeState.fxEl.style.setProperty("--fx", mix(P1.fx, P2.fx).toFixed(2));
  updateDetailTiers(k);
}

function updateTheme(dt) {
  if (!THEME) return;
  // 테마 3: 대결 시간이 줄수록 무너짐 (10:00 → 0:00), 추격이 시작되면 완전히 방송 사고
  themeState.timer -= dt;
  if (THEME === 3 && themeState.timer <= 0) {
    themeState.timer = 0.5;
    const T = window.FCredit.Timer;
    let k = THEME3_K_START;
    if (T && typeof T.getRemaining === "function") {
      const p = 1 - Math.min(1, Math.max(0, T.getRemaining() / 600));
      k = THEME3_K_START + (1 - THEME3_K_START) * Math.pow(p, 0.6);   // 0.5 → 1, 초반에 더 빨리 무너짐
    }
    if (prof.state !== "WAIT") k = 1;
    setThemeK(Math.round(k * 50) / 50);
  }
  updateDetails(dt);
  // ON AIR 깜빡임
  if (world.onAir) world.onAir.visible = (performance.now() % 1600) < 1100;
  // 잡음 캔버스
  const fxLevel = themeState.k < 0 ? 0 : (PAL[1].fx + (PAL[2].fx - PAL[1].fx) * themeState.k);
  themeState.noiseTimer -= dt;
  if (themeState.noiseCtx && themeState.noiseTimer <= 0) {
    themeState.noiseTimer = 0.09;
    const g = themeState.noiseCtx;
    const img = g.createImageData(96, 54);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() < 0.5 ? 0 : 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = Math.random() < 0.2 ? 160 : 0;
    }
    g.putImageData(img, 0, 0);
  }
  // 가끔 RGB 분리 (방송 사고가 심할수록 자주)
  if (playing) {
    themeState.rgbTimer -= dt;
    if (themeState.rgbOn > 0) {
      themeState.rgbOn -= dt;
      if (themeState.rgbOn <= 0) renderer.domElement.classList.remove("p3-rgb");
    } else if (themeState.rgbTimer <= 0) {
      themeState.rgbTimer = 2 + Math.random() * (12 - fxLevel * 9);
      if (Math.random() < fxLevel * 0.6) {
        renderer.domElement.classList.add("p3-rgb");
        themeState.rgbOn = 0.12 + Math.random() * 0.12;
      }
    }
  }
}

// =========================================================
// 13. 공개 인터페이스 (팀 약속 — 이름 변경 금지)
// =========================================================
window.FCredit.Phase3 = {
  // 3D 세계 생성 (여러 번 불러도 한 번만)
  init() {
    if (initialized) return;
    initialized = true;

    root = document.getElementById("phase3-root");

    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // 저사양 PC 배려
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = CONFIG.SHADOWS;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    root.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050506);
    scene.fog = new THREE.Fog(0x050506, 5, 16);   // 멀수록 어둠 속으로

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 50);
    camera.rotation.order = "YXZ";   // 1인칭 시점 회전 순서 (좌우 먼저, 그다음 위아래)
    resetCamera();

    clock = new THREE.Clock(false);
    raycaster = new THREE.Raycaster();
    raycaster.far = CONFIG.INTERACT_DIST;

    buildRoom();
    buildFridge();
    buildCookingStations();
    buildTable();
    buildTVCamera();
    buildAudienceSeats();
    buildBanner();
    buildDoor();
    buildGradeSheetStand();
    buildLightSwitchAndQuiz();
    buildProfessor();
    buildLights();
    buildUI();
    applyTheme();                    // 디자인 테마 적용 (?theme=1/2/3, 없으면 기존 모습)

    // 이벤트 리스너는 여기서 '한 번만' 등록 (중복 등록 방지)
    window.addEventListener("resize", onResize);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    document.addEventListener("pointerlockerror", onPointerLockError);
    document.addEventListener("mousemove", onMouseMove);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("contestTimeUp", onContestTimeUp);

    // 개발 확인용: Console에서 FCredit.Phase3._debug 로 내부 확인 가능
    this._debug = {
      THREE, scene, camera, world, CONFIG, keys, puzzle,
      IS_TOUCH, touch,
      getState: () => ({ active, playing, panelMode, yaw, pitch, look: lookTarget && lookTarget.name, prof: prof.state }),
      theme: () => ({ THEME, k: themeState.k, t2: detail.tier2.filter(o => o.visible).length, t3: detail.tier3.filter(o => o.visible).length, eye: !!(detail.eye && detail.eye.visible), mats: themeState.mats.length, walls: themeState.walls.length, floor: !!themeState.floor }),
      prof,
      // 테스트용 순간이동: FCredit.Phase3._debug.teleport(x, z, 좌우각도(도), 위아래각도(도))
      teleport: (x, z, yawDeg = 0, pitchDeg = 0) => {
        camera.position.x = x; camera.position.z = z;
        yaw = THREE.MathUtils.degToRad(yawDeg); pitch = THREE.MathUtils.degToRad(pitchDeg);
      },
    };

    console.log(`[Phase3] init 완료 (Three.js r${THREE.REVISION}) — 충돌 상자 ${world.colliders.length}개, 조사 대상 ${world.interactables.length}개`);
  },

  // 시작: 3D 화면을 켜고 "클릭하면 시작" 화면 표시
  // (마우스 잠금은 브라우저 규칙상 사용자의 클릭이 있어야만 가능)
  start() {
    this.init();
    active = true;
    root.hidden = false;
    onResize();
    showOverlay("start");
    if (rafId === null) {
      clock.start();
      loop();
    }
    console.log("[Phase3] start");
  },

  // 정지 (여러 번 불러도 안전)
  stop() {
    active = false;
    playing = false;
    clearKeys();
    closePanel();
    clearScares();
    stopSound("ambience");
    if (ui.prompt) ui.prompt.hidden = true;
    if (renderer) releaseLock();
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (clock) clock.stop();
    if (root) root.hidden = true;
    console.log("[Phase3] stop");
  },

  // 처음 상태로 (카메라 위치, 시선, 입력) — 이후 단계에서 타이머·퍼즐·교수 위치 추가
  reset() {
    if (!initialized) return;
    clearKeys();
    resetCamera();
    elapsed = 0;
    resetPuzzle();
    resetProfessor();
    clearScares();
    if (ui.overlay) ui.overlay.dataset.mode = "start";
    console.log("[Phase3] reset");
  },

  // 배경음악(js/bgm.js)용 정보: 플레이 중인지, 교수 상태, 세트 무너짐 정도(0~1), 히든 영상 재생 중인지
  getMood() {
    const CS = window.FCredit.Cutscene;
    return {
      active, playing,
      prof: prof.state,
      k: THEME ? themeState.k : 0.5,
      cutscene: !!(CS && CS.isPlaying && CS.isPlaying()),
      finished: !!puzzle.finished,
    };
  },
};
