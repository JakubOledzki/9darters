import type { MatchConfig, MatchPlayerState, MatchState, PlayerDescriptor, ThrowInput } from "../types.js";
export declare function createInitialMatchState(config: MatchConfig, players: PlayerDescriptor[], starterIndex?: number): MatchState;
export declare function pushThrow(state: MatchState, entry: ThrowInput): MatchState;
export declare function clearPendingThrows(state: MatchState): MatchState;
export declare function beginLiveMatch(state: MatchState): MatchState;
export declare function commitTurn(state: MatchState): MatchState;
export declare function getMatchWinner(state: MatchState): MatchPlayerState | null;
