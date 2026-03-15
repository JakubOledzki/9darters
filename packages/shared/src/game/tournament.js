export function generateRoundRobinPairings(participantIds) {
    const participants = [...participantIds];
    if (participants.length < 2) {
        return [];
    }
    if (participants.length % 2 === 1) {
        participants.push("__bye__");
    }
    const rounds = participants.length - 1;
    const half = participants.length / 2;
    const rotation = [...participants];
    const pairings = [];
    for (let round = 0; round < rounds; round += 1) {
        for (let slot = 0; slot < half; slot += 1) {
            const home = rotation[slot];
            const away = rotation[rotation.length - 1 - slot];
            if (home !== "__bye__" && away !== "__bye__") {
                pairings.push({
                    round: round + 1,
                    homeParticipantId: round % 2 === 0 ? home : away,
                    awayParticipantId: round % 2 === 0 ? away : home
                });
            }
        }
        const fixed = rotation[0];
        const rest = rotation.slice(1);
        rest.unshift(rest.pop());
        rotation.splice(0, rotation.length, fixed, ...rest);
    }
    return pairings;
}
function compareHeadToHead(left, right, matches) {
    const head = matches.find((match) => {
        const participants = [match.homeParticipantId, match.awayParticipantId];
        return (participants.includes(left.participantId) &&
            participants.includes(right.participantId) &&
            match.status === "finished");
    });
    if (!head?.winnerParticipantId) {
        return 0;
    }
    if (head.winnerParticipantId === left.participantId) {
        return -1;
    }
    if (head.winnerParticipantId === right.participantId) {
        return 1;
    }
    return 0;
}
export function buildTournamentStandings(participantIds, matches) {
    const table = new Map();
    for (const participantId of participantIds) {
        table.set(participantId, {
            participantId,
            wins: 0,
            losses: 0,
            legsDiff: 0,
            setsDiff: 0,
            average: 0,
            played: 0
        });
    }
    for (const match of matches.filter((entry) => entry.status === "finished")) {
        const home = table.get(match.homeParticipantId);
        const away = table.get(match.awayParticipantId);
        if (!home || !away) {
            continue;
        }
        home.played += 1;
        away.played += 1;
        home.legsDiff += match.homeLegs - match.awayLegs;
        away.legsDiff += match.awayLegs - match.homeLegs;
        home.setsDiff += match.homeSets - match.awaySets;
        away.setsDiff += match.awaySets - match.homeSets;
        home.average = ((home.average * (home.played - 1)) + match.homeAverage) / home.played;
        away.average = ((away.average * (away.played - 1)) + match.awayAverage) / away.played;
        if (match.winnerParticipantId === home.participantId) {
            home.wins += 1;
            away.losses += 1;
        }
        else if (match.winnerParticipantId === away.participantId) {
            away.wins += 1;
            home.losses += 1;
        }
    }
    return [...table.values()].sort((left, right) => {
        if (right.wins !== left.wins) {
            return right.wins - left.wins;
        }
        const headToHead = compareHeadToHead(left, right, matches);
        if (headToHead !== 0) {
            return headToHead;
        }
        if (right.legsDiff !== left.legsDiff) {
            return right.legsDiff - left.legsDiff;
        }
        if (right.setsDiff !== left.setsDiff) {
            return right.setsDiff - left.setsDiff;
        }
        return right.average - left.average;
    });
}
//# sourceMappingURL=tournament.js.map