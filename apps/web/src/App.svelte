<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { loadSession, logout, session } from "./lib/auth";
  import { goto, route } from "./lib/router";
  import AdminPage from "./pages/AdminPage.svelte";
  import AuthPage from "./pages/AuthPage.svelte";
  import DashboardPage from "./pages/DashboardPage.svelte";
  import HistoryPage from "./pages/HistoryPage.svelte";
  import MatchPage from "./pages/MatchPage.svelte";
  import RankingPage from "./pages/RankingPage.svelte";
  import SocialPage from "./pages/SocialPage.svelte";
  import TournamentPage from "./pages/TournamentPage.svelte";
  import TrainingPage from "./pages/TrainingPage.svelte";

  onMount(() => {
    void loadSession();
  });

  onDestroy(() => {
    if (typeof document !== "undefined") {
      document.body.classList.remove("match-screen");
    }
  });

  async function signOut() {
    try {
      await logout();
    } finally {
      goto("/auth");
    }
  }

  $: activeRoute = $route;
  $: authState = $session;
  $: isAuthenticated = Boolean(authState.user);
  $: isMatchRoute = activeRoute.name === "match";
  $: if (typeof document !== "undefined") {
    if (isMatchRoute) {
      document.body.classList.add("match-screen");
    } else {
      document.body.classList.remove("match-screen");
    }
  }
</script>

{#if authState.loading}
  <main class="shell">
    <section class="hero">
      <div>
        <h1>9Darters Losice</h1>
        <p>Ladowanie aplikacji i sesji uzytkownika.</p>
      </div>
    </section>
  </main>
{:else if !isAuthenticated}
  <AuthPage />
{:else}
  <main class={`shell ${isMatchRoute ? "match-shell" : ""}`}>
    {#if !isMatchRoute}
      <header class="topbar">
        <div class="brand">
          <strong>9Darters</strong>
          <span>Losice | {authState.user?.nickname}</span>
        </div>

        <nav class="nav">
          <button on:click={() => goto("/")} type="button">Dashboard</button>
          <button on:click={() => goto("/ranking")} type="button">Ranking</button>
          <button on:click={() => goto("/history")} type="button">Historia</button>
          <button on:click={() => goto("/training")} type="button">Trening</button>
          <button on:click={() => goto("/social")} type="button">Social</button>
          {#if authState.user?.isAdmin}
            <button on:click={() => goto("/admin")} type="button">Admin</button>
          {/if}
          <button class="secondary" on:click={signOut} type="button">Wyloguj</button>
        </nav>
      </header>
    {/if}

    {#if activeRoute.name === "dashboard"}
      <DashboardPage user={authState.user!} />
    {:else if activeRoute.name === "ranking"}
      <RankingPage />
    {:else if activeRoute.name === "history"}
      <HistoryPage />
    {:else if activeRoute.name === "training"}
      <TrainingPage />
    {:else if activeRoute.name === "social"}
      <SocialPage />
    {:else if activeRoute.name === "match"}
      <MatchPage id={activeRoute.id} user={authState.user!} />
    {:else if activeRoute.name === "tournament"}
      <TournamentPage id={activeRoute.id} user={authState.user!} />
    {:else if activeRoute.name === "admin" && authState.user?.isAdmin}
      <AdminPage />
    {:else}
      <DashboardPage user={authState.user!} />
    {/if}
  </main>
{/if}
