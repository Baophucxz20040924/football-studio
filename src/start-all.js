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

function runBackground(command, args, name, { shell = false } = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell
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
  const hasSkipBuildArg = process.argv.includes("--skip-build");
  const skipTienLenBuild = ["1", "true", "yes"].includes(
    String(process.env.SKIP_TIENLEN_BUILD || "").toLowerCase()
  ) || hasSkipBuildArg;

  console.log(`[start-all] Releasing ports ${botPort} and ${tienlenPort} (if in use)...`);
  await stopPorts([botPort, tienlenPort], { silent: true });

  if (skipTienLenBuild) {
    console.log("[start-all] SKIP_TIENLEN_BUILD is enabled. Skipping Tien Len frontend build.");
  } else {
    console.log("[start-all] Building Tien Len frontend...");
    await runAndWait(npmCommand, ["run", "build", "--prefix", "src/tienlen/server/client"], {
      shell: true,
    });
  }

  console.log("[start-all] Starting bot and Tien Len server...");
  const bot = runBackground("node", ["src/index.js"], "bot");
  const tienlen = runBackground(
    npmCommand,
    ["run", "start", "--prefix", "src/tienlen/server"],
    "tienlen-server",
    { shell: true }
  );

  const shutdown = () => {
    bot.kill("SIGINT");
    tienlen.kill("SIGINT");
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("[start-all] Failed:", error.message);
  process.exit(1);
});
