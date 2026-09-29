export const teeResults = ["in_play", "left", "right", "ob", "water"] as const;
export type TeeResult = (typeof teeResults)[number];

export const shotResults = ["good", "left", "right", "short", "long", "top", "fat", "thin", "ob", "water", "other"] as const;
export type ShotResult = (typeof shotResults)[number];

export type RoundShot = {
  id: string;
  shotNumber: number;
  club: string;
  result: ShotResult;
  distance?: number;
  penaltyStrokes: number;
  notes?: string;
};

export type PlayerHoleStat = {
  playerId: string;
  score: number | null;
  putts: number | null;
  teeResult: TeeResult | null;
  penalties: number;
  completed: boolean;
  shots: RoundShot[];
};

export type RoundHole = {
  hole: number;
  par: number;
  score: number | null;
  distance?: number;
  playerStats?: PlayerHoleStat[];
};

export type RoundPlayer = {
  id: string;
  name: string;
  scores: (number | null)[];
};

export type RoundStatus = "setup" | "active" | "complete";

export type RoundRecord = {
  id: string;
  kind: "round";
  title: string;
  date: string;
  notes: string;
  category: string;
  done: boolean;
  holeCount: "9" | "18";
  roundHoles: RoundHole[];
  players?: RoundPlayer[];
  teeName?: string;
  status?: RoundStatus;
  activeHole?: number;
  startedAt?: string;
  completedAt?: string;
  clientUpdatedAt?: string;
};

export type RoundSummary = {
  holesCompleted: number;
  totalScore: number;
  totalPar: number;
  toPar: number;
  totalPutts: number;
  holesWithPutts: number;
  threePutts: number;
  penalties: number;
  teeShotsTracked: number;
  teeInPlay: number;
  teeLeft: number;
  teeRight: number;
  teeOb: number;
  teeWater: number;
  blowUpHoles: number;
  penaltiesByClub: Record<string, number>;
  parAverages: Record<3 | 4 | 5, number | null>;
};

const emptyStat = (playerId: string, score: number | null): PlayerHoleStat => ({
  playerId,
  score,
  putts: null,
  teeResult: null,
  penalties: 0,
  completed: score !== null,
  shots: [],
});

export function hydrateRound(round: RoundRecord): RoundRecord {
  const count = Number(round.holeCount);
  const players = round.players?.length
    ? round.players.map((player) => ({
        ...player,
        scores: Array.from({ length: count }, (_, index) => player.scores[index] ?? null),
      }))
    : [{ id: "legacy-primary", name: "Me", scores: Array.from({ length: count }, (_, index) => round.roundHoles[index]?.score ?? null) }];

  const roundHoles = Array.from({ length: count }, (_, index) => {
    const existing = round.roundHoles[index] ?? { hole: index + 1, par: 4, score: null };
    const playerStats = players.map((player, playerIndex) => {
      const stat = existing.playerStats?.find((item) => item.playerId === player.id);
      const score = stat?.score ?? player.scores[index] ?? (playerIndex === 0 ? existing.score : null) ?? null;
      return stat
        ? { ...emptyStat(player.id, score), ...stat, playerId: player.id, score, shots: stat.shots?.map((shot) => ({ ...shot })) ?? [] }
        : emptyStat(player.id, score);
    });
    return { ...existing, hole: index + 1, score: playerStats[0]?.score ?? null, playerStats };
  });

  return { ...round, players, roundHoles, status: round.status ?? inferRoundStatus({ ...round, players, roundHoles }) };
}

export function inferRoundStatus(round: RoundRecord): RoundStatus {
  if (round.status) return round.status;
  const hydratedScores = round.players?.length
    ? round.players.flatMap((player) => player.scores)
    : round.roundHoles.map((hole) => hole.score);
  return hydratedScores.length > 0 && hydratedScores.every((score) => score !== null) ? "complete" : "active";
}

