const TEAM_STADIUMS = {
  "Manchester United": "Old Trafford",
  Liverpool: "Anfield",
  Everton: "Hill Dickinson Stadium",
  Arsenal: "Emirates",
  Tottenham: "Tottenham Hotspur",
  Chelsea: "Stamford Bridge",
  "Aston Villa": "Villa Park",
  Fulham: "Craven Cottage",
  Sunderland: "Stadium of Light",
  "Crystal Palace": "Selhurst Park",
  Burnley: "Turf Moor",
  Newcastle: "St James Park",
  "Nottingham Forest": "City Ground",
  "Leeds United": "Elland Road",
  Wolverhampton: "Molineux",
  "Man City": "Etihad",
  "West Ham": "Olympic",
  Bournemouth: "Vitality",
  Brentford: "Brentford Community Stadium",
  Brighton: "Falmer"
};

async function fetchMatches() {
  const [openRes, closedRes] = await Promise.all([
    fetch("/api/matches?status=open"),
    fetch("/api/matches?status=closed")
  ]);

  const openMatches = await openRes.json();
  const closedMatches = await closedRes.json();

  renderList("open-list", openMatches, true);
  renderList("closed-list", closedMatches, false);
}

async function fetchUsers() {
  const res = await fetch("/api/users");
  const users = await res.json();
  renderUsers(users);
}

async function fetchBetsLogs() {
  const res = await fetch("/api/bets");
  const bets = await res.json();
  renderBetsLogs(bets);
}

function toKickoffIso(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString();
}

function setupTabs() {
  const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
  const pages = Array.from(document.querySelectorAll(".tab-page"));

  function activate(tabId) {
    tabButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tabId);
    });
    pages.forEach((page) => {
      page.classList.toggle("active", page.dataset.page === tabId);
    });
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => activate(btn.dataset.tab));
  });

  activate("manage");
}

function normalizeTeamName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function findStadiumByTeamName(teamName) {
  const normalized = normalizeTeamName(teamName);
  if (!normalized) {
    return "";
  }

  for (const [team, stadium] of Object.entries(TEAM_STADIUMS)) {
    if (normalizeTeamName(team) === normalized) {
      return stadium;
    }
  }

  return "";
}

function setupTeamStadiumAssist() {
  const form = document.getElementById("create-form");
  if (!form) {
    return;
  }

  const homeTeamInput = form.querySelector('input[name="homeTeam"]');
  const awayTeamInput = form.querySelector('input[name="awayTeam"]');
  const stadiumInput = form.querySelector('input[name="stadium"]');
  const teamDatalist = document.getElementById("team-options");
  const stadiumDatalist = document.getElementById("stadium-options");
  const stadiumHint = document.getElementById("stadium-hint");

  if (!homeTeamInput || !awayTeamInput || !stadiumInput || !teamDatalist || !stadiumDatalist || !stadiumHint) {
    return;
  }

  const teams = Object.keys(TEAM_STADIUMS);
  const stadiums = Array.from(new Set(Object.values(TEAM_STADIUMS)));

  teamDatalist.innerHTML = "";
  teams.forEach((team) => {
    const option = document.createElement("option");
    option.value = team;
    teamDatalist.appendChild(option);
  });

  stadiumDatalist.innerHTML = "";
  stadiums.forEach((stadium) => {
    const option = document.createElement("option");
    option.value = stadium;
    stadiumDatalist.appendChild(option);
  });

  function updateStadiumHint() {
    const homeTeam = homeTeamInput.value;
    const awayTeam = awayTeamInput.value;
    const homeStadium = findStadiumByTeamName(homeTeam);
    const awayStadium = findStadiumByTeamName(awayTeam);

    if (homeStadium) {
      stadiumHint.textContent = `Suggested stadium (${homeTeam.trim() || "home"}): ${homeStadium}`;
      return;
    }

    if (awayStadium) {
      stadiumHint.textContent = `Away team stadium (${awayTeam.trim() || "away"}): ${awayStadium}`;
      return;
    }

    stadiumHint.textContent = "EPL quick list loaded: chọn team để hiện gợi ý sân.";
  }

  function maybeAutoFillFromHomeTeam() {
    const suggested = findStadiumByTeamName(homeTeamInput.value);
    if (!suggested) {
      return;
    }

    if (!stadiumInput.value.trim()) {
      stadiumInput.value = suggested;
    }
  }

  homeTeamInput.addEventListener("input", () => {
    maybeAutoFillFromHomeTeam();
    updateStadiumHint();
  });

  awayTeamInput.addEventListener("input", updateStadiumHint);
  updateStadiumHint();
}


