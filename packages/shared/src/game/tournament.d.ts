import type { TournamentMatchSummary, TournamentPairing, TournamentStanding } from "../types.js";
export declare function generateRoundRobinPairings(participantIds: string[]): TournamentPairing[];
export declare function buildTournamentStandings(participantIds: string[], matches: TournamentMatchSummary[]): TournamentStanding[];
