const TARGET_DISTANCE = 1000;
const STOP_SPEED = 0.12;
const COAST_DRAG = 0.025;
const NEUTRAL_NOTCH = 4;

const MODES = {
  free: { label: "フリー走行", maxSpeed: 320, hasTarget: false },
  normal: { label: "通常走行", maxSpeed: 130, hasTarget: true },
  high: { label: "高速走行", maxSpeed: 320, hasTarget: true },
};

const NOTCHES = [
  { label: "EB", description: "非常ブレーキ", acceleration: -5.8 },
  { label: "3", description: "制動3", acceleration: -3.2 },
  { label: "2", description: "制動2", acceleration: -2 },
  { label: "1", description: "制動1", acceleration: -1 },
  { label: "N", description: "中立", acceleration: 0 },
  { label: "1", description: "力行1", acceleration: 0.8 },
  { label: "2", description: "力行2", acceleration: 1.5 },
  { label: "3", description: "力行3", acceleration: 2.4 },
];

const elements = {
  modeSelect: document.querySelector("#mode-select"),
  gameScreen: document.querySelector("#game-screen"),
  modeButtons: [...document.querySelectorAll(".mode-card")],
  changeMode: document.querySelector("#change-mode"),
  modeLabel: document.querySelector("#current-mode-label"),
  gameTitle: document.querySelector("#game-title"),
  gameIntro: document.querySelector("#game-intro"),
  speed: document.querySelector("#speed"),
  speedDecimal: document.querySelector("#speed-decimal"),
  speedFill: document.querySelector("#speed-fill"),
  speedHalf: document.querySelector("#speed-half"),
  speedMax: document.querySelector("#speed-max"),
  remaining: document.querySelector("#remaining"),
  distanceLabel: document.querySelector("#distance-label"),
  sceneDistance: document.querySelector("#scene-distance"),
  routeTrack: document.querySelector(".route-track"),
  stationCard: document.querySelector(".station-card"),
  routeProgress: document.querySelector("#route-progress"),
  routeTrain: document.querySelector("#route-train"),
  scorePanel: document.querySelector(".score-panel"),
  footerNote: document.querySelector("#footer-note"),
  footerNoteText: document.querySelector("#footer-note-text"),
  status: document.querySelector("#status"),
  score: document.querySelector("#score"),
  scoreCaption: document.querySelector("#score-caption"),
  announcement: document.querySelector("#announcement"),
  handleNotch: document.querySelector("#handle-notch"),
  handleDescription: document.querySelector("#handle-description"),
  notchButtons: [...document.querySelectorAll(".notch-button")],
  soundToggle: document.querySelector("#sound-toggle"),
  backgroundPatterns: [
    { element: document.querySelector("#cloud-pattern"), rate: 0.25, width: 620 },
    { element: document.querySelector("#hill-pattern"), rate: 1.2, width: 900 },
    { element: document.querySelector("#city-pattern"), rate: 4.2, width: 880 },
    { element: document.querySelector("#tree-pattern"), rate: 8, width: 420 },
    { element: document.querySelector("#sleeper-pattern"), rate: 14, width: 110 },
  ],
  reset: document.querySelector("#reset"),
};

const state = {
  position: 0,
  speed: 0,
  notch: NEUTRAL_NOTCH,
  mode: "ready",
  lastFrame: 0,
};

let currentMode = null;

const audio = {
  enabled: true,
  context: null,
  motorVoices: [],
  motorGain: null,
  rollingGain: null,
  rollingFilter: null,
};

function formatDistance(distance) {
  return Math.round(distance).toLocaleString("ja-JP");
}

function updateSoundToggle() {
  elements.soundToggle.textContent = `♪ 音声 ${audio.enabled ? "ON" : "OFF"}`;
  elements.soundToggle.setAttribute("aria-pressed", audio.enabled.toString());
}

function createAudio() {
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) {
    audio.enabled = false;
    elements.soundToggle.disabled = true;
    elements.soundToggle.textContent = "音声非対応";
    elements.soundToggle.setAttribute("aria-pressed", "false");
    return;
  }

  const context = new AudioContextClass();
  const master = context.createGain();
  master.gain.value = 0.5;
  master.connect(context.destination);
  audio.context = context;
  audio.motorGain = context.createGain();
  audio.motorGain.gain.value = 0;
  audio.motorGain.connect(master);

  audio.motorVoices = [1, 2, 3].map((multiple, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    gain.gain.value = [0.18, 0.06, 0.02][index];
    oscillator.connect(gain);
    gain.connect(audio.motorGain);
    oscillator.start();
    return { oscillator, gain, multiple };
  });

  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.random() * 2 - 1;
  }

  const noise = context.createBufferSource();
  audio.rollingFilter = context.createBiquadFilter();
  audio.rollingFilter.type = "lowpass";
  audio.rollingFilter.frequency.value = 420;
  audio.rollingGain = context.createGain();
  audio.rollingGain.gain.value = 0;
  noise.buffer = buffer;
  noise.loop = true;
  noise.connect(audio.rollingFilter);
  audio.rollingFilter.connect(audio.rollingGain);
  audio.rollingGain.connect(master);
  noise.start();

  context.resume().catch(() => {
    setStatus("音声を再生できません。ブラウザーの設定をご確認ください");
  });
}

