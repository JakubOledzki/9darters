export type AcceptanceParticipant = {
  userId: string | null;
  status: string;
};

export function areAllParticipantsAccepted(participants: AcceptanceParticipant[]) {
  return participants.every((participant) => participant.userId === null || participant.status === "accepted");
}

export function isPreStartMatchStatus(status: string) {
  return status === "pending" || status === "accepted";
}

export function isResolvedMatchStatus(status: string) {
  return status === "ready" || status === "live" || status === "finished";
}
