export declare function calculateExpectedScore(playerRating: number, opponentRating: number): number;
export declare function calculateRatingDelta(playerRating: number, opponentRating: number): number;
export declare function applyMatchRating(winnerRating: number, loserRating: number): {
    delta: number;
    winnerAfter: number;
    loserAfter: number;
};
