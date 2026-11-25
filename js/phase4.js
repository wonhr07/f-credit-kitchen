window.FCredit = window.FCredit || {};
window.FCredit.GradeSheet = window.FCredit.GradeSheet || {
  createCanvas(type, size) {
    const c = document.createElement("canvas");
    c.width = size || 150;
    c.height = Math.round(c.width * 1.33);
    const ctx = c.getContext("2d");
    if (!ctx) return c;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#000000";
    ctx.font = "bold 16px monospace";
    ctx.fillText(type === "clean" ? "A+" : "A+", 20, 40);
    return c;
  }
};

(function () {
  let initialized = false;
  let audioCtx = null;
  let masterCompressor = null;
  let masterGain = null;
  let noiseBuffer = null;
  let activeNodes = [];
  let loopingSounds = {};
  let pendingLoops = {};
  let timers = [];
  let isEnding = false;
  let endingCompleteDispatched = false;

  function getRoot() {
    return document.getElementById("phase4-root");
  }

  function addTimer(fn, delay) {
    const id = setTimeout(() => {
      timers = timers.filter((t) => t !== id);
      fn();
    }, delay);
    timers.push(id);
    return id;
  }

  function clearAllTimers() {
    timers.forEach((id) => clearTimeout(id));
    timers = [];
  }

  function getAudioContext() {
    try {
      if (!audioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        audioCtx = new AudioCtx();

        masterCompressor = audioCtx.createDynamicsCompressor();
        masterCompressor.threshold.setValueAtTime(-14, audioCtx.currentTime);
        masterCompressor.knee.setValueAtTime(16, audioCtx.currentTime);
        masterCompressor.ratio.setValueAtTime(4, audioCtx.currentTime);
        masterCompressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
        masterCompressor.release.setValueAtTime(0.2, audioCtx.currentTime);

        masterGain = audioCtx.createGain();
        masterGain.gain.setValueAtTime(1.15, audioCtx.currentTime);

        masterCompressor.connect(masterGain);
        masterGain.connect(audioCtx.destination);
      }

      if (!noiseBuffer && audioCtx) {
        const length = audioCtx.sampleRate * 2;
        noiseBuffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
          data[i] = Math.random() * 2 - 1;
        }
      }
      return audioCtx;
    } catch (e) {
      return null;
    }
  }

  function getAudioOut(ctx) {
    return masterCompressor || ctx.destination;
  }

  function flushPendingLoops() {
    Object.keys(pendingLoops).forEach((name) => {
      if (pendingLoops[name]) {
        delete pendingLoops[name];
        playSound(name);
      }
    });
  }

  function unlockAudio() {
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") {
      ctx
        .resume()
        .then(() => {
          flushPendingLoops();
        })
        .catch(() => {});
    } else {
      flushPendingLoops();
    }
  }

  ["pointerdown", "mousedown", "touchstart", "click", "keydown"].forEach((evt) => {
    window.addEventListener(evt, unlockAudio, { capture: true, passive: true });
  });

  function trackNode(node, durationSec) {
    activeNodes.push(node);
    const cleanup = () => {
      activeNodes = activeNodes.filter((n) => n !== node);
    };
    if (typeof node.onended !== "undefined") {
      node.onended = cleanup;
    } else if (durationSec) {
      addTimer(cleanup, durationSec * 1000 + 150);
    }
  }

  // 기본 오실레이터 + 로우패스 필터 옵션 지원
  function playTone(
    ctx,
    {
      type = "sine",
      freq = 440,
      endFreq = null,
      detune = 0,
      filterFreq = null,
      startTime = 0,
      duration = 0.2,
      attack = 0.012,
      volume = 0.35
    }
  ) {
    const out = getAudioOut(ctx);
    const t0 = ctx.currentTime + startTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, freq), t0);
    if (detune) {
      osc.detune.setValueAtTime(detune, t0);
    }
    if (endFreq !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + duration);
    }

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + Math.min(attack, duration * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    if (filterFreq) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(filterFreq, t0);
      osc.connect(filter);
      filter.connect(gain);
    } else {
      osc.connect(gain);
    }

    gain.connect(out);
    osc.start(t0);
    osc.stop(t0 + duration + 0.03);
    trackNode(osc, startTime + duration);
  }

  // 다중 노이즈 레이어
  function playNoise(
    ctx,
    { filterType = "bandpass", freq = 1000, endFreq = null, q = 1, startTime = 0, duration = 0.2, volume = 0.35 }
  ) {
    if (!noiseBuffer) return;
    const out = getAudioOut(ctx);
    const t0 = ctx.currentTime + startTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq, t0);
    if (endFreq !== null) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + duration);
    }
    filter.Q.setValueAtTime(q, t0);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + Math.min(0.01, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(out);

    src.start(t0);
    src.stop(t0 + duration + 0.03);
    trackNode(src, startTime + duration);
  }

  // =========================================================================
  // 2. 배경음악 루프 엔진 (추격 ambience / 노말 엔딩 BGM / 해피 엔딩 BGM)
  // =========================================================================
  function startEndingBgm(loopKey, isHappy) {
    if (loopingSounds[loopKey]) return;

    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === "suspended") {
      pendingLoops[loopKey] = true;
      ctx
        .resume()
        .then(() => {
          if (pendingLoops[loopKey]) {
            delete pendingLoops[loopKey];
            startEndingBgm(loopKey, isHappy);
          }
        })
        .catch(() => {});
      return;
    }

    let stopped = false;
    let step = 0;

    if (isHappy) {
      // 해피 엔딩 BGM: 따뜻한 파스텔 왈츠 & 오르골 하모니
      const melody = [
        { m: 523.25, b: 130.81, c: 329.63 }, // C5 / C3+E4
        { m: 659.25, b: 130.81, c: 392.0 },  // E5
        { m: 783.99, b: 164.81, c: 493.88 }, // G5 / E3+B4
        { m: 987.77, b: 174.61, c: 440.0 },  // B5 / F3+A4
        { m: 1046.5, b: 174.61, c: 523.25 }, // C6
        { m: 783.99, b: 196.0, c: 493.88 },  // G5 / G3+B4
        { m: 659.25, b: 196.0, c: 392.0 },   // E5
        { m: 587.33, b: 130.81, c: 392.0 }   // D5
      ];

      const playHappyStep = () => {
        if (stopped || !audioCtx || audioCtx.state !== "running") return;
        const n = melody[step % melody.length];
        const isDownbeat = step % 4 === 0;
        step += 1;

        // 오르골 주선율 (옥타브 배음 포함)
        playTone(ctx, { type: "sine", freq: n.m, duration: 0.9, attack: 0.015, volume: 0.18 });
        playTone(ctx, { type: "triangle", freq: n.m * 2, duration: 0.35, attack: 0.008, volume: 0.05 });

        // 따뜻한 화음 반주
        playTone(ctx, { type: "triangle", freq: n.c, filterFreq: 900, duration: 0.85, attack: 0.04, volume: 0.11 });
        if (isDownbeat) {
          playTone(ctx, { type: "sine", freq: n.b, duration: 1.8, attack: 0.08, volume: 0.16 });
        }
      };

      playHappyStep();
      const timer = setInterval(playHappyStep, 540);
      loopingSounds[loopKey] = {
        stop() {
          stopped = true;
          clearInterval(timer);
        }
      };
    } else {
      // 일반 엔딩 BGM: 새벽 침실의 기묘하고 서늘한 단조 오르골 + 시계 초침
      const nightPattern = [
        { m: 440.0, b: 110.0 },  // A4
        { m: 523.25, b: 110.0 }, // C5
        { m: 493.88, b: 98.0 },  // B4
        { m: 415.3, b: 98.0 },   // G#4 (묘한 긴장감)
        { m: 440.0, b: 87.31 },  // A4
        { m: 349.23, b: 87.31 }, // F4
        { m: 329.63, b: 82.41 }, // E4
        { m: 0, b: 82.41 }       // 여백
      ];

      const playNightStep = () => {
        if (stopped || !audioCtx || audioCtx.state !== "running") return;
        const n = nightPattern[step % nightPattern.length];
        const isTick = step % 2 === 0;
        step += 1;

        // 잔잔한 시계 초침
        playTone(ctx, {
          type: "triangle",
          freq: isTick ? 980 : 780,
          endFreq: isTick ? 440 : 350,
          duration: 0.028,
          volume: 0.11
        });

        // 단조 오르골 선율
        if (n.m > 0) {
          playTone(ctx, { type: "sine", freq: n.m, duration: 0.95, attack: 0.02, volume: 0.15 });
          playTone(ctx, { type: "triangle", freq: n.m * 0.5, filterFreq: 650, duration: 1.0, attack: 0.05, volume: 0.09 });
        }
        if (isTick) {
          playTone(ctx, { type: "sine", freq: n.b, duration: 1.4, attack: 0.1, volume: 0.14 });
        }
      };

      playNightStep();
      const timer = setInterval(playNightStep, 680);
      loopingSounds[loopKey] = {
        stop() {
          stopped = true;
          clearInterval(timer);
        }
      };
    }
  }

  function startAmbienceLoop() {
    if (loopingSounds.ambience) return;

    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === "suspended") {
      pendingLoops.ambience = true;
      ctx
        .resume()
        .then(() => {
          if (pendingLoops.ambience) {
            delete pendingLoops.ambience;
            startAmbienceLoop();
          }
        })
        .catch(() => {});
      return;
    }

    const out = getAudioOut(ctx);
    const now = ctx.currentTime;

    // 3중 저음 공포 드론 패드
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const osc3 = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const masterLoopGain = ctx.createGain();

    osc1.type = "sawtooth";
    osc1.frequency.setValueAtTime(55, now); // A1

    osc2.type = "sawtooth";
    osc2.frequency.setValueAtTime(58.27, now); // Bb1 (단2도 불협화음)

    osc3.type = "triangle";
    osc3.frequency.setValueAtTime(110, now); // A2

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(320, now);
    filter.Q.setValueAtTime(3.2, now);

    lfo.type = "sine";
    lfo.frequency.setValueAtTime(1.4, now);
    lfoGain.gain.setValueAtTime(0.08, now);

    masterLoopGain.gain.setValueAtTime(0.001, now);
    masterLoopGain.gain.linearRampToValueAtTime(0.24, now + 0.5);

    lfo.connect(lfoGain);
    lfoGain.connect(masterLoopGain.gain);

    osc1.connect(filter);
    osc2.connect(filter);
    osc3.connect(filter);
    filter.connect(masterLoopGain);
    masterLoopGain.connect(out);

    osc1.start(now);
    osc2.start(now);
    osc3.start(now);
    lfo.start(now);

    let stopped = false;
    let beatCount = 0;

    const triggerChasePulse = () => {
      if (stopped || !audioCtx || audioCtx.state !== "running") return;
      const t = audioCtx.currentTime;
      beatCount += 1;

      // 두근두근 심장 박동
      [0, 0.2].forEach((offset, idx) => {
        const beatOsc = audioCtx.createOscillator();
        const beatGain = audioCtx.createGain();
        beatOsc.type = "sine";
        beatOsc.frequency.setValueAtTime(idx === 0 ? 124 : 98, t + offset);
        beatOsc.frequency.exponentialRampToValueAtTime(42, t + offset + 0.16);

        beatGain.gain.setValueAtTime(0.001, t + offset);
        beatGain.gain.linearRampToValueAtTime(idx === 0 ? 0.36 : 0.25, t + offset + 0.015);
        beatGain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.18);

        beatOsc.connect(beatGain);
        beatGain.connect(out);
        beatOsc.start(t + offset);
        beatOsc.stop(t + offset + 0.2);
      });

      // 4박자마다 서늘한 금속 잔향
      if (beatCount % 4 === 0) {
        playTone(ctx, { type: "sine", freq: 622.25, endFreq: 587.33, duration: 0.65, attack: 0.08, volume: 0.09 });
      }
    };

    triggerChasePulse();
    const beatTimer = setInterval(triggerChasePulse, 740);

    loopingSounds.ambience = {
      stop() {
        stopped = true;
        clearInterval(beatTimer);
        try {
          const t = ctx.currentTime;
          masterLoopGain.gain.cancelScheduledValues(t);
          masterLoopGain.gain.setValueAtTime(Math.max(0.001, masterLoopGain.gain.value), t);
          masterLoopGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
          osc1.stop(t + 0.18);
          osc2.stop(t + 0.18);
          osc3.stop(t + 0.18);
          lfo.stop(t + 0.18);
        } catch (e) {}
      }
    };
  }

  function stopSound(name) {
    if (!name) return;
    delete pendingLoops[name];
    if (loopingSounds[name]) {
      loopingSounds[name].stop();
      delete loopingSounds[name];
    }
  }

  function stopAllAudio() {
    pendingLoops = {};
    Object.keys(loopingSounds).forEach((key) => stopSound(key));

    activeNodes.forEach((node) => {
      try {
        node.stop();
      } catch (e) {}
    });
    activeNodes = [];
  }

  // =========================================================================
  // 3. 19종 필수 효과음 + 추가 효과음 다중 레이어 합성
  // =========================================================================
  function executeSynthEffect(ctx, name) {
    switch (name) {
      case "tvOn":
        // 브라운관 전원 버튼 딸깍 + 정전기 파직 + 고주파 예열
        playTone(ctx, { type: "square", freq: 900, endFreq: 260, duration: 0.03, volume: 0.34 });
        playNoise(ctx, { filterType: "bandpass", freq: 1600, endFreq: 3200, q: 1.4, startTime: 0.03, duration: 0.38, volume: 0.32 });
        playTone(ctx, { type: "sine", freq: 280, endFreq: 5400, startTime: 0.03, duration: 0.36, volume: 0.18 });
        playTone(ctx, { type: "sine", freq: 140, endFreq: 55, startTime: 0.03, duration: 0.3, volume: 0.35 });
        break;

      case "click":
        // 경쾌한 기계식 UI 클릭
        playTone(ctx, { type: "triangle", freq: 1240, endFreq: 420, duration: 0.035, volume: 0.36 });
        playTone(ctx, { type: "sine", freq: 2400, endFreq: 900, duration: 0.02, volume: 0.18 });
        playNoise(ctx, { filterType: "highpass", freq: 2400, duration: 0.02, volume: 0.2 });
        break;

      case "ingredient":
        // 냄비에 퐁당 + 물방울 공명 2단
        playTone(ctx, { type: "sine", freq: 340, endFreq: 170, duration: 0.08, volume: 0.4 });
        playTone(ctx, { type: "sine", freq: 260, endFreq: 680, startTime: 0.065, duration: 0.15, volume: 0.42 });
        playTone(ctx, { type: "triangle", freq: 520, endFreq: 980, startTime: 0.09, duration: 0.12, volume: 0.2 });
        break;

      case "glitch":
        // 방송 사고 지지직 (주파수 도약 + 밴드패스 노이즈)
        playNoise(ctx, { filterType: "bandpass", freq: 1900, q: 1.6, duration: 0.24, volume: 0.44 });
        playTone(ctx, { type: "sawtooth", freq: 150, endFreq: 780, duration: 0.08, volume: 0.32 });
        playTone(ctx, { type: "square", freq: 620, endFreq: 92, startTime: 0.08, duration: 0.09, volume: 0.32 });
        playTone(ctx, { type: "sawtooth", freq: 310, endFreq: 1120, startTime: 0.17, duration: 0.07, volume: 0.28 });
        break;

      case "tvOff":
        // 브라운관 고주파 하강 + 릴레이 '뚝'
        playTone(ctx, { type: "sine", freq: 3600, endFreq: 52, duration: 0.26, volume: 0.26 });
        playTone(ctx, { type: "triangle", freq: 220, endFreq: 45, duration: 0.1, volume: 0.44 });
        playNoise(ctx, { filterType: "lowpass", freq: 900, duration: 0.06, volume: 0.28 });
        break;

      case "footstep":
        // 짧고 가벼운 실내 발걸음 (매번 미세한 피치 변화로 자연스러움 유지)
        {
          const jitter = 0.92 + Math.random() * 0.16;
          playNoise(ctx, { filterType: "bandpass", freq: 520 * jitter, q: 1.5, duration: 0.055, volume: 0.26 });
          playTone(ctx, { type: "sine", freq: 130 * jitter, endFreq: 56, duration: 0.05, volume: 0.24 });
        }
        break;

      case "pickup":
        // 아이템 획득 (맑은 2음 아르페지오 + 반짝임)
        playTone(ctx, { type: "triangle", freq: 659.25, duration: 0.09, volume: 0.34 });
        playTone(ctx, { type: "triangle", freq: 987.77, startTime: 0.07, duration: 0.16, volume: 0.38 });
        playTone(ctx, { type: "sine", freq: 1318.5, startTime: 0.1, duration: 0.18, volume: 0.2 });
        break;

      case "wrong":
        // 번호키 오답 부저 (불협화음 2연타)
        playTone(ctx, { type: "sawtooth", freq: 165, filterFreq: 950, duration: 0.11, volume: 0.4 });
        playTone(ctx, { type: "square", freq: 155, filterFreq: 850, duration: 0.11, volume: 0.25 });
        playTone(ctx, { type: "sawtooth", freq: 146.83, filterFreq: 900, startTime: 0.14, duration: 0.18, volume: 0.42 });
        break;

      case "correct":
        // 번호키 정답 멜로디 + 잠금 해제 '철컥'
        playTone(ctx, { type: "triangle", freq: 523.25, duration: 0.09, volume: 0.34 });
        playTone(ctx, { type: "triangle", freq: 659.25, startTime: 0.08, duration: 0.09, volume: 0.34 });
        playTone(ctx, { type: "triangle", freq: 783.99, startTime: 0.16, duration: 0.09, volume: 0.36 });
        playTone(ctx, { type: "triangle", freq: 1046.5, startTime: 0.24, duration: 0.26, volume: 0.4 });
        playTone(ctx, { type: "square", freq: 320, endFreq: 120, startTime: 0.26, duration: 0.05, volume: 0.26 });
        break;

      case "doorOpen":
        // 문고리 찰칵 + 삐걱이는 문 열림
        playTone(ctx, { type: "square", freq: 480, endFreq: 180, duration: 0.04, volume: 0.28 });
        playTone(ctx, { type: "sawtooth", freq: 175, endFreq: 265, filterFreq: 1100, startTime: 0.05, duration: 0.28, volume: 0.3 });
        playTone(ctx, { type: "sawtooth", freq: 265, endFreq: 205, filterFreq: 950, startTime: 0.32, duration: 0.26, volume: 0.26 });
        playNoise(ctx, { filterType: "bandpass", freq: 750, q: 4.5, startTime: 0.05, duration: 0.52, volume: 0.18 });
        break;

      case "detect":
        // 발각! 날카로운 현악 스타카토 + 저음 충격
        playTone(ctx, { type: "sawtooth", freq: 220, endFreq: 207.65, duration: 0.62, volume: 0.42 });
        playTone(ctx, { type: "sawtooth", freq: 233.08, endFreq: 220, duration: 0.62, volume: 0.42 });
        playTone(ctx, { type: "sine", freq: 932.33, endFreq: 622.25, duration: 0.5, volume: 0.34 });
        playTone(ctx, { type: "sine", freq: 110, endFreq: 42, duration: 0.45, volume: 0.44 });
        break;

      case "gameover":
        // 잡힘: 무겁게 가라앉는 불협화음 + 심장 정지 톤
        playTone(ctx, { type: "sawtooth", freq: 130.81, endFreq: 55, filterFreq: 750, duration: 1.25, volume: 0.45 });
        playTone(ctx, { type: "sawtooth", freq: 138.59, endFreq: 58.27, filterFreq: 750, duration: 1.25, volume: 0.42 });
        playTone(ctx, { type: "sine", freq: 98, endFreq: 32, duration: 1.35, volume: 0.54 });
        playNoise(ctx, { filterType: "lowpass", freq: 380, duration: 0.45, volume: 0.3 });
        break;

      case "crack":
        // 숟가락으로 플라스틱 야채칸 비틀어 깨지는 '빠직!'
        playNoise(ctx, { filterType: "highpass", freq: 2100, duration: 0.07, volume: 0.5 });
        playTone(ctx, { type: "square", freq: 520, endFreq: 120, duration: 0.1, volume: 0.42 });
        playNoise(ctx, { filterType: "bandpass", freq: 1450, q: 2.5, startTime: 0.055, duration: 0.09, volume: 0.44 });
        break;

      case "switch":
        // 전등 스위치 딸깍 2단
        playTone(ctx, { type: "square", freq: 1550, endFreq: 640, duration: 0.02, volume: 0.38 });
        playTone(ctx, { type: "square", freq: 1020, endFreq: 430, startTime: 0.042, duration: 0.024, volume: 0.34 });
        break;

      case "tape":
        // 비디오테이프 삽입 '철컥' + 데크 모터 '지이잉'
        playTone(ctx, { type: "triangle", freq: 150, endFreq: 72, duration: 0.08, volume: 0.42 });
        playTone(ctx, { type: "square", freq: 380, endFreq: 140, startTime: 0.05, duration: 0.06, volume: 0.3 });
        playTone(ctx, { type: "sine", freq: 165, endFreq: 225, startTime: 0.12, duration: 0.55, volume: 0.24 });
        playNoise(ctx, { filterType: "bandpass", freq: 1250, q: 2.2, startTime: 0.12, duration: 0.55, volume: 0.22 });
        break;

      case "sign":
        // 볼펜으로 출석인정서 서명 슥슥 (약 1초)
        for (let i = 0; i < 6; i++) {
          playNoise(ctx, {
            filterType: "bandpass",
            freq: 1950 + (i % 3) * 340,
            q: 2.8,
            startTime: i * 0.16,
            duration: 0.12,
            volume: 0.32
          });
        }
        break;

      case "hug": {
        // 교수님 안아주기: 풍성한 메이저9 따뜻하고 벅찬 화음 패드
        const chord = [261.63, 329.63, 392.0, 493.88, 587.33, 659.25];
        chord.forEach((f, idx) => {
          playTone(ctx, {
            type: idx < 3 ? "triangle" : "sine",
            freq: f,
            filterFreq: 1400,
            startTime: idx * 0.07,
            duration: 1.9,
            attack: 0.14,
            volume: 0.2
          });
        });
        break;
      }

      case "ending": {
        // 엔딩 팡파르 아르페지오 + 잔향 화음
        const notes = [523.25, 659.25, 783.99, 987.77, 1046.5];
        notes.forEach((f, idx) => {
          playTone(ctx, {
            type: "triangle",
            freq: f,
            startTime: idx * 0.15,
            duration: 0.85,
            attack: 0.02,
            volume: 0.28
          });
          playTone(ctx, {
            type: "sine",
            freq: f * 0.5,
            startTime: idx * 0.15,
            duration: 0.95,
            attack: 0.04,
            volume: 0.16
          });
        });
        break;
      }

      case "gasp":
        // 꿈에서 깨어날 때 헉! 숨 들이키는 소리
        playNoise(ctx, { filterType: "bandpass", freq: 620, endFreq: 1480, q: 1.5, duration: 0.34, volume: 0.38 });
        playTone(ctx, { type: "sine", freq: 175, endFreq: 280, duration: 0.28, volume: 0.24 });
        break;

      default:
        console.warn(`[Phase4] Unknown sound: ${name}`);
        break;
    }
  }

  function playSound(name) {
    if (!name) return;

    try {
      if (name === "ambience") {
        startAmbienceLoop();
        return;
      }
      if (name === "endingHappyBgm") {
        startEndingBgm(name, true);
        return;
      }
      if (name === "endingNormalBgm") {
        startEndingBgm(name, false);
        return;
      }

      const ctx = getAudioContext();
      if (!ctx) return;

      if (ctx.state === "suspended") {
        ctx
          .resume()
          .then(() => {
            executeSynthEffect(ctx, name);
          })
          .catch(() => {});
        return;
      }

      executeSynthEffect(ctx, name);
    } catch (e) {
      // 사운드 오류가 게임 진행을 막지 않도록 무시
    }
  }

  // =========================================================================
  // 4. 2D 픽셀 침실 씬 그리기 (320x180)
  // =========================================================================
  function drawBedroomPixelScene(canvas, isHappy) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 320;
    const H = 180;
    canvas.width = W;
    canvas.height = H;
    ctx.imageSmoothingEnabled = false;

    // 1. 벽면 배경
    ctx.fillStyle = isHappy ? "#f7e5cc" : "#221929";
    ctx.fillRect(0, 0, W, 86);

    ctx.fillStyle = isHappy ? "#eed8ba" : "#2b2033";
    for (let x = 0; x < W; x += 16) {
      ctx.fillRect(x, 0, 4, 86);
    }

    ctx.fillStyle = isHappy ? "#c49468" : "#3a2b45";
    ctx.fillRect(0, 82, W, 4);

    // 2. 바닥
    ctx.fillStyle = isHappy ? "#8c5e3c" : "#261b18";
    ctx.fillRect(0, 86, W, H - 86);
    ctx.fillStyle = isHappy ? "#734b2e" : "#1c1311";
    for (let y = 96; y < H; y += 12) {
      ctx.fillRect(0, y, W, 2);
    }

    // 3. 왼쪽 창문
    const winX = 24;
    const winY = 16;
    const winW = 58;
    const winH = 48;
    ctx.fillStyle = isHappy ? "#9c6238" : "#3d2a26";
    ctx.fillRect(winX - 3, winY - 3, winW + 6, winH + 6);

    ctx.fillStyle = isHappy ? "#9ce0ff" : "#140f1a";
    ctx.fillRect(winX, winY, winW, winH);

    if (isHappy) {
      ctx.fillStyle = "#ffe66d";
      ctx.fillRect(winX + 8, winY + 8, 12, 12);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(winX + 26, winY + 22, 20, 6);
      ctx.fillRect(winX + 30, winY + 18, 12, 4);
    } else {
      ctx.fillStyle = "#f7eec8";
      ctx.fillRect(winX + 10, winY + 8, 8, 10);
      ctx.fillStyle = "#140f1a";
      ctx.fillRect(winX + 13, winY + 9, 6, 8);
      ctx.fillStyle = "#e0d6eb";
      ctx.fillRect(winX + 36, winY + 12, 2, 2);
      ctx.fillRect(winX + 44, winY + 26, 2, 2);
      ctx.fillRect(winX + 24, winY + 34, 2, 2);
    }

    ctx.fillStyle = isHappy ? "#9c6238" : "#3d2a26";
    ctx.fillRect(winX + Math.floor(winW / 2) - 1, winY, 3, winH);
    ctx.fillRect(winX, winY + Math.floor(winH / 2) - 1, winW, 3);

    // 4. 오른쪽 책상 / 책장 실루엣
    ctx.fillStyle = isHappy ? "#7a4e2f" : "#241b1e";
    ctx.fillRect(246, 56, 56, 44);
    ctx.fillStyle = isHappy ? "#5e3a21" : "#181214";
    ctx.fillRect(250, 62, 48, 34);
    ctx.fillStyle = isHappy ? "#ff8fab" : "#6e3547";
    ctx.fillRect(254, 46, 6, 10);
    ctx.fillStyle = isHappy ? "#72efdd" : "#38595e";
    ctx.fillRect(261, 44, 6, 12);
    ctx.fillStyle = isHappy ? "#ffe680" : "#5e4c2c";
    ctx.fillRect(268, 47, 5, 9);
    ctx.fillStyle = isHappy ? "#2b2b2b" : "#1c1521";
    ctx.fillRect(282, 48, 14, 8);
    ctx.fillStyle = isHappy ? "#80ed99" : "#ff5978";
    ctx.fillRect(284, 50, 10, 4);

    // 5. 중앙 침대
    const bedX = 94;
    const bedY = 54;
    const bedW = 132;
    const bedH = 108;

    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(bedX - 4, bedY + 10, bedW + 8, bedH + 2);

    ctx.fillStyle = isHappy ? "#87512c" : "#38221d";
    ctx.fillRect(bedX - 2, bedY, bedW + 4, 20);
    ctx.fillStyle = isHappy ? "#a6663b" : "#4a2e27";
    ctx.fillRect(bedX + 2, bedY + 3, bedW - 4, 14);

    ctx.fillStyle = isHappy ? "#fffaf2" : "#a396ad";
    ctx.fillRect(bedX, bedY + 18, bedW, bedH - 18);

    ctx.fillStyle = isHappy ? "#ffffff" : "#dfd5e8";
    ctx.fillRect(bedX + 16, bedY + 22, 100, 22);
    ctx.fillStyle = isHappy ? "#ebdccc" : "#bfb2cc";
    ctx.fillRect(bedX + 16, bedY + 40, 100, 4);

    // 6. 침대에서 일어난 주인공
    const px = bedX + 42;
    const py = bedY + 8;
    ctx.fillStyle = "#1f1a24";
    ctx.fillRect(px + 4, py, 20, 12);
    ctx.fillRect(px + 2, py + 4, 24, 10);
    ctx.fillStyle = isHappy ? "#f7cbb0" : "#dbbaa8";
    ctx.fillRect(px + 6, py + 10, 16, 12);
    ctx.fillStyle = "#1a1a1a";
    if (isHappy) {
      ctx.fillRect(px + 8, py + 14, 4, 2);
      ctx.fillRect(px + 16, py + 14, 4, 2);
    } else {
      ctx.fillRect(px + 9, py + 13, 3, 4);
      ctx.fillRect(px + 16, py + 13, 3, 4);
    }
    ctx.fillStyle = isHappy ? "#95d5b2" : "#6b5478";
    ctx.fillRect(px + 3, py + 22, 22, 16);

    // 7. 이불
    ctx.fillStyle = isHappy ? "#fff3b0" : "#cbbdd6";
    ctx.fillRect(bedX, bedY + 46, bedW, 8);
    ctx.fillStyle = isHappy ? "#ff9ebb" : "#3d2c4a";
    ctx.fillRect(bedX, bedY + 54, bedW, bedH - 54);
    ctx.fillStyle = isHappy ? "#e882a3" : "#2c1f36";
    ctx.fillRect(bedX + 14, bedY + 66, 36, 3);
    ctx.fillRect(bedX + 76, bedY + 78, 40, 3);
    ctx.fillRect(bedX + 28, bedY + 90, 52, 3);

    // 8. 빛 분위기 오버레이
    if (isHappy) {
      ctx.fillStyle = "rgba(255, 238, 170, 0.22)";
      ctx.beginPath();
      ctx.moveTo(winX, winY);
      ctx.lineTo(winX + winW, winY);
      ctx.lineTo(220, H);
      ctx.lineTo(40, H);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = "rgba(18, 12, 24, 0.32)";
      ctx.fillRect(0, 0, W, H);
    }
  }

  function createGradeSheetElement(sheetType, size) {
    const GS = window.FCredit && window.FCredit.GradeSheet;
    if (GS && typeof GS.createCanvas === "function") {
      const c = GS.createCanvas(sheetType, size);
      c.classList.add("p4-gradesheet-canvas");
      return c;
    }
    const fallback = document.createElement("div");
    fallback.className = "p4-gradesheet-fallback";
    fallback.textContent = "A+";
    return fallback;
  }

  function dispatchEndingCompleteOnce(endingType) {
    if (endingCompleteDispatched) return;
    endingCompleteDispatched = true;
    window.dispatchEvent(new CustomEvent("endingComplete", { detail: { endingType } }));
  }

  function createViewfinderOverlay(isHappy) {
    const osd = document.createElement("div");
    osd.className = `p4-osd ${isHappy ? "p4-osd-happy" : "p4-osd-normal"}`;
    osd.setAttribute("aria-hidden", "true");

    osd.innerHTML = `
      <span class="p4-osd-corner p4-osd-tl"></span>
      <span class="p4-osd-corner p4-osd-tr"></span>
      <span class="p4-osd-corner p4-osd-bl"></span>
      <span class="p4-osd-corner p4-osd-br"></span>
      <div class="p4-osd-top">
        <span class="p4-osd-left">
          <span class="p4-osd-dot"></span>
          <span class="p4-osd-rec-label">${isHappy ? "OFF AIR" : "REC"}</span>
        </span>
        <span class="p4-osd-right">${isHappy ? "방송 종료 · CH-04" : "LIVE · CH-04"}</span>
      </div>
    `;

    return {
      el: osd,
      markBroadcastEnded() {
        osd.classList.add("is-ended");
        const leftLabel = osd.querySelector(".p4-osd-rec-label");
        const rightLabel = osd.querySelector(".p4-osd-right");
        if (leftLabel) leftLabel.textContent = "방송 종료";
        if (rightLabel) rightLabel.textContent = "CH-04 · 00:00";
      }
    };
  }

  // =========================================================================
  // 5. 엔딩 연출 실행 (normal / happy)
  // =========================================================================
  function startEnding(rawType) {
    const endingType = rawType === "happy" ? "happy" : "normal";
    const isHappy = endingType === "happy";

    if (isEnding) {
      stop();
    }
    isEnding = true;
    endingCompleteDispatched = false;

    const root = getRoot();
    if (!root) {
      console.warn("[Phase4] #phase4-root element not found.");
      return;
    }

    stopAllAudio();
    clearAllTimers();

    root.hidden = false;
    root.innerHTML = "";

    const stage = document.createElement("div");
    stage.className = `p4-stage ${isHappy ? "p4-theme-happy" : "p4-theme-normal"} p4-chromatic-split`;

    // 1. 2D 픽셀 침실 캔버스 영역
    const sceneWrap = document.createElement("div");
    sceneWrap.className = "p4-scene-wrap";

    const roomCanvas = document.createElement("canvas");
    roomCanvas.className = "p4-room-canvas";
    drawBedroomPixelScene(roomCanvas, isHappy);
    sceneWrap.appendChild(roomCanvas);

    // 2. 침대 머리맡 성적표
    const bedsideAnchor = document.createElement("button");
    bedsideAnchor.type = "button";
    bedsideAnchor.className = "p4-bedside-spot";
    bedsideAnchor.setAttribute("aria-label", "침대 머리맡 성적표 자세히 보기");

    const sheetThumb = createGradeSheetElement(isHappy ? "clean" : "aplus", 150);
    const hintBadge = document.createElement("span");
    hintBadge.className = "p4-bedside-hint";
    hintBadge.textContent = "성적표 확인";

    bedsideAnchor.appendChild(sheetThumb);
    bedsideAnchor.appendChild(hintBadge);
    sceneWrap.appendChild(bedsideAnchor);

    // 3. 프레임 내부 방송 뷰파인더 OSD
    const sceneOsd = createViewfinderOverlay(isHappy);
    sceneWrap.appendChild(sceneOsd.el);

    stage.appendChild(sceneWrap);

    // 4. 눈 뜨는 연출용 눈꺼풀 / 전환 베일
    const topLid = document.createElement("div");
    topLid.className = "p4-eyelid p4-eyelid-top";
    const bottomLid = document.createElement("div");
    bottomLid.className = "p4-eyelid p4-eyelid-bottom";
    const transitionVeil = document.createElement("div");
    transitionVeil.className = `p4-veil ${isHappy ? "p4-veil-white" : "p4-veil-black"}`;

    stage.appendChild(topLid);
    stage.appendChild(bottomLid);
    stage.appendChild(transitionVeil);

    // 5. 하단 2D 대사창
    const dialogueBox = document.createElement("div");
    dialogueBox.className = "p4-dialogue-box";
    dialogueBox.hidden = true;

    const speakerTag = document.createElement("div");
    speakerTag.className = "p4-speaker";
    speakerTag.textContent = "나";

    const dialogueText = document.createElement("p");
    dialogueText.className = "p4-dialogue-text";
    dialogueText.textContent = isHappy
      ? "…다음 학기엔 꼭 출석할게요."
      : "아, 기말고사 기간이라 미쳤나 보다. 다행히 꿈이었네.";

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "p4-btn-next";
    nextBtn.textContent = "계속 ▶";

    dialogueBox.appendChild(speakerTag);
    dialogueBox.appendChild(dialogueText);
    dialogueBox.appendChild(nextBtn);
    stage.appendChild(dialogueBox);

    // 6. 성적표 확대 모달
    const modal = document.createElement("div");
    modal.className = "p4-modal";
    modal.hidden = true;

    const modalCard = document.createElement("div");
    modalCard.className = "p4-modal-card";
    const largeSheet = createGradeSheetElement(isHappy ? "clean" : "aplus", 300);
    const modalCaption = document.createElement("p");
    modalCaption.className = "p4-modal-caption";
    modalCaption.textContent = isHappy
      ? "얼룩 하나 없이 깨끗한 성적표다."
      : "…잠깐, 이 케첩 얼룩은 꿈에서 본 것과 똑같잖아?";
    const modalCloseBtn = document.createElement("button");
    modalCloseBtn.type = "button";
    modalCloseBtn.className = "p4-btn-secondary";
    modalCloseBtn.textContent = "닫기";

    modalCard.appendChild(largeSheet);
    modalCard.appendChild(modalCaption);
    modalCard.appendChild(modalCloseBtn);
    modal.appendChild(modalCard);
    stage.appendChild(modal);

    // 7. 최종 엔딩 요약 화면
    const finalOverlay = document.createElement("div");
    finalOverlay.className = `p4-final-screen ${isHappy ? "p4-final-happy" : "p4-final-normal"}`;
    finalOverlay.hidden = true;

    const finalOsd = createViewfinderOverlay(isHappy);
    finalOsd.markBroadcastEnded();
    finalOverlay.appendChild(finalOsd.el);

    const endingBadge = document.createElement("div");
    endingBadge.className = "p4-ending-badge";
    endingBadge.textContent = isHappy ? "HIDDEN ROUTE CLEAR" : "ESCAPE COMPLETE";

    const endingTitle = document.createElement("h2");
    endingTitle.className = "p4-ending-title";
    endingTitle.textContent = isHappy ? "HAPPY ENDING" : "NORMAL ENDING";

    const endingSub = document.createElement("p");
    endingSub.className = "p4-ending-sub";
    endingSub.textContent = isHappy
      ? "진심을 전한 덕분에 무사히 학점을 지켰다."
      : "문 밖으로 탈출했지만, 침대 머리맡의 성적표가 신경 쓰인다…";

    const collectionEl = document.createElement("div");
    collectionEl.className = "p4-ending-collection";
    const E = window.FCredit && window.FCredit.Endings;
    if (E && typeof E.summary === "function") {
      collectionEl.textContent = E.summary();
    } else {
      collectionEl.textContent = isHappy ? "발견한 엔딩 2/2" : "발견한 엔딩 1/2";
    }

    const actionRow = document.createElement("div");
    actionRow.className = "p4-final-actions";

    const inspectAgainBtn = document.createElement("button");
    inspectAgainBtn.type = "button";
    inspectAgainBtn.className = "p4-btn-secondary";
    inspectAgainBtn.textContent = "성적표 다시 보기";

    const restartBtn = document.createElement("button");
    restartBtn.type = "button";
    restartBtn.className = "p4-btn-restart";
    restartBtn.textContent = "처음부터 다시";

    actionRow.appendChild(inspectAgainBtn);
    actionRow.appendChild(restartBtn);

    finalOverlay.appendChild(endingBadge);
    finalOverlay.appendChild(endingTitle);
    finalOverlay.appendChild(endingSub);
    finalOverlay.appendChild(collectionEl);
    finalOverlay.appendChild(actionRow);
    stage.appendChild(finalOverlay);

    // 8. 전체 화면 주사선 오버레이
    const scanlines = document.createElement("div");
    scanlines.className = "p4-scanlines";
    stage.appendChild(scanlines);

    root.appendChild(stage);

    const openSheetModal = () => {
      playSound("pickup");
      modal.hidden = false;
    };

    const closeSheetModal = () => {
      playSound("click");
      modal.hidden = true;
    };

    bedsideAnchor.addEventListener("click", openSheetModal);
    inspectAgainBtn.addEventListener("click", openSheetModal);
    modalCloseBtn.addEventListener("click", closeSheetModal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeSheetModal();
    });

    const showFinalScreen = () => {
      if (!finalOverlay.hidden) return;
      playSound("click");
      dialogueBox.hidden = true;
      bedsideAnchor.hidden = true;
      finalOverlay.hidden = false;
      playSound("ending");
      dispatchEndingCompleteOnce(endingType);
    };

    nextBtn.addEventListener("click", showFinalScreen);

    restartBtn.addEventListener("click", () => {
      playSound("click");
      window.dispatchEvent(new CustomEvent("restartRequest", { detail: { from: "phase1" } }));
    });

    addTimer(() => {
      stage.classList.remove("p4-chromatic-split");
    }, 520);

    if (isHappy) {
      playSound("hug");
      playSound("endingHappyBgm");
      addTimer(() => {
        transitionVeil.classList.add("p4-veil-fadeout");
        topLid.classList.add("p4-lid-open");
        bottomLid.classList.add("p4-lid-open");
        sceneWrap.classList.add("p4-scene-clear");
      }, 650);

      addTimer(() => {
        dialogueBox.hidden = false;
        bedsideAnchor.classList.add("p4-spot-ready");
      }, 2200);
    } else {
      playSound("glitch");

      addTimer(() => {
        transitionVeil.classList.add("p4-veil-solid");
        sceneOsd.markBroadcastEnded();
        playSound("tvOff");
      }, 550);

      addTimer(() => {
        playSound("gasp");
        transitionVeil.classList.remove("p4-veil-solid");
        transitionVeil.classList.add("p4-veil-fadeout");
        topLid.classList.add("p4-lid-open");
        bottomLid.classList.add("p4-lid-open");
        sceneWrap.classList.add("p4-scene-clear");
        playSound("endingNormalBgm");
      }, 1350);

      addTimer(() => {
        dialogueBox.hidden = false;
        bedsideAnchor.classList.add("p4-spot-ready");
      }, 2900);

      addTimer(() => {
        playSound("detect");
      }, 4100);
    }
  }

  function stop() {
    clearAllTimers();
    stopAllAudio();
    isEnding = false;
    endingCompleteDispatched = false;

    const root = getRoot();
    if (root) {
      root.hidden = true;
      root.innerHTML = "";
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;

    const root = getRoot();
    if (root) {
      root.hidden = true;
      root.innerHTML = "";
    }
  }

  window.FCredit.Phase4 = {
    init,
    start: startEnding,
    startEnding,
    playSound,
    stopSound,
    stop
  };
})();