const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

async function listListeningPidsWindows(targetPorts) {
  const { stdout } = await execFileAsync("netstat", ["-ano", "-p", "tcp"]);
  const pids = new Set();

  for (const line of stdout.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) {
      continue;
    }

    const proto = parts[0].toUpperCase();
    const localAddress = parts[1];
    const state = parts[3]?.toUpperCase();
    const pid = parts[4];

    if (proto !== "TCP" || state !== "LISTENING") {
      continue;
    }

    const portStr = localAddress.split(":").pop();
    const port = Number(portStr);
    if (Number.isFinite(port) && targetPorts.includes(port) && Number(pid) > 0) {
      pids.add(Number(pid));
    }
  }

  return [...pids];
}

async function listListeningPidsUnix(targetPorts) {
  const pids = new Set();

  for (const port of targetPorts) {
    try {
      const { stdout } = await execFileAsync("lsof", ["-ti", `tcp:${port}`]);
      for (const raw of stdout.split(/\r?\n/)) {
        const pid = Number(raw.trim());
        if (Number.isFinite(pid) && pid > 0) {
          pids.add(pid);
        }
      }
    } catch {
      // Ignore: no process is listening on this port
    }
  }

  return [...pids];
}

async function killPid(pid) {
  if (pid === process.pid) {
    return;
  }

  if (process.platform === "win32") {
    await execFileAsync("taskkill", ["/PID", String(pid), "/F"]);
    return;
  }

  process.kill(pid, "SIGTERM");
}

async function stopPorts(ports, { silent = false } = {}) {
  const uniquePorts = [...new Set(ports.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0))];
  if (uniquePorts.length === 0) {
    return [];
  }

  const pids = process.platform === "win32"
    ? await listListeningPidsWindows(uniquePorts)
    : await listListeningPidsUnix(uniquePorts);

  const killed = [];
  for (const pid of pids) {
    try {
      await killPid(pid);
      killed.push(pid);
    } catch {
      // Ignore individual kill failures
    }
  }

  if (!silent) {
    if (killed.length) {
      console.log(`[stop-all] Killed PIDs on ports ${uniquePorts.join(", ")}: ${killed.join(", ")}`);
    } else {
      console.log(`[stop-all] No running process found on ports ${uniquePorts.join(", ")}`);
    }
  }

  return killed;
}

async function runFromCli() {
  require("dotenv").config();
  const botPort = Number(process.env.PORT || 3000);
  const tienlenPort = Number(process.env.TIENLEN_PORT || 3001);
  await stopPorts([botPort, tienlenPort]);
}

if (require.main === module) {
  runFromCli().catch((error) => {
    console.error("[stop-all] Failed:", error.message);
    process.exit(1);
  });
}

module.exports = {
  stopPorts,
};
