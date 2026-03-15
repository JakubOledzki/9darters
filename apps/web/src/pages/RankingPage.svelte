<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../lib/api";

  let leaderboard: Array<{
    id: string;
    nickname: string;
    firstName: string;
    lastName: string;
    rating: number;
  }> = [];

  onMount(async () => {
    const data = await api<{ leaderboard: typeof leaderboard }>("/ranking");
    leaderboard = data.leaderboard;
  });
</script>

<section class="card stack">
  <h2>Ranking dRating</h2>
  <div class="list">
    {#each leaderboard as player, index}
      <div class="list-item">
        <strong>#{index + 1} · {player.nickname}</strong>
        <span class="muted">{player.firstName} {player.lastName}</span>
        <span class="pill">{player.rating} dRating</span>
      </div>
    {/each}
  </div>
</section>
