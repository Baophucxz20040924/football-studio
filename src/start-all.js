const { spawn } = require("child_process");
const { stopPorts } = require("./stop-all");

require("dotenv").config();

const npmCommand = "npm";
const children = new Map();
let shuttingDown = false;

function runAndWait(command, args, { shell = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} failed with code ${code}`));
      }
    });
  });
}

function runBackground(command, args, name, { shell = false, env = undefined } = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell,
    env: env ? { ...process.env, ...env } : process.env
  });
  children.set(name, child);

  child.on("error", (error) => {
    console.error(`[${name}] failed to start`, error);
    shutdown(1);
  });

  child.on("exit", (code, signal) => {
    children.delete(name);
    if (shuttingDown) {
      return;
    }

    if (code !== null && code !== 0) {
      console.error(`[${name}] exited with code ${code}`);
      shutdown(code);
      return;
    }

    if (signal) {
      console.error(`[${name}] exited from signal ${signal}`);
      shutdown(1);
      return;
    }

    console.error(`[${name}] exited unexpectedly.`);
    shutdown(1);
  });

  return child;
}

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const child of children.values()) {
    if (!child.killed) {
      child.kill("SIGINT");
    }
  }

  setTimeout(() => {
    process.exit(exitCode);
  }, 1_500).unref();
}

async function main() {
  const botPort = Number(process.env.PORT || 3000);
  const tienlenPort = Number(process.env.TIENLEN_PORT || 3001);
  const webNetManagerPort = Number(process.env.WEB_NET_MANAGER_PORT || 5000);
  const botMongoUri = process.env.BOT_MONGODB_URI || process.env.MONGODB_URI;
  const tienLenMongoUri = process.env.TIENLEN_MONGODB_URI || botMongoUri;
  const webNetManagerMongoUri = process.env.WEB_NET_MANAGER_MONGODB_URI || "mongodb://admin:admin123@localhost:27017/football-net?authSource=admin";
  const webNetManagerUseMongo = process.env.WEB_NET_MANAGER_USE_MONGODB || process.env.USE_MONGODB || "true";
  const hasSkipBuildArg = process.argv.includes("--skip-build");
  const skipTienLenBuild = ["1", "true", "yes"].includes(
    String(process.env.SKIP_TIENLEN_BUILD || "").toLowerCase()
  ) || hasSkipBuildArg;

  console.log(`[start-all] Releasing ports ${botPort}, ${tienlenPort} and ${webNetManagerPort} (if in use)...`);
  await stopPorts([botPort, tienlenPort, webNetManagerPort], { silent: true });

  if (skipTienLenBuild) {
    console.log("[start-all] SKIP_TIENLEN_BUILD is enabled. Skipping Tien Len frontend build.");
  } else {
    console.log("[start-all] Building Tien Len frontend...");
    await runAndWait(npmCommand, ["run", "build", "--prefix", "src/tienlen/server/client"], {
      shell: true,
    });
  }

  console.log("[start-all] Starting bot, Tien Len server, and web-net-manager...");
  runBackground("node", ["src/index.js"], "bot", {
    env: botMongoUri ? { MONGODB_URI: botMongoUri } : undefined,
  });
  runBackground(
    npmCommand,
    ["run", "start", "--prefix", "src/tienlen/server"],
    "tienlen-server",
    {
      shell: true,
      env: tienLenMongoUri ? { MONGODB_URI: tienLenMongoUri } : undefined,
    }
  );
  runBackground(
    npmCommand,
    ["run", "start", "--prefix", "web-net-manager"],
    "web-net-manager",
    {
      shell: true,
      env: {
        PORT: String(webNetManagerPort),
        MONGODB_URI: webNetManagerMongoUri,
        USE_MONGODB: webNetManagerUseMongo,
      },
    }
  );

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));
}

main().catch((error) => {
  console.error("[start-all] Failed:", error.message);
  process.exit(1);
});
