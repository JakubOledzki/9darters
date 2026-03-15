<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../lib/api";

  let query = "";
  let results: Array<{ id: string; nickname: string; firstName: string; lastName: string; rating: number }> = [];
  let follows: Array<{ id: string; nickname: string; firstName: string; lastName: string; rating: number }> = [];
  let notifications: Array<{ id: string; title: string; body: string; isRead: boolean }> = [];

  async function loadSocial() {
    const [followData, notificationData] = await Promise.all([
      api<{ follows: typeof follows }>("/follows"),
      api<{ notifications: typeof notifications }>("/notifications")
    ]);
    follows = followData.follows;
    notifications = notificationData.notifications;
  }

  onMount(() => {
    void loadSocial();
  });

  async function searchUsers() {
    if (!query.trim()) {
      results = [];
      return;
    }
    const data = await api<{ results: typeof results }>(`/users/search?q=${encodeURIComponent(query)}`);
    results = data.results;
  }

  async function follow(userId: string) {
    await api("/follows", {
      method: "POST",
      body: JSON.stringify({ followedUserId: userId })
    });
    await loadSocial();
  }

  async function unfollow(userId: string) {
    await api(`/follows/${userId}`, {
      method: "DELETE"
    });
    await loadSocial();
  }

  async function markRead(notificationId: string) {
    await api(`/notifications/${notificationId}/read`, {
      method: "POST",
      body: JSON.stringify({})
    });
    await loadSocial();
  }
</script>

<section class="grid two">
  <article class="card stack">
    <h2>Wyszukaj graczy</h2>
    <label class="field">
      <span>Pseudonim</span>
      <input bind:value={query} on:input={searchUsers} />
    </label>
    <div class="list">
      {#each results as result}
        <div class="list-item">
          <strong>{result.nickname}</strong>
          <span class="muted">{result.firstName} {result.lastName} · {result.rating} dRating</span>
          <button class="primary" on:click={() => follow(result.id)}>Obserwuj</button>
        </div>
      {/each}
    </div>
  </article>

  <article class="card stack">
    <h2>Obserwowani gracze</h2>
    <div class="list">
      {#each follows as player}
        <div class="list-item">
          <strong>{player.nickname}</strong>
          <span class="muted">{player.firstName} {player.lastName} · {player.rating} dRating</span>
          <button on:click={() => unfollow(player.id)}>Przestan obserwowac</button>
        </div>
      {:else}
        <div class="list-item">
          <strong>Brak obserwowanych</strong>
          <span class="muted">Dodaj pierwszych graczy, aby dostawac notyfikacje o wynikach.</span>
        </div>
      {/each}
    </div>
  </article>
</section>

<section class="card stack">
  <h2>Notyfikacje</h2>
  <div class="list">
    {#each notifications as notification}
      <div class="list-item">
        <strong>{notification.title}</strong>
        <span class="muted">{notification.body}</span>
        {#if !notification.isRead}
          <button class="primary" on:click={() => markRead(notification.id)}>Oznacz jako przeczytane</button>
        {/if}
      </div>
    {/each}
  </div>
</section>
