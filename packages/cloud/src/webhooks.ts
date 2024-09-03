import { CombatUnitType, IArenaMatch, IShuffleMatch } from '../../parser/dist/index';

const webhookUrl = process.env.ENV_WEBHOOK_URL;
const webhookSignature = process.env.ENV_WEBHOOK_SIGNATURE || 'unsigned';

type WebhookStub = {
  dataType: 'ArenaMatch' | 'ShuffleMatch';
  id: string;
  link: string | string[]; // string for match, string[] for shuffle
  startInfo: {
    timestamp: number;
    zoneId: string;
    bracket: string;
    isRanked: boolean;
  };
  endInfo: {
    winnindTeamId: string;
    timestamp: number;
    matchDurationInSeconds: number;
    team0MMR: number;
    team1MMR: number;
  };
  playerId: string;
  playerTeamId: string;
  result: number; // 0=unknown 1=Draw 2=Lose 3=Win; See: parser type CombatResult
  combatants: {
    id: string;
    name: string;
    specId: string | undefined;
    classId: number | undefined;
    teamId: string | undefined;
  }[];

  // Shuffle only
  roundResults?: number[] | undefined;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const stubsWebhookArenaMatchAsync = async (match: IArenaMatch) => {
  if (!webhookUrl || webhookUrl === 'disabled') return;
  const whStub: WebhookStub = {
    dataType: match.dataType,
    id: match.id,
    playerId: match.playerId,
    playerTeamId: match.playerTeamId,
    result: match.result,
    startInfo: {
      timestamp: match.startInfo.timestamp,
      zoneId: match.startInfo.zoneId,
      bracket: match.startInfo.bracket,
      isRanked: match.startInfo.isRanked,
    },
    endInfo: {
      winnindTeamId: match.endInfo.winningTeamId,
      timestamp: match.endInfo.timestamp,
      matchDurationInSeconds: match.endInfo.matchDurationInSeconds,
      team0MMR: match.endInfo.team0MMR,
      team1MMR: match.endInfo.team1MMR,
    },
    link: `https://wowarenalogs.com/match?id=${match.id}&viewerIsOwner=false&source=webhook`,
    combatants: Object.values(match.units)
      .filter((u) => u.type === CombatUnitType.Player)
      .map((c) => ({
        id: c.id,
        name: c.name,
        specId: c.info?.specId,
        classId: c.class,
        teamId: c.info?.teamId,
      })),
  };

  return Promise.race([
    fetch(webhookUrl, {
      method: 'POST',
      body: JSON.stringify(whStub),
      headers: [['x-webhook-signature', webhookSignature]],
    }),
    sleep(1000),
  ]);
};

export const stubsWebhookShuffleMatchAsync = async (match: IShuffleMatch) => {
  if (!webhookUrl || webhookUrl === 'disabled') return;
  const whStub: WebhookStub = {
    dataType: match.dataType,
    id: match.id,
    playerId: match.rounds[0].playerId,
    playerTeamId: match.rounds[0].playerTeamId,
    result: match.result,
    startInfo: {
      timestamp: match.startInfo.timestamp,
      zoneId: match.startInfo.zoneId,
      bracket: match.startInfo.bracket,
      isRanked: match.startInfo.isRanked,
    },
    endInfo: {
      winnindTeamId: match.endInfo.winningTeamId,
      timestamp: match.endInfo.timestamp,
      matchDurationInSeconds: match.endInfo.matchDurationInSeconds,
      team0MMR: match.endInfo.team0MMR,
      team1MMR: match.endInfo.team1MMR,
    },
    link: match.rounds.map(
      (_r, idx) =>
        `https://wowarenalogs.com/match?id=${match.id}&viewerIsOwner=false&source=webhook&roundId=${idx + 1}`,
    ),
    roundResults: match.rounds.map((r) => r.result),
    combatants: Object.values(match.rounds[0].units)
      .filter((u) => u.type === CombatUnitType.Player)
      .map((c) => ({
        id: c.id,
        name: c.name,
        specId: c.info?.specId,
        classId: c.class,
        teamId: c.info?.teamId,
      })),
  };

  return Promise.race([
    fetch(webhookUrl, {
      method: 'POST',
      body: JSON.stringify(whStub),
      headers: [['x-webhook-signature', webhookSignature]],
    }),
    sleep(1000),
  ]);
};
