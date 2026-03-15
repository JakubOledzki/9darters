export function calculateExpectedScore(playerRating: number, opponentRating: number) {
  return 1 / (1 + 10 ** ((opponentRating - playerRating) / 400));
}

export function calculateRatingDelta(playerRating: number, opponentRating: number) {
  const expected = calculateExpectedScore(playerRating, opponentRating);
  return Math.max(2, Math.round(20 * (1 - expected)));
}

export function applyMatchRating(
  winnerRating: number,
  loserRating: number
): {
  delta: number;
  winnerAfter: number;
  loserAfter: number;
} {
  const delta = calculateRatingDelta(winnerRating, loserRating);
  return {
    delta,
    winnerAfter: winnerRating + delta,
    loserAfter: loserRating - delta
  };
}
