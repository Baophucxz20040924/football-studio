const ui = {
  stateValue: document.getElementById("stateValue"),
  multiplierValue: document.getElementById("multiplierValue"),
  crashLabel: document.getElementById("crashLabel"),
  countdownValue: document.getElementById("countdownValue"),
  timerLabel: document.getElementById("timerLabel"),
  flightFill: document.getElementById("flightFill"),
  historyList: document.getElementById("historyList"),
  balanceValue: document.getElementById("balanceValue"),
  betAmount1: document.getElementById("betAmount1"),
  betAmount2: document.getElementById("betAmount2"),
  autoCashout1: document.getElementById("autoCashout1"),
  autoCashout2: document.getElementById("autoCashout2"),
  placeBet1: document.getElementById("placeBet1"),
  placeBet2: document.getElementById("placeBet2"),
  cashout1: document.getElementById("cashout1"),
  cashout2: document.getElementById("cashout2"),
  betStatus1: document.getElementById("betStatus1"),
  betStatus2: document.getElementById("betStatus2"),
  userNote: document.getElementById("userNote"),
  roundBetsList: document.getElementById("roundBetsList"),
  chartPath: document.getElementById("chartPath"),
  chartFill: document.getElementById("chartFill"),
  planeIcon: document.getElementById("planeIcon")
};

const CHART_WIDTH = 300;
const CHART_HEIGHT = 160;
const CHART_PADDING = 12;

const state = {
  status: "WAITING",
  lastStatus: "WAITING",
  countdown: 3.0,
  multiplier: 1.0,
  crashPoint: null,
  startTime: 0,
  rafId: null,
  timerId: null,
  history: [],
  balance: 0,
  bets: [
    { amount: 0, autoCashout: 0, placed: false, cashedOut: false, cashoutAt: 0, winAmount: 0, betId: null },
    { amount: 0, autoCashout: 0, placed: false, cashedOut: false, cashoutAt: 0, winAmount: 0, betId: null }
  ],
  userId: "",
  userName: "",
  chartPoints: [],
  chartStart: 0,
  planePos: { x: 0, y: 0 },
  crashTimerId: null,
  displayMultiplier: 1
};

const token = new URLSearchParams(window.location.search).get("token") || "";

function formatMoney(value) {
  return value.toFixed(2);
}

function formatMultiplier(value) {
  return value.toFixed(2) + "x";
}

function setStatus(status) {
  state.status = status;
  ui.stateValue.textContent = status;
}

function updateBalance() {
  ui.balanceValue.textContent = formatMoney(state.balance);
}

function resetChart() {
  state.chartPoints = [{ t: 0, m: 1 }];
  state.chartStart = Date.now();
  state.planePos = { x: CHART_PADDING, y: CHART_HEIGHT - CHART_PADDING };
  state.displayMultiplier = 1;
  renderChart();
}

function appendChartPoint(multiplier) {
  if (!state.chartStart) {
    state.chartStart = Date.now();
  }
  const t = (Date.now() - state.chartStart) / 1000;
  const last = state.chartPoints[state.chartPoints.length - 1];
  if (last && Math.abs(last.m - multiplier) < 0.001) {
    return;
  }
  state.chartPoints.push({ t, m: multiplier });
  if (state.chartPoints.length > 240) {
    state.chartPoints.shift();
  }
}

function buildChartPath(points) {
  if (!points || points.length === 0) {
    return { line: "", fill: "" };
  }

  const maxT = Math.max(1, points[points.length - 1].t || 1);
  const maxM = Math.max(2, ...points.map((p) => p.m));
  const width = CHART_WIDTH;
  const height = CHART_HEIGHT;
  const innerW = width - CHART_PADDING * 2;
  const innerH = height - CHART_PADDING * 2;

  const coords = points.map((point) => {
    const x = CHART_PADDING + (point.t / maxT) * innerW;
    const ratio = (point.m - 1) / (maxM - 1);
    const y = height - CHART_PADDING - ratio * innerH;
    return { x, y };
  });

  if (coords.length === 1) {
    return { line: "", fill: "", last: coords[0] };
  }

  const line = coords
    .map((coord, index) => `${index === 0 ? "M" : "L"}${coord.x.toFixed(2)} ${coord.y.toFixed(2)}`)
    .join(" ");

  const last = coords[coords.length - 1];
  const fill = `${line} L${last.x.toFixed(2)} ${height - CHART_PADDING} L${coords[0].x.toFixed(2)} ${height - CHART_PADDING} Z`;

  return { line, fill, last };
}

function renderChart() {
  if (!ui.chartPath || !ui.chartFill || !ui.planeIcon) {
    return;
  }

  const { line, fill, last } = buildChartPath(state.chartPoints);
  ui.chartPath.setAttribute("d", line);
  ui.chartFill.setAttribute("d", fill);

  if (last && (state.status === "FLYING" || state.status === "CRASHED")) {
    state.planePos = { x: last.x, y: last.y };
    ui.planeIcon.classList.add("active");
    ui.planeIcon.style.left = `${(state.planePos.x / CHART_WIDTH) * 100}%`;
    ui.planeIcon.style.top = `${(state.planePos.y / CHART_HEIGHT) * 100}%`;
  } else {
    ui.planeIcon.classList.remove("active");
  }
}

