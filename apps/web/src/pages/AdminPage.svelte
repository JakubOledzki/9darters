<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../lib/api";

  let users: Array<{
    id: string;
    firstName: string;
    lastName: string;
    nickname: string;
    rating: number;
    isAdmin: boolean;
    createdAt: string;
  }> = [];
  let matches: Array<{
    id: string;
    name: string;
    mode: string;
    kind: string;
    status: string;
    isRanking: boolean;
    playMode: "online" | "stationary";
    updatedAt: string;
  }> = [];
  let tournaments: Array<{
    id: string;
    name: string;
    mode: string;
    status: string;
    isRanking: boolean;
    playMode: "online" | "stationary";
    updatedAt: string;
  }> = [];
  let ratingDrafts: Record<string, string> = {};
  let error = "";
  let success = "";

  function formatPlayMode(playMode: "online" | "stationary") {
    return playMode === "online" ? "online" : "stacjonarnie";
  }

  function syncRatingDrafts() {
    ratingDrafts = Object.fromEntries(users.map((entry) => [entry.id, String(entry.rating)]));
  }

  async function loadOverview() {
    error = "";
    try {
      const data = await api<{
        users: typeof users;
        matches: typeof matches;
        tournaments: typeof tournaments;
      }>("/admin/overview");
      users = data.users;
      matches = data.matches;
      tournaments = data.tournaments;
      syncRatingDrafts();
    } catch (event) {
      error = (event as { error?: string }).error ?? "Nie udalo sie pobrac danych administratora.";
    }
  }

  async function saveRating(userId: string) {
    const nextRating = Number(ratingDrafts[userId] ?? "");
    if (!Number.isInteger(nextRating) || nextRating < 0 || nextRating > 5000) {
      error = "dRating musi byc liczba od 0 do 5000.";
      return;
    }

    try {
      error = "";
      success = "";
      await api(`/admin/users/${userId}/rating`, {
        method: "PATCH",
        body: JSON.stringify({ rating: nextRating })
      });
      success = "dRating uzytkownika zostal zaktualizowany.";
      await loadOverview();
    } catch (event) {
      error = (event as { error?: string }).error ?? "Nie udalo sie zapisac dRating.";
    }
  }

  async function deleteUser(userId: string, nickname: string) {
    if (!window.confirm(`Usunac uzytkownika ${nickname}? To skasuje tez jego mecze, turnieje i treningi.`)) {
      return;
    }

    try {
      error = "";
      success = "";
      await api(`/admin/users/${userId}`, { method: "DELETE" });
      success = `Uzytkownik ${nickname} zostal usuniety.`;
      await loadOverview();
    } catch (event) {
      error = (event as { error?: string }).error ?? "Nie udalo sie usunac uzytkownika.";
    }
  }

  async function deleteMatch(matchId: string, name: string) {
    if (!window.confirm(`Usunac mecz ${name}?`)) {
      return;
    }

    try {
      error = "";
      success = "";
      await api(`/admin/matches/${matchId}`, { method: "DELETE" });
      success = `Mecz ${name} zostal usuniety.`;
      await loadOverview();
    } catch (event) {
      error = (event as { error?: string }).error ?? "Nie udalo sie usunac meczu.";
    }
  }

  async function deleteTournament(tournamentId: string, name: string) {
    if (!window.confirm(`Usunac turniej ${name}?`)) {
      return;
    }

    try {
      error = "";
      success = "";
      await api(`/admin/tournaments/${tournamentId}`, { method: "DELETE" });
      success = `Turniej ${name} zostal usuniety.`;
      await loadOverview();
    } catch (event) {
      error = (event as { error?: string }).error ?? "Nie udalo sie usunac turnieju.";
    }
  }

  onMount(() => {
    void loadOverview();
  });
</script>

<section class="hero">
  <div class="stack">
    <span class="pill">Panel administratora</span>
    <h1>Zarzadzanie platforma</h1>
    <p>Usuwaj konta, mecze i turnieje oraz koryguj dRating uzytkownikow.</p>
  </div>

  <div class="card stack">
    <div class="inline">
      <span class="pill">Uzytkownicy: {users.length}</span>
      <span class="pill">Mecze: {matches.length}</span>
      <span class="pill">Turnieje: {tournaments.length}</span>
    </div>
    <button class="primary" on:click={loadOverview} type="button">Odswiez dane</button>
  </div>
</section>

{#if error}
  <div class="alert">{error}</div>
{/if}

{#if success}
  <div class="alert success">{success}</div>
{/if}

<section class="grid two">
  <article class="card stack">
    <h2>Uzytkownicy</h2>
    <div class="list">
      {#each users as entry}
        <div class="list-item">
          <div class="inline item-head">
            <strong>{entry.nickname}</strong>
            {#if entry.isAdmin}
              <span class="pill">admin</span>
            {/if}
          </div>
          <span class="muted">{entry.firstName} {entry.lastName}</span>
          <div class="admin-rating-row">
            <input
              bind:value={ratingDrafts[entry.id]}
              min="0"
              max="5000"
              type="number"
            />
            <button on:click={() => saveRating(entry.id)} type="button">Zapisz dRating</button>
            <button class="secondary" on:click={() => deleteUser(entry.id, entry.nickname)} type="button">Usun</button>
          </div>
        </div>
      {/each}
    </div>
  </article>

  <article class="card stack">
    <h2>Mecze</h2>
    <div class="list">
      {#each matches as entry}
        <div class="list-item">
          <strong>{entry.name}</strong>
          <span class="muted">{entry.kind} | {entry.mode} | {formatPlayMode(entry.playMode)} | {entry.status}</span>
          <div class="inline">
            <span class="pill">{entry.isRanking ? "ranking" : "casual"}</span>
            <button class="secondary" on:click={() => deleteMatch(entry.id, entry.name)} type="button">Usun mecz</button>
          </div>
        </div>
      {/each}
    </div>
  </article>
</section>

<section class="card stack">
  <h2>Turnieje</h2>
  <div class="list">
    {#each tournaments as entry}
      <div class="list-item">
        <strong>{entry.name}</strong>
        <span class="muted">{entry.mode} | {formatPlayMode(entry.playMode)} | {entry.status}</span>
        <div class="inline">
          <span class="pill">{entry.isRanking ? "ranking" : "casual"}</span>
          <button class="secondary" on:click={() => deleteTournament(entry.id, entry.name)} type="button">Usun turniej</button>
        </div>
      </div>
    {/each}
  </div>
</section>
