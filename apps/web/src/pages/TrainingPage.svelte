<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../lib/api";

  type DrillMode = "around-the-clock" | "doubles-practice" | "trebles-practice" | "bull-practice";

  let mode: DrillMode = "around-the-clock";
  let currentTarget = 1;
  let attempts = 0;
  let hits = 0;
  let bestStreak = 0;
  let streak = 0;
  let startedAt = Date.now();
  let attemptsLog: Array<{ target: string; hit: boolean; scoredValue: number; createdAt: string }> = [];
  let message = "";

  function resetSession() {
    currentTarget = mode === "bull-practice" ? 25 : 1;
    attempts = 0;
    hits = 0;
    bestStreak = 0;
    streak = 0;
    attemptsLog = [];
    startedAt = Date.now();
    message = "";
  }

  function nextTarget() {
    if (mode === "around-the-clock") {
      currentTarget = currentTarget >= 20 ? 21 : currentTarget + 1;
    } else if (mode === "doubles-practice" || mode === "trebles-practice") {
      currentTarget = currentTarget >= 20 ? 1 : currentTarget + 1;
    } else {
      currentTarget = currentTarget === 25 ? 50 : 25;
    }
  }

  function record(hit: boolean) {
    const targetValue = currentTarget;
    const targetLabel =
      mode === "bull-practice" ? (targetValue === 50 ? "Bull" : "Outer Bull") : `${mode} ${targetValue}`;

    attempts += 1;
    if (hit) {
      hits += 1;
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
      nextTarget();
    } else {
      streak = 0;
    }

    attemptsLog = [
      {
        target: targetLabel,
        hit,
        scoredValue: hit ? targetValue : 0,
        createdAt: new Date().toISOString()
      },
      ...attemptsLog
    ];
  }

  async function saveSession() {
    const durationSeconds = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
    await api("/training/sessions", {
      method: "POST",
      body: JSON.stringify({
        mode,
        attempts,
        hits,
        hitRate: attempts === 0 ? 0 : Number(((hits / attempts) * 100).toFixed(2)),
        bestStreak,
        durationSeconds,
        throwsToFinish: mode === "around-the-clock" && currentTarget > 20 ? attempts : null,
        attemptsLog
      })
    });
    message = "Sesja treningowa zapisana.";
  }

  onMount(() => {
    resetSession();
  });
</script>

<section class="grid two">
  <article class="card stack">
    <h2>Trening rzutu</h2>
    <label class="field">
      <span>Tryb treningu</span>
      <select bind:value={mode} on:change={resetSession}>
        <option value="around-the-clock">Around the Clock</option>
        <option value="doubles-practice">Doubles Practice</option>
        <option value="trebles-practice">Trebles Practice</option>
        <option value="bull-practice">Bull Practice</option>
      </select>
    </label>

    <div class="hero">
      <div class="stack">
        <span class="pill">Cel</span>
        <h1>
          {#if mode === "bull-practice"}
            {currentTarget === 50 ? "Bull" : "Outer Bull"}
          {:else if currentTarget > 20}
            Koniec sekwencji
          {:else}
            {currentTarget}
          {/if}
        </h1>
        <p>Rejestruj hit lub miss po kazdym rzucie. System policzy skutecznosc, serie i zapisze sesje do historii.</p>
      </div>

      <div class="stack">
        <button class="primary" on:click={() => record(true)}>Hit</button>
        <button class="secondary" on:click={() => record(false)}>Miss</button>
        <button on:click={saveSession}>Zapisz sesje</button>
      </div>
    </div>

    {#if message}
      <div class="alert success">{message}</div>
    {/if}
  </article>

  <article class="card stack">
    <h2>Statystyki sesji</h2>
    <div class="inline">
      <span class="pill">Proby: {attempts}</span>
      <span class="pill">Trafienia: {hits}</span>
      <span class="pill">Skutecznosc: {attempts ? ((hits / attempts) * 100).toFixed(1) : "0"}%</span>
      <span class="pill">Best streak: {bestStreak}</span>
    </div>
    <div class="timeline">
      {#each attemptsLog as attempt}
        <div class="timeline-item">
          <strong>{attempt.target}</strong>
          <span class="muted">{attempt.hit ? "Hit" : "Miss"} · {attempt.createdAt}</span>
        </div>
      {/each}
    </div>
  </article>
</section>