function triggerCrashEffect() {
  if (!ui.planeIcon) {
    return;
  }
  ui.planeIcon.classList.add("crash");
  if (state.crashTimerId) {
    clearTimeout(state.crashTimerId);
  }
  state.crashTimerId = setTimeout(() => {
    ui.planeIcon.classList.remove("crash");
    state.crashTimerId = null;
  }, 700);
}

function resetBet(index) {
  const bet = state.bets[index];
  bet.amount = 0;
  bet.autoCashout = 0;
  bet.placed = false;
  bet.cashedOut = false;
  bet.cashoutAt = 0;
  bet.winAmount = 0;
  bet.betId = null;
}

function updateBetStatus(index, message) {
  if (index === 0) {
    ui.betStatus1.textContent = message;
  } else {
    ui.betStatus2.textContent = message;
  }
}

function updateBetButtons() {
  const allowBet = state.status === "WAITING";
  const allowCashout = state.status === "FLYING";
  ui.placeBet1.disabled = !allowBet;
  ui.placeBet2.disabled = !allowBet;
  ui.cashout1.disabled = !allowCashout || !state.bets[0].placed || state.bets[0].cashedOut;
  ui.cashout2.disabled = !allowCashout || !state.bets[1].placed || state.bets[1].cashedOut;
}

function updateHistory() {
  ui.historyList.innerHTML = "";
  state.history.slice(0, 12).forEach((value) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    if (value < 2) {
      chip.classList.add("low");
    } else if (value <= 10) {
      chip.classList.add("mid");
    } else {
      chip.classList.add("high");
    }
    chip.textContent = formatMultiplier(value);
    ui.historyList.appendChild(chip);
  });
}

function renderRoundBets(bets) {
  if (!ui.roundBetsList) {
    return;
  }
  ui.roundBetsList.innerHTML = "";
  if (!Array.isArray(bets) || bets.length === 0) {
    const empty = document.createElement("div");
    empty.className = "round-bet open";
    empty.innerHTML = "<span class=\"name\">No bets</span><span class=\"result\">-</span>";
    ui.roundBetsList.appendChild(empty);
    return;
  }

  bets.forEach((item) => {
    const row = document.createElement("div");
    const status = item.status || "open";
    row.className = `round-bet ${status}`;

    const displayName = item.userName || item.userId || "Unknown";
    const amount = Number(item.amount) || 0;
    const winAmount = Number(item.winAmount) || 0;
    let resultText = "Pending";
    if (status === "won") {
      resultText = `+${formatMoney(winAmount)}`;
    } else if (status === "lost") {
      resultText = `-${formatMoney(amount)}`;
    }

    row.innerHTML = `
      <span class="name">${displayName}</span>
      <span class="result">${resultText}</span>
    `;
    ui.roundBetsList.appendChild(row);
  });
}

function updateFlightFill() {
  const percent = Math.min(100, Math.max(0, (state.multiplier - 1) * 12));
  ui.flightFill.style.width = percent + "%";
}

function updateDisplay() {
  ui.multiplierValue.textContent = formatMultiplier(state.multiplier);
  if (state.status === "WAITING") {
    ui.timerLabel.textContent = "Next round in " + state.countdown.toFixed(1) + "s";
    ui.crashLabel.textContent = "Crash point hidden";
    if (state.lastStatus !== "WAITING") {
      resetChart();
    }
  } else if (state.status === "FLYING") {
    ui.timerLabel.textContent = "Take off...";
    ui.crashLabel.textContent = "Crash point hidden";
    state.displayMultiplier += (state.multiplier - state.displayMultiplier) * 0.04;
    appendChartPoint(state.displayMultiplier);
  } else {
    ui.timerLabel.textContent = "Round ended";
    ui.crashLabel.textContent = "Crash at " + formatMultiplier(state.crashPoint || 1);
    state.displayMultiplier = state.multiplier;
    appendChartPoint(state.displayMultiplier);
  }
  updateFlightFill();
  renderChart();
  updateBetButtons();
  updateBalance();
}

async function apiRequest(path, options = {}) {
  const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
  const response = await fetch(path, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = payload.error || "Request failed";
    throw new Error(message);
  }

  return response.json();
}

async function loadSession() {
  if (!token) {
    ui.userNote.textContent = "Missing token. Please open the link from /aviator.";
    ui.placeBet1.disabled = true;
    ui.placeBet2.disabled = true;
    return;
  }

  const session = await apiRequest(`/api/aviator/session?token=${encodeURIComponent(token)}`);
  state.userId = session.userId;
  state.userName = session.userName || "";
  state.balance = Number(session.balance) || 0;
  ui.userNote.textContent = state.userName
    ? `Player: ${state.userName} (${state.userId})`
    : `Player: ${state.userId}`;
}

