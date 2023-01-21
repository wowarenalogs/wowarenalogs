export const STATS_SCHEMA_VERSION = 3;

export const getWinRateCorrectionFactor = (totalWin: number, totalLose: number) => {
  const actualWinRate = totalWin / (totalWin + totalLose);

  // We correct the reported overall win rate to be 50% in order to adjust for uploader's win rate bias.
  // actualWinRate * correctionFactor = 0.5
  // correctionFactor = 0.5 / actualWinRate
  return 0.5 / actualWinRate;
};
