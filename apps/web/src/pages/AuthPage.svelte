<script lang="ts">
  import { goto } from "../lib/router";
  import { login, register } from "../lib/auth";

  let isRegister = false;
  let error = "";
  let loading = false;

  let firstName = "";
  let lastName = "";
  let nickname = "";
  let password = "";
  let rememberMe = true;

  async function submit() {
    error = "";
    loading = true;

    try {
      if (isRegister) {
        await register({ firstName, lastName, nickname, password });
      } else {
        await login(nickname, password, rememberMe);
      }

      goto("/");
    } catch (event) {
      const message = (event as { error?: string }).error ?? "Nie udalo sie zapisac sesji.";
      error = message;
    } finally {
      loading = false;
    }
  }
</script>

<main class="shell">
  <section class="hero">
    <div class="stack">
      <span class="pill">Mobile-first PWA</span>
      <h1>9Darters Losice</h1>
      <p>
        Platforma do darta dla wspolnych rozgrywek offline, 1v1 online, turniejow, treningu i live spectatingu.
      </p>
    </div>

    <div class="card">
      <div class="inline">
        <button class={!isRegister ? "primary" : "ghost"} on:click={() => (isRegister = false)}>Logowanie</button>
        <button class={isRegister ? "primary" : "ghost"} on:click={() => (isRegister = true)}>Rejestracja</button>
      </div>

      <form class="stack" on:submit|preventDefault={submit}>
        {#if isRegister}
          <label class="field">
            <span>Imie</span>
            <input bind:value={firstName} required />
          </label>
          <label class="field">
            <span>Nazwisko</span>
            <input bind:value={lastName} required />
          </label>
        {/if}

        <label class="field">
          <span>Pseudonim</span>
          <input bind:value={nickname} required />
        </label>

        <label class="field">
          <span>Haslo</span>
          <input bind:value={password} type="password" required minlength="8" />
        </label>

        {#if !isRegister}
          <label class="inline">
            <input bind:checked={rememberMe} type="checkbox" />
            <span class="muted">Zapamietaj mnie</span>
          </label>
        {/if}

        {#if error}
          <div class="alert">{error}</div>
        {/if}

        <button class="primary" disabled={loading}>
          {#if loading}
            Przetwarzanie...
          {:else if isRegister}
            Utworz konto
          {:else}
            Zaloguj
          {/if}
        </button>
      </form>
    </div>
  </section>
</main>
