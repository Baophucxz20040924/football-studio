const { spawn } = require("child_process");
const { stopPorts } = require("./stop-all");

require("dotenv").config();

const npmCommand = "npm";

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

  child.on("error", (error) => {
    console.error(`[${name}] failed to start`, error);
  });

  child.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.error(`[${name}] exited with code ${code}`);
      process.exitCode = code;
    }
  });

  return child;
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
  const bot = runBackground("node", ["src/index.js"], "bot", {
    env: botMongoUri ? { MONGODB_URI: botMongoUri } : undefined,
  });
  const tienlen = runBackground(
    npmCommand,
    ["run", "start", "--prefix", "src/tienlen/server"],
    "tienlen-server",
    {
      shell: true,
      env: tienLenMongoUri ? { MONGODB_URI: tienLenMongoUri } : undefined,
    }
  );
  const webNetManager = runBackground(
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

  const shutdown = () => {
    bot.kill("SIGINT");
    tienlen.kill("SIGINT");
    webNetManager.kill("SIGINT");
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("[start-all] Failed:", error.message);
  process.exit(1);
});