async function loadHistory() {
  if (!token) {
    return;
  }
  const payload = await apiRequest(`/api/aviator/rounds?token=${encodeURIComponent(token)}`);
  state.history = payload.map((item) => item.crashPoint).filter((value) => Number.isFinite(value));
  updateHistory();
}


async function placeBet(index) {
  if (state.status !== "WAITING") {
    updateBetStatus(index, "Bet only in WAITING");
    return;
  }
  const amountInput = index === 0 ? ui.betAmount1 : ui.betAmount2;
  const autoInput = index === 0 ? ui.autoCashout1 : ui.autoCashout2;
  const amount = Number(amountInput.value);
  const autoCashout = Number(autoInput.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    updateBetStatus(index, "Invalid amount");
    return;
  }

  try {
    const payload = await apiRequest("/api/aviator/bet/place", {
      method: "POST",
      body: {
        token,
        amount,
        autoCashout: Number.isFinite(autoCashout) && autoCashout > 1 ? autoCashout : 0,
        slot: index
      }
    });

    const bet = state.bets[index];
    bet.amount = amount;
    bet.autoCashout = payload.autoCashout;
    bet.placed = true;
    bet.cashedOut = false;
    bet.cashoutAt = 0;
    bet.winAmount = 0;
    bet.betId = payload.betId;
    state.balance = payload.balance;

    updateBetStatus(index, "Bet placed");
    updateDisplay();
  } catch (err) {
    updateBetStatus(index, err.message || "Bet failed");
  }
}

async function cashout(index) {
  if (state.status !== "FLYING") {
    return;
  }
  const bet = state.bets[index];
  if (!bet.placed || bet.cashedOut || !bet.betId) {
    return;
  }

  try {
    const payload = await apiRequest("/api/aviator/bet/cashout", {
      method: "POST",
      body: {
        token,
        betId: bet.betId
      }
    });

    bet.cashedOut = true;
    bet.cashoutAt = payload.cashoutAt;
    bet.winAmount = payload.winAmount;
    state.balance = payload.balance;
    updateBetStatus(index, "Cashed out at " + formatMultiplier(bet.cashoutAt));
    updateDisplay();
  } catch (err) {
    updateBetStatus(index, err.message || "Cashout failed");
  }
}

function handleStateUpdate(snapshot) {
  if (!snapshot) {
    return;
  }
  state.lastStatus = state.status;
  state.status = snapshot.status || state.status;
  state.countdown = Number(snapshot.countdown) || 0;
  state.multiplier = Number(snapshot.multiplier) || 1;
  state.crashPoint = snapshot.crashPoint || null;

  if (state.status === "WAITING" && state.lastStatus !== "WAITING") {
    state.bets.forEach((bet, index) => {
      if (bet.placed) {
        resetBet(index);
        updateBetStatus(index, "Idle");
      }
    });
    renderRoundBets([]);
  }

  if (state.status === "FLYING" && state.lastStatus !== "FLYING") {
    resetChart();
  }

  if (state.status === "CRASHED" && state.lastStatus !== "CRASHED") {
    triggerCrashEffect();
  }

  updateDisplay();
}

function handleBetUpdate(payload) {
  if (!payload || !Number.isInteger(payload.slot)) {
    return;
  }
  const bet = state.bets[payload.slot];
  if (!bet) {
    return;
  }

  if (payload.status === "won") {
    bet.cashedOut = true;
    bet.cashoutAt = payload.cashoutAt || bet.cashoutAt;
    bet.winAmount = payload.winAmount || bet.winAmount;
    state.balance = Number(payload.balance) || state.balance;
    updateBetStatus(payload.slot, "Cashed out at " + formatMultiplier(bet.cashoutAt));
  } else if (payload.status === "lost") {
    updateBetStatus(payload.slot, "Lost at crash");
  }

  updateDisplay();
}

function connectStream() {
  if (!token) {
    return;
  }

  const stream = new EventSource(`/api/aviator/stream?token=${encodeURIComponent(token)}`);
  stream.onmessage = (event) => {
    let payload = null;
    try {
      payload = JSON.parse(event.data);
    } catch (err) {
      return;
    }

    if (payload.type === "state") {
      handleStateUpdate(payload.data);
    }
    if (payload.type === "history") {
      loadHistory().catch(() => null);
    }
    if (payload.type === "balance") {
      state.balance = Number(payload.balance) || state.balance;
      updateDisplay();
    }
    if (payload.type === "bet") {
      handleBetUpdate(payload);
    }
    if (payload.type === "roundBets") {
      renderRoundBets(payload.bets || []);
    }
  };

  stream.onerror = () => {
    stream.close();
    setTimeout(connectStream, 1500);
  };
}

ui.placeBet1.addEventListener("click", () => placeBet(0));
ui.placeBet2.addEventListener("click", () => placeBet(1));
ui.cashout1.addEventListener("click", () => cashout(0));
ui.cashout2.addEventListener("click", () => cashout(1));
loadSession()
  .then(loadHistory)
  .then(() => {
    updateDisplay();
    resetChart();
    renderRoundBets([]);
    connectStream();
  })
  .catch((err) => {
    ui.userNote.textContent = err.message || "Unable to load session";
  });
