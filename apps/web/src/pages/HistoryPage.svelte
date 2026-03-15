<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import { goto } from "../lib/router";

  let matches: Array<{
    id: string;
    name: string;
    mode: string;
    kind: string;
    status: string;
    playMode: "online" | "stationary";
  }> = [];
  let tournaments: Array<{
    id: string;
    name: string;
    status: string;
    playMode: "online" | "stationary";
  }> = [];
  let trainingSessions: Array<{ id: string; mode: string; updatedAt: string }> = [];

  function formatPlayMode(playMode: "online" | "stationary") {
    return playMode === "online" ? "online" : "stacjonarnie";
  }

  onMount(async () => {
    const data = await api<{
      matches: typeof matches;
      tournaments: typeof tournaments;
      trainingSessions: typeof trainingSessions;
    }>("/history");
    matches = data.matches;
    tournaments = data.tournaments;
    trainingSessions = data.trainingSessions;
  });
</script>

<section class="grid two">
  <article class="card stack">
    <h2>Historia meczow</h2>
    <div class="list">
      {#each matches as match}
        <button class="list-item" on:click={() => goto(`/match/${match.id}`)} type="button">
          <div class="inline item-head">
            {#if match.status === "live"}
              <span aria-hidden="true" class="live-indicator"></span>
            {/if}
            <strong>{match.name}</strong>
          </div>
          <span class="muted">{match.kind} | {match.mode} | {formatPlayMode(match.playMode)} | {match.status}</span>
        </button>
      {/each}
    </div>
  </article>

  <article class="card stack">
    <h2>Turnieje</h2>
    <div class="list">
      {#each tournaments as tournament}
        <button class="list-item" on:click={() => goto(`/tournament/${tournament.id}`)} type="button">
          <div class="inline item-head">
            {#if tournament.status === "live"}
              <span aria-hidden="true" class="live-indicator"></span>
            {/if}
            <strong>{tournament.name}</strong>
          </div>
          <span class="muted">{formatPlayMode(tournament.playMode)} | {tournament.status}</span>
        </button>
      {/each}
    </div>
  </article>
</section>

<section class="card stack">
  <h2>Sesje treningowe</h2>
  <div class="list">
    {#each trainingSessions as sessionItem}
      <div class="list-item">
        <strong>{sessionItem.mode}</strong>
        <span class="muted">{sessionItem.updatedAt}</span>
      </div>
    {/each}
  </div>
</section>
