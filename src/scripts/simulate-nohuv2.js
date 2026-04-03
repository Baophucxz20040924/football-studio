const { simulateNohuV2Round } = require("../discord/commands/nohuv2");

function formatNumber(value) {
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function percentile(sorted, p) {
  if (sorted.length === 0) {
    return 0;
  }

  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[index];
}

function runSimulation(spins, bet) {
  const rounds = [];

  for (let i = 0; i < spins; i += 1) {
    rounds.push(simulateNohuV2Round(bet));
  }

  const totalBet = spins * bet;
  const totalPayout = rounds.reduce((sum, round) => sum + round.totalPayout, 0);
  const totalNet = rounds.reduce((sum, round) => sum + round.net, 0);
  const winCount = rounds.filter((round) => round.net > 0).length;
  const loseCount = rounds.filter((round) => round.net < 0).length;
  const evenCount = rounds.filter((round) => round.net === 0).length;
  const jackpotRounds = rounds.filter((round) => round.jackpotClusterCount > 0).length;
  const maxWin = rounds.reduce((max, round) => Math.max(max, round.net), Number.NEGATIVE_INFINITY);
  const maxLoss = rounds.reduce((min, round) => Math.min(min, round.net), Number.POSITIVE_INFINITY);

  const netSorted = rounds.map((round) => round.net).sort((a, b) => a - b);
  const cascadesSorted = rounds.map((round) => round.totalCascades).sort((a, b) => a - b);

  const avgCascade = rounds.reduce((sum, round) => sum + round.totalCascades, 0) / spins;
  const avgCombo = rounds.reduce((sum, round) => sum + round.totalCombos, 0) / spins;

  console.log("=== NOHUV2 SIMULATION ===");
  console.log(`Spins: ${spins}`);
  console.log(`Bet per spin: ${formatNumber(bet)}`);
  console.log(`Total bet: ${formatNumber(totalBet)}`);
  console.log(`Total payout: ${formatNumber(totalPayout)}`);
  console.log(`RTP: ${formatNumber((totalPayout / totalBet) * 100)}%`);
  console.log(`House edge: ${formatNumber((1 - (totalPayout / totalBet)) * 100)}%`);
  console.log(`Total net: ${formatNumber(totalNet)}`);
  console.log(`Average net / spin: ${formatNumber(totalNet / spins)}`);
  console.log(`Win / Lose / Even: ${winCount} / ${loseCount} / ${evenCount}`);
  console.log(`Win rate: ${formatNumber((winCount / spins) * 100)}%`);
  console.log(`Jackpot rounds: ${jackpotRounds} (${formatNumber((jackpotRounds / spins) * 100)}%)`);
  console.log(`Max win (single spin): ${formatNumber(maxWin)}`);
  console.log(`Max loss (single spin): ${formatNumber(maxLoss)}`);
  console.log(`Average cascades: ${formatNumber(avgCascade)}`);
  console.log(`Average combos: ${formatNumber(avgCombo)}`);
  console.log(`Median net: ${formatNumber(percentile(netSorted, 0.5))}`);
  console.log(`P90 net: ${formatNumber(percentile(netSorted, 0.9))}`);
  console.log(`P95 net: ${formatNumber(percentile(netSorted, 0.95))}`);
  console.log(`P99 net: ${formatNumber(percentile(netSorted, 0.99))}`);
  console.log(`Median cascades: ${formatNumber(percentile(cascadesSorted, 0.5))}`);
}

const spins = Number(process.argv[2] || 100);
const bet = Number(process.argv[3] || 1000);

if (!Number.isFinite(spins) || spins <= 0) {
  console.error("Invalid spins. Usage: node src/scripts/simulate-nohuv2.js <spins> <bet>");
  process.exit(1);
}

if (!Number.isFinite(bet) || bet <= 0) {
  console.error("Invalid bet. Usage: node src/scripts/simulate-nohuv2.js <spins> <bet>");
  process.exit(1);
}

runSimulation(Math.floor(spins), Math.floor(bet));