export function getPlayerHoleStat(round: RoundRecord, holeIndex: number, playerId: string) {
  return round.roundHoles[holeIndex]?.playerStats?.find((stat) => stat.playerId === playerId);
}

export function updatePlayerHole(
  source: RoundRecord,
  holeIndex: number,
  playerId: string,
  patch: Partial<Omit<PlayerHoleStat, "playerId">>,
) {
  const round = hydrateRound(source);
  const roundHoles = round.roundHoles.map((hole, index) => {
    if (index !== holeIndex) return hole;
    const playerStats = (hole.playerStats ?? []).map((stat) => stat.playerId === playerId ? { ...stat, ...patch } : stat);
    return { ...hole, playerStats, score: playerStats[0]?.score ?? null };
  });
  const players = (round.players ?? []).map((player) => ({
    ...player,
    scores: player.scores.map((score, index) => index === holeIndex
      ? roundHoles[holeIndex].playerStats?.find((stat) => stat.playerId === player.id)?.score ?? null
      : score),
  }));
  return { ...round, roundHoles, players, clientUpdatedAt: new Date().toISOString() };
}

export function attributedPenaltyStrokes(shots: RoundShot[]) {
  return shots.reduce((sum, shot) => sum + shot.penaltyStrokes, 0);
}

export function reconcileHolePenalties(currentTotal: number, previousShots: RoundShot[], nextShots: RoundShot[]) {
  const previousAttributed = attributedPenaltyStrokes(previousShots);
  const nextAttributed = attributedPenaltyStrokes(nextShots);
  return currentTotal === previousAttributed ? nextAttributed : Math.max(currentTotal, nextAttributed);
}

export function calculateRoundSummary(source: RoundRecord, playerId?: string): RoundSummary {
  const round = hydrateRound(source);
  const selectedPlayer = playerId ?? round.players?.[0]?.id ?? "legacy-primary";
  const played = round.roundHoles.flatMap((hole, index) => {
    const stat = getPlayerHoleStat(round, index, selectedPlayer);
    return stat?.completed && stat.score !== null ? [{ hole, stat }] : [];
  });
  const parScores = (par: 3 | 4 | 5) => played.filter(({ hole }) => hole.par === par).map(({ stat }) => stat.score!);
  const teeStats = played.flatMap(({ hole, stat }) => hole.par > 3 && stat.teeResult ? [stat.teeResult] : []);
  const puttStats = played.flatMap(({ stat }) => stat.putts === null ? [] : [stat.putts]);
  const totalScore = played.reduce((sum, { stat }) => sum + stat.score!, 0);
  const totalPar = played.reduce((sum, { hole }) => sum + hole.par, 0);
  const penaltiesByClub = played.flatMap(({ stat }) => stat.shots).reduce<Record<string, number>>((totals, shot) => {
    if (shot.penaltyStrokes > 0 && shot.club.trim()) totals[shot.club] = (totals[shot.club] ?? 0) + shot.penaltyStrokes;
    return totals;
  }, {});
  const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return {
    holesCompleted: played.length,
    totalScore,
    totalPar,
    toPar: totalScore - totalPar,
    totalPutts: puttStats.reduce((sum, value) => sum + value, 0),
    holesWithPutts: puttStats.length,
    threePutts: puttStats.filter((value) => value >= 3).length,
    penalties: played.reduce((sum, { stat }) => sum + stat.penalties, 0),
    teeShotsTracked: teeStats.length,
    teeInPlay: teeStats.filter((value) => value === "in_play").length,
    teeLeft: teeStats.filter((value) => value === "left").length,
    teeRight: teeStats.filter((value) => value === "right").length,
    teeOb: teeStats.filter((value) => value === "ob").length,
    teeWater: teeStats.filter((value) => value === "water").length,
    blowUpHoles: played.filter(({ hole, stat }) => stat.score! - hole.par >= 3).length,
    penaltiesByClub,
    parAverages: { 3: average(parScores(3)), 4: average(parScores(4)), 5: average(parScores(5)) },
  };
}