function updateAudio() {
  if (!audio.context) return;

  const now = audio.context.currentTime;
  const speedKmh = state.speed * 3.6;
  const moving = audio.enabled && state.mode === "running" && speedKmh > 0.5;
  const motorFrequency = 72 + speedKmh * 5.4;
  const motorLevel = moving ? Math.min(1, speedKmh / 7) : 0;
  const rollingLevel = moving ? Math.min(1, speedKmh / 5) : 0;

  audio.motorVoices.forEach(({ oscillator, multiple }) => {
    oscillator.frequency.setTargetAtTime(motorFrequency * multiple, now, 0.07);
  });
  audio.motorGain.gain.setTargetAtTime(motorLevel, now, 0.12);
  audio.rollingGain.gain.setTargetAtTime(rollingLevel * 0.035, now, 0.16);
  audio.rollingFilter.frequency.setTargetAtTime(260 + speedKmh * 5, now, 0.2);
}

function setStatus(message) {
  elements.status.textContent = message;
  elements.announcement.textContent = message;
}

function updateHandle() {
  const activeNotch = NOTCHES[state.notch];
  elements.handleNotch.textContent = activeNotch.label;
  elements.handleDescription.textContent = activeNotch.description;
  elements.notchButtons.forEach((button, index) => {
    const selected = index === state.notch;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", selected.toString());
    button.disabled = state.mode === "finished";
  });
}

function render() {
  if (!currentMode) return;

  const remaining = TARGET_DISTANCE - state.position;
  const speedKmh = state.speed * 3.6;
  const progress = Math.min(1, Math.max(0, state.position / TARGET_DISTANCE));

  const speedTenths = Math.round(speedKmh * 10);
  elements.speed.textContent = Math.floor(speedTenths / 10).toString();
  elements.speedDecimal.textContent = `.${speedTenths % 10}`;
  elements.speedFill.style.width = `${Math.min(100, (speedKmh / currentMode.maxSpeed) * 100)}%`;
  elements.speedHalf.textContent = (currentMode.maxSpeed / 2).toString();
  elements.speedMax.textContent = currentMode.maxSpeed.toString();
  elements.distanceLabel.textContent = currentMode.hasTarget ? "停止位置まで" : "走行距離";
  elements.remaining.textContent = formatDistance(currentMode.hasTarget ? Math.max(0, remaining) : state.position);
  elements.sceneDistance.textContent = currentMode.hasTarget
    ? remaining >= 0
      ? `停止位置まで ${formatDistance(remaining)} m`
      : `停止位置を ${formatDistance(Math.abs(remaining))} m 通過`
    : "フリー走行";
  elements.routeTrack.hidden = !currentMode.hasTarget;
  elements.scorePanel.hidden = !currentMode.hasTarget;
  elements.stationCard.hidden = !currentMode.hasTarget;
  elements.footerNoteText.textContent = currentMode.hasTarget
    ? "停止位置との距離が近いほど高得点"
    : "停車位置を気にせず自由に運転";
  elements.footerNote.querySelector(".footer-star").hidden = !currentMode.hasTarget;
  elements.routeProgress.style.width = `${progress * 100}%`;
  elements.routeTrain.style.left = `${progress * 100}%`;

  elements.backgroundPatterns.forEach(({ element, rate, width }) => {
    const offset = (state.position * rate) % width;
    element.setAttribute("patternTransform", `translate(${-offset.toFixed(2)} 0)`);
  });
  updateAudio();
}

function notchStatus() {
  const activeNotch = NOTCHES[state.notch];
  if (state.notch < NEUTRAL_NOTCH) {
    return `${activeNotch.description} 作動中`;
  }
  if (state.notch > NEUTRAL_NOTCH) {
    return `${activeNotch.description}で加速中`;
  }
  if (state.position > 0) return "中立 — 惰行中";
  return currentMode.hasTarget ? "中立 — 出発の準備ができています" : "中立 — フリー走行の準備ができています";
}

