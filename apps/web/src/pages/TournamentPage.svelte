<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import { goto } from "../lib/router";

  export let id: string;
  export let user: { id: string; nickname: string };

  let tournament:
    | {
        id: string;
        name: string;
        status: string;
        mode: string;
        playMode: "online" | "stationary";
        isRanking: boolean;
      }
    | null = null;
  let participants: Array<{ id: string; userId?: string; displayName: string; status: string }> = [];
  let standings: Array<{ participantId: string; wins: number; losses: number; legsDiff: number; setsDiff: number; average: number }> = [];
  let nextMatchId = "";
  let error = "";

  $: ownParticipant = participants.find((participant) => participant.userId === user.id);
  $: podium = standings.slice(0, 3);
  $: canAcceptTournament = Boolean(tournament && ownParticipant?.status === "pending" && tournament.status === "pending");

  function formatPlayMode(playMode: "online" | "stationary") {
    return playMode === "online" ? "online" : "stacjonarnie";
  }

  function getPlace(index: number) {
    return index + 1;
  }

  async function loadTournament() {
    try {
      const data = await api<{
        tournament: typeof tournament;
        participants: typeof participants;
        standings: typeof standings;
      }>(`/tournaments/${id}`);
      tournament = data.tournament;
      participants = data.participants;
      standings = data.standings;

      const next = await api<{ match: { id: string } }>(`/tournaments/${id}/next-match`).catch(() => null);
      nextMatchId = next?.match.id ?? "";
    } catch (event) {
      error = (event as { error?: string }).error ?? "Nie udalo sie pobrac turnieju.";
    }
  }

  onMount(() => {
    void loadTournament();

    const refreshTimer = window.setInterval(() => {
      if (tournament?.status !== "finished") {
        void loadTournament();
      }
    }, 5000);

    return () => {
      window.clearInterval(refreshTimer);
    };
  });

  async function acceptTournament() {
    try {
      await api(`/tournaments/${id}/accept`, {
        method: "POST",
        body: JSON.stringify({})
      });
      await loadTournament();
    } catch (event) {
      error = (event as { error?: string }).error ?? "Nie udalo sie potwierdzic turnieju.";
    }
  }
</script>

{#if tournament}
  <section class="hero">
    <div class="stack">
      <div class="inline">
        <span class="pill">{tournament.mode}</span>
        <span class="pill">{formatPlayMode(tournament.playMode)}</span>
        <span class="pill">{tournament.status}</span>
        {#if tournament.status === "live"}
          <span class="pill"><span aria-hidden="true" class="live-indicator"></span> Live</span>
        {/if}
      </div>
      <h1>{tournament.name}</h1>
      <p>
        Turniej round-robin dla maksymalnie 12 graczy. Kazdy mecz 1v1 jest osobnym spotkaniem i moze aktualizowac
        ranking.
      </p>
    </div>

    <div class="card stack">
      <div class="inline">
        <span class="pill">{participants.length} uczestnikow</span>
        <span class="pill">{tournament.isRanking ? "Rankingowy" : "Towarzyski"}</span>
      </div>
      {#if canAcceptTournament}
        <button class="primary" on:click={acceptTournament} type="button">Potwierdz udzial</button>
      {/if}
      {#if nextMatchId}
        <button class="primary" on:click={() => goto(`/match/${nextMatchId}`)} type="button">Przejdz do kolejnego meczu</button>
      {/if}
    </div>
  </section>

  <section class="grid two">
    <article class="card stack">
      <h2>Uczestnicy</h2>
      <div class="list">
        {#each participants as participant}
          <div class="list-item">
            <strong>{participant.displayName}</strong>
            <span class="muted">{participant.status}</span>
          </div>
        {/each}
      </div>
    </article>

    <article class="card stack">
      <h2>Podium</h2>
      <div class="podium-grid">
        {#each podium as standing, index}
          <div class={`podium-card place-${getPlace(index)}`}>
            <span class={`place-badge place-${getPlace(index)}`}>{getPlace(index)}</span>
            <strong>{participants.find((item) => item.id === standing.participantId)?.displayName ?? standing.participantId}</strong>
            <span class="muted">W {standing.wins} | L {standing.losses}</span>
            <span class="muted">Avg {standing.average.toFixed(2).replace(".", ",")}</span>
          </div>
        {/each}
      </div>
    </article>
  </section>

  <section class="card stack">
    <article class="stack">
      <h2>Tabela</h2>
      <div class="list">
        {#each standings as standing, index}
          <div class="list-item">
            <div class="inline item-head">
              {#if getPlace(index) <= 3}
                <span class={`place-badge place-${getPlace(index)}`}>{getPlace(index)}</span>
              {/if}
              <strong>#{index + 1} | {participants.find((item) => item.id === standing.participantId)?.displayName ?? standing.participantId}</strong>
            </div>
            <span class="muted">W {standing.wins} | L {standing.losses} | Legi {standing.legsDiff} | Sety {standing.setsDiff}</span>
            <span class="muted">Avg {standing.average.toFixed(2).replace(".", ",")}</span>
          </div>
        {/each}
      </div>
    </article>
  </section>
{:else}
  <section class="card stack">
    <h2>Ladowanie turnieju</h2>
    {#if error}
      <div class="alert">{error}</div>
    {/if}
  </section>
{/if}