function renderList(targetId, matches, allowActions) {
  const target = document.getElementById(targetId);
  target.innerHTML = "";

  if (!matches.length) {
    target.innerHTML = '<p class="card-meta">No matches.</p>';
    return;
  }

  matches.forEach((match) => {
    const card = document.createElement("div");
    card.className = "card";

    const odds = match.odds.map((o) => `${o.key} x${o.multiplier}`).join(", ");
    const kickoff = new Date(match.kickoff).toLocaleString();

    const winnerLabel = Array.isArray(match.winnerKeys) && match.winnerKeys.length
      ? match.winnerKeys.join(", ")
      : match.winnerKey || "-";

    const liveLabel = match.isLive ? "live" : "off";
    const betLabel = match.betLocked ? "locked" : "open";

    card.innerHTML = `
      <div class="card-title">${match.homeTeam} vs ${match.awayTeam}</div>
      <div class="card-meta">Kickoff: ${kickoff} | Stadium: ${match.stadium || "-"}</div>
      <div class="card-meta">Code: ${match.matchCode ?? "-"}</div>
      <div class="card-meta">Odds: ${odds}</div>
      <div class="card-meta">Score: ${match.scoreHome ?? 0} - ${match.scoreAway ?? 0} | Winner: ${winnerLabel}</div>
      <div class="card-meta">Corner: ${match.homeTeam}(${match.cornerHome ?? 0}) - ${match.awayTeam}(${match.cornerAway ?? 0})</div>
      <div class="card-meta">Live: ${liveLabel} | Betting: ${betLabel}</div>
    `;

    if (allowActions) {
      const editor = document.createElement("div");
      editor.className = "odds-editor";

      const oddsTitle = document.createElement("div");
      oddsTitle.className = "card-meta";
      oddsTitle.textContent = "Edit odds";

      const oddsRows = document.createElement("div");
      oddsRows.className = "odds-rows";

      match.odds.forEach((odd) => {
        oddsRows.appendChild(createOddsRow(odd.key, odd.multiplier));
      });

      const oddsActions = document.createElement("div");
      oddsActions.className = "actions";

      const addRowBtn = document.createElement("button");
      addRowBtn.className = "small-btn";
      addRowBtn.textContent = "Add row";
      addRowBtn.addEventListener("click", () => {
        oddsRows.appendChild(createOddsRow("", ""));
      });

      const saveOddsBtn = document.createElement("button");
      saveOddsBtn.className = "small-btn";
      saveOddsBtn.textContent = "Save odds";
      saveOddsBtn.addEventListener("click", async () => {
        const parsedOdds = collectOdds(oddsRows);
        if (!parsedOdds.length) {
          alert("Invalid odds.");
          return;
        }
        await fetch(`/api/matches/${match._id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ odds: parsedOdds })
        });
        await fetchMatches();
      });

      oddsActions.appendChild(addRowBtn);
      oddsActions.appendChild(saveOddsBtn);

      const scoreTitle = document.createElement("div");
      scoreTitle.className = "card-meta";
      scoreTitle.textContent = "Final score";

      const scoreRow = document.createElement("div");
      scoreRow.className = "score-row";

      const scoreHomeInput = document.createElement("input");
      scoreHomeInput.type = "number";
      scoreHomeInput.className = "inline-input";
      scoreHomeInput.value = match.scoreHome ?? 0;

      const scoreAwayInput = document.createElement("input");
      scoreAwayInput.type = "number";
      scoreAwayInput.className = "inline-input";
      scoreAwayInput.value = match.scoreAway ?? 0;

      const winnerList = document.createElement("div");
      winnerList.className = "winner-list";

      const existingWinners = Array.isArray(match.winnerKeys) && match.winnerKeys.length
        ? match.winnerKeys
        : match.winnerKey
          ? [match.winnerKey]
          : [];

      match.odds.forEach((odd) => {
        const item = document.createElement("label");
        item.className = "winner-item";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = odd.key;
        if (existingWinners.includes(odd.key)) {
          checkbox.checked = true;
        }

        const text = document.createElement("span");
        text.textContent = odd.key;

        item.appendChild(checkbox);
        item.appendChild(text);
        winnerList.appendChild(item);
      });

      scoreRow.appendChild(scoreHomeInput);
      scoreRow.appendChild(scoreAwayInput);
      scoreRow.appendChild(winnerList);

      const scoreActions = document.createElement("div");
      scoreActions.className = "actions";

      const updateScoreBtn = document.createElement("button");
      updateScoreBtn.className = "small-btn";
      updateScoreBtn.textContent = "Update score";
      updateScoreBtn.addEventListener("click", async () => {
        await fetch(`/api/matches/${match._id}/score`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scoreHome: Number(scoreHomeInput.value || 0),
            scoreAway: Number(scoreAwayInput.value || 0)
          })
        });
        await fetchMatches();
      });

      scoreActions.appendChild(updateScoreBtn);

      const cornerTitle = document.createElement("div");
      cornerTitle.className = "card-meta";
      cornerTitle.textContent = "Corners";

      const cornerRow = document.createElement("div");
      cornerRow.className = "score-row";

      const cornerHomeInput = document.createElement("input");
      cornerHomeInput.type = "number";
      cornerHomeInput.className = "inline-input";
      cornerHomeInput.value = match.cornerHome ?? 0;

      const cornerAwayInput = document.createElement("input");
      cornerAwayInput.type = "number";
      cornerAwayInput.className = "inline-input";
      cornerAwayInput.value = match.cornerAway ?? 0;

      cornerRow.appendChild(cornerHomeInput);
      cornerRow.appendChild(cornerAwayInput);

      const cornerActions = document.createElement("div");
      cornerActions.className = "actions";

      const updateCornerBtn = document.createElement("button");
      updateCornerBtn.className = "small-btn";
      updateCornerBtn.textContent = "Update corners";
      updateCornerBtn.addEventListener("click", async () => {
        await fetch(`/api/matches/${match._id}/corners`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cornerHome: Number(cornerHomeInput.value || 0),
            cornerAway: Number(cornerAwayInput.value || 0)
          })
        });
        await fetchMatches();
      });

      cornerActions.appendChild(updateCornerBtn);

      const liveTitle = document.createElement("div");
      liveTitle.className = "card-meta";
      liveTitle.textContent = "Live controls";

      const liveRow = document.createElement("div");
      liveRow.className = "live-row";

      const liveCheckLabel = document.createElement("label");
      liveCheckLabel.className = "live-toggle";

      const liveCheck = document.createElement("input");
      liveCheck.type = "checkbox";
      liveCheck.checked = Boolean(match.isLive);

      const liveText = document.createElement("span");
      liveText.textContent = "Mark as live";

      liveCheckLabel.appendChild(liveCheck);
      liveCheckLabel.appendChild(liveText);

      const saveLiveBtn = document.createElement("button");
      saveLiveBtn.className = "small-btn";
      saveLiveBtn.textContent = "Save live";
      saveLiveBtn.addEventListener("click", async () => {
        await fetch(`/api/matches/${match._id}/live`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isLive: liveCheck.checked })
        });
        await fetchMatches();
      });

      liveRow.appendChild(liveCheckLabel);
      liveRow.appendChild(saveLiveBtn);

      const betTitle = document.createElement("div");
      betTitle.className = "card-meta";
      betTitle.textContent = "Betting lock";

      const betRow = document.createElement("div");
      betRow.className = "live-row";

      const betCheckLabel = document.createElement("label");
      betCheckLabel.className = "live-toggle";

      const betCheck = document.createElement("input");
      betCheck.type = "checkbox";
      betCheck.checked = Boolean(match.betLocked);

      const betText = document.createElement("span");
      betText.textContent = "Lock betting";

      betCheckLabel.appendChild(betCheck);
      betCheckLabel.appendChild(betText);

      const saveBetBtn = document.createElement("button");
      saveBetBtn.className = "small-btn";
      saveBetBtn.textContent = "Save lock";
      saveBetBtn.addEventListener("click", async () => {
        await fetch(`/api/matches/${match._id}/bet-lock`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ betLocked: betCheck.checked })
        });
        await fetchMatches();
      });

      betRow.appendChild(betCheckLabel);
      betRow.appendChild(saveBetBtn);

      const goalsTitle = document.createElement("div");
      goalsTitle.className = "card-meta";
      goalsTitle.textContent = "Goals";

      const goalsRows = document.createElement("div");
      goalsRows.className = "goals-rows";

      if (Array.isArray(match.goals) && match.goals.length > 0) {
        match.goals.forEach((goal) => {
          goalsRows.appendChild(createGoalRow(goal.scorer, goal.team, goal.minute));
        });
      } else {
        goalsRows.appendChild(createGoalRow("", "", ""));
      }

      const goalsActions = document.createElement("div");
      goalsActions.className = "actions";

      const addGoalBtn = document.createElement("button");
      addGoalBtn.className = "small-btn";
      addGoalBtn.textContent = "Add goal";
      addGoalBtn.addEventListener("click", () => {
        goalsRows.appendChild(createGoalRow("", "", ""));
      });

      const saveGoalsBtn = document.createElement("button");
      saveGoalsBtn.className = "small-btn";
      saveGoalsBtn.textContent = "Save goals";
      saveGoalsBtn.addEventListener("click", async () => {
        const goals = collectGoals(goalsRows);
        await fetch(`/api/matches/${match._id}/goals`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ goals })
        });
        await fetchMatches();
      });

      goalsActions.appendChild(addGoalBtn);
      goalsActions.appendChild(saveGoalsBtn);

      const closeBtn = document.createElement("button");
      closeBtn.textContent = "Close match";
      closeBtn.classList.add("danger");
      closeBtn.addEventListener("click", async () => {
        const winnerKeys = Array.from(
          winnerList.querySelectorAll("input[type=checkbox]:checked")
        ).map((input) => input.value);
        if (!winnerKeys.length) {
          alert("Please select at least one winner key.");
          return;
        }
        await fetch(`/api/matches/${match._id}/close`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            winnerKeys,
            scoreHome: Number(scoreHomeInput.value || 0),
            scoreAway: Number(scoreAwayInput.value || 0)
          })
        });
        await fetchMatches();
      });

      editor.appendChild(oddsTitle);
      editor.appendChild(oddsRows);
      editor.appendChild(oddsActions);
      editor.appendChild(scoreTitle);
      editor.appendChild(scoreRow);
      editor.appendChild(scoreActions);
      editor.appendChild(cornerTitle);
      editor.appendChild(cornerRow);
      editor.appendChild(cornerActions);
      editor.appendChild(liveTitle);
      editor.appendChild(liveRow);
      editor.appendChild(betTitle);
      editor.appendChild(betRow);
      editor.appendChild(goalsTitle);
      editor.appendChild(goalsRows);
      editor.appendChild(goalsActions);
      editor.appendChild(closeBtn);
      card.appendChild(editor);
    }

    target.appendChild(card);
  });
}

function parseOdds(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [key, value] = line.split("=").map((part) => part.trim());
      const multiplier = Number(value);
      if (!key || !Number.isFinite(multiplier)) {
        return null;
      }
      return { key, multiplier };
    })
    .filter(Boolean);
}

function createOddsRow(key, multiplier) {
  const row = document.createElement("div");
  row.className = "odds-row";

  const keyInput = document.createElement("input");
  keyInput.type = "text";
  keyInput.placeholder = "key";
  keyInput.value = key || "";
  keyInput.className = "inline-input";

  const multiplierInput = document.createElement("input");
  multiplierInput.type = "number";
  multiplierInput.placeholder = "multiplier";
  multiplierInput.step = "0.01";
  multiplierInput.value = multiplier ?? "";
  multiplierInput.className = "inline-input";

  const removeBtn = document.createElement("button");
  removeBtn.className = "small-btn danger";
  removeBtn.textContent = "Remove";
  removeBtn.addEventListener("click", () => {
    row.remove();
  });

  row.appendChild(keyInput);
  row.appendChild(multiplierInput);
  row.appendChild(removeBtn);
  return row;
}

function collectOdds(container) {
  const rows = Array.from(container.querySelectorAll(".odds-row"));
  const odds = [];
  for (const row of rows) {
    const inputs = row.querySelectorAll("input");
    const key = inputs[0]?.value.trim();
    const multiplier = Number(inputs[1]?.value);
    if (!key || !Number.isFinite(multiplier)) {
      continue;
    }
    odds.push({ key, multiplier });
  }
  return odds;
}

function createGoalRow(scorer, team, minute) {
  const row = document.createElement("div");
  row.className = "goals-row";

  const scorerInput = document.createElement("input");
  scorerInput.type = "text";
  scorerInput.placeholder = "scorer";
  scorerInput.value = scorer || "";
  scorerInput.className = "inline-input";

  const teamInput = document.createElement("input");
  teamInput.type = "text";
  teamInput.placeholder = "team";
  teamInput.value = team || "";
  teamInput.className = "inline-input";

  const minuteInput = document.createElement("input");
  minuteInput.type = "number";
  minuteInput.placeholder = "minute";
  minuteInput.value = minute ?? "";
  minuteInput.className = "inline-input";

  const removeBtn = document.createElement("button");
  removeBtn.className = "small-btn danger";
  removeBtn.textContent = "Remove";
  removeBtn.addEventListener("click", () => {
    row.remove();
  });

  row.appendChild(scorerInput);
  row.appendChild(teamInput);
  row.appendChild(minuteInput);
  row.appendChild(removeBtn);
  return row;
}

function collectGoals(container) {
  const rows = Array.from(container.querySelectorAll(".goals-row"));
  const goals = [];
  for (const row of rows) {
    const inputs = row.querySelectorAll("input");
    const scorer = inputs[0]?.value.trim();
    const team = inputs[1]?.value.trim();
    const minuteValue = inputs[2]?.value;
    const minute = Number(minuteValue);
    if (!scorer || !team) {
      continue;
    }
    goals.push({
      scorer,
      team,
      minute: Number.isFinite(minute) ? minute : null
    });
  }
  return goals;
}

function renderUsers(users) {
  const target = document.getElementById("user-list");
  target.innerHTML = "";

  if (!users.length) {
    target.innerHTML = '<p class="card-meta">No users yet.</p>';
    return;
  }

  // If searching, push exact matches to top
  const searchInput = document.querySelector('input[name="searchUserName"]');
  let sortedUsers = users;
  if (searchInput && searchInput.value.trim()) {
    const searchVal = searchInput.value.trim().toLowerCase();
    sortedUsers = users.slice().sort((a, b) => {
      const aMatch = (a.userName || '').toLowerCase() === searchVal ? -1 : 0;
      const bMatch = (b.userName || '').toLowerCase() === searchVal ? -1 : 0;
      if (aMatch !== bMatch) return aMatch - bMatch;
      // Optionally, sort by balance or userId
      return 0;
    });
  }
  sortedUsers.forEach((user) => {
    const card = document.createElement("div");
    card.className = "card";

    const name = user.userName || "-";
    card.innerHTML = `
      <div class="card-title">${name}</div>
      <div class="card-meta">User ID: ${user.userId}</div>
      <div class="card-meta">Balance: <span class="user-balance">${user.balance}</span></div>
    `;

    const actions = document.createElement("div");
    actions.className = "actions";

    // Add balance button
    const addBtn = document.createElement("button");
    addBtn.textContent = "Add balance";
    addBtn.addEventListener("click", async () => {
      const amount = prompt("Amount to add (use negative to subtract)", "100");
      if (!amount) return;
      await fetch(`/api/users/${user.userId}/balance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount), userName: user.userName || "" })
      });
      // Optionally, update only this user
      await fetchUsers();
    });
    actions.appendChild(addBtn);

    // Update button
    const updateBtn = document.createElement("button");
    updateBtn.textContent = "Update";
    updateBtn.addEventListener("click", async () => {
      const newBalance = prompt("Set new balance", user.balance);
      if (newBalance === null || newBalance === "") return;
      await fetch(`/api/users/${user.userId}/balance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(newBalance) - Number(user.balance), userName: user.userName || "" })
      });
      await fetchUsers();
    });
    actions.appendChild(updateBtn);

    card.appendChild(actions);
    target.appendChild(card);
  });
}

function renderBetsLogs(bets) {
  const target = document.getElementById("logs-list");
  const filterInput = document.getElementById("logs-filter");
  const statusFilter = document.getElementById("logs-status-filter");

  if (!bets.length) {
    target.innerHTML = '<p class="card-meta">No bets logged yet.</p>';
    return;
  }

  // Filter bets based on search and status
  let filteredBets = bets;
  const searchTerm = (filterInput?.value || '').trim().toLowerCase();
  const statusValue = (statusFilter?.value || '').trim();

  if (searchTerm || statusValue) {
    filteredBets = bets.filter(bet => {
      const matchSearch = !searchTerm || 
        (bet.userName || '').toLowerCase().includes(searchTerm) ||
        (bet.userId || '').toLowerCase().includes(searchTerm) ||
        (bet.status || '').toLowerCase().includes(searchTerm);
      const matchStatus = !statusValue || bet.status === statusValue;
      return matchSearch && matchStatus;
    });
  }

  target.innerHTML = '';

  if (!filteredBets.length) {
    target.innerHTML = '<p class="card-meta">No matching bets found.</p>';
    return;
  }

  // Sort by createdAt descending (most recent first)
  filteredBets.sort((a, b) => {
    const dateA = new Date(a.createdAt || 0).getTime();
    const dateB = new Date(b.createdAt || 0).getTime();
    return dateB - dateA;
  });

  filteredBets.forEach((bet) => {
    const card = document.createElement("div");
    card.className = "card";

    const userName = bet.userName || bet.userId || "-";
    const matchInfo = bet.matchInfo ? `${bet.matchInfo.homeTeam} vs ${bet.matchInfo.awayTeam}` : "Match removed";
    const createdDate = new Date(bet.createdAt).toLocaleString();
    const statusColor = bet.status === "won" ? "#6ae4c5" : bet.status === "lost" ? "#ff6b6b" : "#f6c244";

    card.innerHTML = `
      <div class="card-title">${userName}</div>
      <div class="card-meta">User ID: ${bet.userId}</div>
      <div class="card-meta">Match: ${matchInfo}</div>
      <div class="card-meta">Pick: ${bet.pickKey}</div>
      <div class="card-meta">Amount: ${bet.amount} | Multiplier: x${bet.multiplier}</div>
      <div class="card-meta">Status: <span style="color: ${statusColor}">${bet.status.toUpperCase()}</span></div>
      <div class="card-meta">Payout: ${bet.payout || 0}</div>
      <div class="card-meta">Time: ${createdDate}</div>
    `;

    target.appendChild(card);
  });
}

const form = document.getElementById("create-form");
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(form);

  const payload = {
    homeTeam: formData.get("homeTeam"),
    awayTeam: formData.get("awayTeam"),
    stadium: formData.get("stadium"),
    kickoff: toKickoffIso(formData.get("kickoff")),
    odds: parseOdds(formData.get("odds"))
  };

  if (!payload.odds.length) {
    alert("Please add at least one odds line.");
    return;
  }

  await fetch("/api/matches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  form.reset();
  await fetchMatches();
});


const userSearchForm = document.getElementById("user-search-form");
userSearchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(userSearchForm);
  const searchUserName = formData.get("searchUserName").trim();
  if (!searchUserName) {
    alert("Please enter a username to search.");
    return;
  }
  // Fetch user by username (assuming API supports it)
  const res = await fetch(`/api/users?username=${encodeURIComponent(searchUserName)}`);
  const users = await res.json();
  renderUsers(users);
});

const broadcastForm = document.getElementById("broadcast-form");
broadcastForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(broadcastForm);
  const message = String(formData.get("message") || "").trim();
  const all = formData.get("all") === "on";

  if (!message) {
    alert("Please enter a message.");
    return;
  }

  if (!all) {
    alert("Please tick 'all' to send one message per guild.");
    return;
  }

  const response = await fetch("/api/admin/broadcast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, all })
  });

  const payload = await response.json();
  if (!response.ok) {
    alert(payload.error || "Broadcast failed.");
    return;
  }

  alert(`Broadcast done: sent ${payload.sent}/${payload.totalGuilds} guild(s).`);
  broadcastForm.reset();
});

// Setup logs filter
const logsFilterInput = document.getElementById("logs-filter");
const logsStatusFilter = document.getElementById("logs-status-filter");
if (logsFilterInput) {
  logsFilterInput.addEventListener("input", () => {
    fetchBetsLogs();
  });
}
if (logsStatusFilter) {
  logsStatusFilter.addEventListener("change", () => {
    fetchBetsLogs();
  });
}

Promise.all([fetchMatches(), fetchUsers(), fetchBetsLogs()]).catch((err) => {
  console.error(err);
});

setupTabs();
setupTeamStadiumAssist();