function finishRun() {
  state.speed = 0;
  state.mode = "finished";
  updateHandle();

  const error = Math.abs(TARGET_DISTANCE - state.position);
  const score = Math.max(0, Math.round(1000 - error * 10));
  const roundedError = Math.round(error);

  elements.score.textContent = score.toLocaleString("ja-JP");
  if (score === 1000) {
    elements.scoreCaption.textContent = "完璧な停車！";
    setStatus("停止位置にぴったり停車しました！");
  } else if (score >= 800) {
    elements.scoreCaption.textContent = `停止位置まで ${roundedError} m`;
    setStatus(`${roundedError} m の誤差で停車。お見事です`);
  } else if (score > 0) {
    elements.scoreCaption.textContent = `停止位置まで ${roundedError} m`;
    setStatus(`${roundedError} m の誤差で停車しました`);
  } else {
    elements.scoreCaption.textContent = "停止位置から離れています";
    setStatus(`${roundedError} m の誤差。もう一度挑戦しましょう`);
  }

  render();
}

function updateFrame(timestamp) {
  if (state.mode !== "running") return;

  const delta = Math.min((timestamp - state.lastFrame) / 1000, 0.05);
  state.lastFrame = timestamp;

  const acceleration = NOTCHES[state.notch].acceleration;
  if (acceleration > 0) {
    state.speed = Math.min(currentMode.maxSpeed / 3.6, state.speed + acceleration * delta);
  } else if (acceleration < 0) {
    state.speed = Math.max(0, state.speed + acceleration * delta);
  } else {
    state.speed = Math.max(0, state.speed - COAST_DRAG * delta);
  }

  state.position += state.speed * delta;
  render();

  if (currentMode.hasTarget && state.notch < NEUTRAL_NOTCH && state.speed <= STOP_SPEED && state.position > 0.5) {
    finishRun();
    return;
  }

  requestAnimationFrame(updateFrame);
}

function selectNotch(index) {
  if (!currentMode || state.mode === "finished") return;
  if (audio.enabled && !audio.context) createAudio();

  const nextNotch = Math.max(0, Math.min(NOTCHES.length - 1, index));
  if (nextNotch === state.notch) return;

  state.notch = nextNotch;
  updateHandle();

  if (state.mode === "ready" && state.notch > NEUTRAL_NOTCH) {
    state.mode = "running";
    state.lastFrame = performance.now();
    setStatus(notchStatus());
    requestAnimationFrame(updateFrame);
    return;
  }

  if (state.mode === "running") {
    setStatus(notchStatus());
  } else if (state.notch === NEUTRAL_NOTCH) {
    setStatus(currentMode.hasTarget ? "出発の準備ができています" : "フリー走行の準備ができています");
  } else {
    setStatus(`${NOTCHES[state.notch].description}待機中`);
  }
}

function resetRun() {
  if (!currentMode) return;
  state.position = 0;
  state.speed = 0;
  state.notch = NEUTRAL_NOTCH;
  state.mode = "ready";
  state.lastFrame = 0;
  elements.score.textContent = "—";
  elements.scoreCaption.textContent = "駅に停車すると採点";
  updateHandle();
  setStatus(currentMode.hasTarget ? "出発の準備ができています" : "フリー走行の準備ができています");
  render();
}

function startMode(modeName) {
  const mode = MODES[modeName];
  if (!mode) return;

  currentMode = mode;
  state.position = 0;
  state.speed = 0;
  state.notch = NEUTRAL_NOTCH;
  state.mode = "ready";
  state.lastFrame = 0;
  elements.gameTitle.textContent = mode.hasTarget ? "駅にぴたりと、停車しよう。" : "自由な運転を楽しもう。";
  elements.modeLabel.textContent = mode.label;
  elements.gameIntro.textContent = mode.hasTarget
    ? `最高速度 ${mode.maxSpeed} km/h。速度を調整して青葉台の停車位置を目指してください。`
    : `最高速度 ${mode.maxSpeed} km/h。停車位置を気にせず自由に運転できます。`;
  elements.modeSelect.hidden = true;
  elements.gameScreen.hidden = false;
  elements.score.textContent = "—";
  elements.scoreCaption.textContent = "駅に停車すると採点";
  updateHandle();
  setStatus(mode.hasTarget ? "出発の準備ができています" : "フリー走行の準備ができています");
  render();
}

function showModeSelect() {
  state.position = 0;
  state.speed = 0;
  state.notch = NEUTRAL_NOTCH;
  state.mode = "ready";
  updateHandle();
  render();
  elements.gameScreen.hidden = true;
  elements.modeSelect.hidden = false;
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  if (elements.gameScreen.hidden) return;
  event.preventDefault();
  selectNotch(state.notch + (event.key === "ArrowUp" ? 1 : -1));
});

elements.modeButtons.forEach((button) => {
  button.addEventListener("click", () => startMode(button.dataset.mode));
});
elements.notchButtons.forEach((button, index) => {
  button.addEventListener("click", () => selectNotch(index));
});
elements.soundToggle.addEventListener("click", () => {
  audio.enabled = !audio.enabled;
  updateSoundToggle();
  if (audio.enabled && !audio.context) createAudio();
  updateAudio();
});
elements.reset.addEventListener("click", resetRun);
elements.changeMode.addEventListener("click", showModeSelect);

updateSoundToggle();
