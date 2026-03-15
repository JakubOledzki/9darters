export function calculateExpectedScore(playerRating, opponentRating) {
    return 1 / (1 + 10 ** ((opponentRating - playerRating) / 400));
}
export function calculateRatingDelta(playerRating, opponentRating) {
    const expected = calculateExpectedScore(playerRating, opponentRating);
    return Math.max(2, Math.round(20 * (1 - expected)));
}
export function applyMatchRating(winnerRating, loserRating) {
    const delta = calculateRatingDelta(winnerRating, loserRating);
    return {
        delta,
        winnerAfter: winnerRating + delta,
        loserAfter: loserRating - delta
    };
}
//# sourceMappingURL=rating.js.map