<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import { goto } from "../lib/router";

  export let user: {
    id: string;
    nickname: string;
    rating: number;
  };

  type Configurator = "offline" | "duel" | "tournament" | "live";

  type LiveMatch = {
    id: string;
    name: string;
    mode: string;
    kind: string;
    playMode: "online" | "stationary";
    updatedAt: string;
    players: Array<{ name: string; score: number; setsWon: number; legsWon: number }>;
  };

  type MatchSummary = {
    id: string;
    name: string;
    mode: string;
    kind: string;
    status: string;
    playMode: "online" | "stationary";
    updatedAt: string;
  };

  type NotificationSummary = {
    id: string;
    type: string;
    title: string;
    body: string;
    entityType: string;
    entityId: string;
    isRead: boolean;
    createdAt: string;
  };

  type SearchUser = {
    id: string;
    nickname: string;
    firstName: string;
    lastName: string;
    rating: number;
  };

  let activeConfigurator: Configurator = "offline";
  let liveMatches: LiveMatch[] = [];
  let myMatches: MatchSummary[] = [];
  let notifications: NotificationSummary[] = [];
  let error = "";

  let offlineName = "Trening lokalny";
  let offlineMode = "501";
  let offlineGuests: string[] = [];
  let offlineGuestDraft = "";
  let offlineDoubleOut = false;
  let offlineLegsToWin = 3;
  let offlineSetsToWin = 1;
  let offlineCountingMode = "simplified";

  let duelName = "Mecz rankingowy";
  let duelMode = "501";
  let duelOpponent = "";
  let duelSuggestions: SearchUser[] = [];
  let duelSearchLoading = false;
  let duelSearchRequestId = 0;
  let duelIsRanking = true;
  let duelDoubleOut = false;
  let duelIsOnline = true;
  let duelLegsToWin = 3;
  let duelSetsToWin = 1;
  let duelCountingMode = "simplified";

  let tournamentName = "Wieczor ligowy";
  let tournamentMode = "501";
  let tournamentParticipants: string[] = [];
  let tournamentParticipantDraft = "";
  let tournamentSuggestions: SearchUser[] = [];
  let tournamentSearchLoading = false;
  let tournamentSearchRequestId = 0;
  let tournamentIsRanking = true;
  let tournamentDoubleOut = false;
  let tournamentIsOnline = true;
  let tournamentLegsToWin = 3;
  let tournamentSetsToWin = 1;
  let tournamentCountingMode = "simplified";

  $: challengeNotifications = notifications.filter(
    (notification) => notification.type === "match_invite" && !notification.isRead && notification.entityType === "match"
  );
  $: regularNotifications = notifications.filter((notification) => notification.type !== "match_invite");

  const launcherTiles: Array<{
    id: Configurator;
    title: string;
    description: string;
    details: string;
  }> = [
    {
      id: "offline",
      title: "Gra offline",
      description: "Jeden ekran, lokalni gracze i szybki start treningu lub meczu.",
      details: "Do 8 graczy, 501, 301, Cricket, Around the Clock"
    },
    {
      id: "duel",
      title: "Pojedynek 1v1",
      description: "Wyslij zaproszenie i wybierz mecz online albo stacjonarny.",
      details: "Tryb rankingowy, gotowy od razu, live"
    },
    {
      id: "tournament",
      title: "Turniej",
      description: "Round-robin dla znajomych z automatycznym generowaniem meczow.",
      details: "Do 12 graczy, ranking opcjonalny, kolejne mecze live"
    },
    {
      id: "live",
      title: "Live",
      description: "Podejrzyj wszystkie mecze, ktore sa teraz rozgrywane na zywo.",
      details: "Lista aktywnych spotkan, szybkie wejscie do obserwacji"
    }
  ];

  function formatPlayMode(playMode: "online" | "stationary") {
    return playMode === "online" ? "online" : "stacjonarnie";
  }

  function getConfiguratorMeta() {
    if (activeConfigurator === "offline") {
      return {
        title: "Konfiguracja gry offline",
        description: "Ustaw lokalnych graczy, tryb liczenia i rozpocznij mecz na jednym urzadzeniu."
      };
    }

    if (activeConfigurator === "duel") {
      return {
        title: "Konfiguracja pojedynku 1v1",
        description: "Wyszukaj przeciwnika, ustaw zasady i wyslij zaproszenie do gry."
      };
    }

    if (activeConfigurator === "live") {
      return {
        title: "Mecze live",
        description: "Wszystkie aktualnie rozgrywane mecze live w jednym miejscu."
      };
    }

    return {
      title: "Konfiguracja turnieju",
      description: "Dodaj uczestnikow, wybierz zasady i wygeneruj harmonogram round-robin."
    };
  }

  async function loadDashboard() {
    const [live, matches, notif] = await Promise.all([
      api<{ matches: LiveMatch[] }>("/matches/live").catch(() => ({ matches: [] })),
      api<{ matches: MatchSummary[] }>("/matches").catch(() => ({ matches: [] })),
      api<{ notifications: NotificationSummary[] }>("/notifications").catch(() => ({ notifications: [] }))
    ]);

    liveMatches = live.matches;
    myMatches = matches.matches.slice(-8).reverse();
    notifications = notif.notifications.slice(0, 16);
  }

  onMount(() => {
    void loadDashboard();
    const refreshInterval = window.setInterval(() => {
      void loadDashboard();
    }, 15000);

    return () => {
      window.clearInterval(refreshInterval);
    };
  });

  async function searchUsers(
    query: string,
    options: {
      excludeNicknames?: string[];
      target: "duel" | "tournament";
    }
  ) {
    const trimmed = query.trim();
    const exclude = new Set((options.excludeNicknames ?? []).map((nickname) => nickname.toLowerCase()));
    const requestId =
      options.target === "duel" ? ++duelSearchRequestId : ++tournamentSearchRequestId;

    if (trimmed.length < 2) {
      if (options.target === "duel") {
        duelSuggestions = [];
        duelSearchLoading = false;
      } else {
        tournamentSuggestions = [];
        tournamentSearchLoading = false;
      }
      return;
    }

    if (options.target === "duel") {
      duelSearchLoading = true;
    } else {
      tournamentSearchLoading = true;
    }

    try {
      const data = await api<{ results: SearchUser[] }>(`/users/search?q=${encodeURIComponent(trimmed)}`);
      const filtered = data.results.filter((result) => !exclude.has(result.nickname.toLowerCase()));

      if (options.target === "duel") {
        if (requestId !== duelSearchRequestId) {
          return;
        }
        duelSuggestions = filtered;
      } else {
        if (requestId !== tournamentSearchRequestId) {
          return;
        }
        tournamentSuggestions = filtered;
      }
    } catch {
      if (options.target === "duel") {
        if (requestId !== duelSearchRequestId) {
          return;
        }
        duelSuggestions = [];
      } else {
        if (requestId !== tournamentSearchRequestId) {
          return;
        }
        tournamentSuggestions = [];
      }
    } finally {
      if (options.target === "duel") {
        if (requestId === duelSearchRequestId) {
          duelSearchLoading = false;
        }
      } else if (requestId === tournamentSearchRequestId) {
        tournamentSearchLoading = false;
      }
    }
  }

  function selectConfigurator(nextConfigurator: Configurator) {
    activeConfigurator = nextConfigurator;
    error = "";
  }

  function handleDuelOpponentInput() {
    void searchUsers(duelOpponent, { target: "duel" });
  }

  function selectDuelOpponent(nextUser: SearchUser) {
    duelOpponent = nextUser.nickname;
    duelSuggestions = [];
    duelSearchLoading = false;
  }

  function addOfflineGuest() {
    const name = offlineGuestDraft.trim();
    if (!name) {
      return;
    }

    if (offlineGuests.length >= 7) {
      error = "W grze offline mozesz dodac maksymalnie 7 dodatkowych graczy.";
      return;
    }

    offlineGuests = [...offlineGuests, name];
    offlineGuestDraft = "";
  }

  function updateOfflineGuest(index: number, value: string) {
    offlineGuests = offlineGuests.map((guest, currentIndex) => (currentIndex === index ? value : guest));
  }

  function removeOfflineGuest(index: number) {
    offlineGuests = offlineGuests.filter((_, currentIndex) => currentIndex !== index);
  }

  function addTournamentParticipant() {
    const nickname = tournamentParticipantDraft.trim();
    if (!nickname) {
      return;
    }

    const exists = tournamentParticipants.some((participant) => participant.toLowerCase() === nickname.toLowerCase());
    if (exists) {
      error = "Ten gracz jest juz dodany do turnieju.";
      return;
    }

    if (tournamentParticipants.length >= 11) {
      error = "W turnieju mozesz zaprosic maksymalnie 11 dodatkowych graczy.";
      return;
    }

    tournamentParticipants = [...tournamentParticipants, nickname];
    tournamentParticipantDraft = "";
    tournamentSuggestions = [];
    tournamentSearchLoading = false;
  }

  function updateTournamentParticipant(index: number, value: string) {
    tournamentParticipants = tournamentParticipants.map((participant, currentIndex) =>
      currentIndex === index ? value : participant
    );
  }

  function removeTournamentParticipant(index: number) {
    tournamentParticipants = tournamentParticipants.filter((_, currentIndex) => currentIndex !== index);
    void searchUsers(tournamentParticipantDraft, {
      target: "tournament",
      excludeNicknames: tournamentParticipants.filter((_, currentIndex) => currentIndex !== index)
    });
  }

  function handleTournamentParticipantInput() {
    void searchUsers(tournamentParticipantDraft, {
      target: "tournament",
      excludeNicknames: tournamentParticipants
    });
  }

  function selectTournamentParticipant(nextUser: SearchUser) {
    tournamentParticipantDraft = nextUser.nickname;
    addTournamentParticipant();
  }

  async function createOfflineMatch() {
    error = "";
    try {
      const guests = offlineGuests.map((item) => item.trim()).filter(Boolean);
      const data = await api<{ id: string }>("/matches/offline", {
        method: "POST",
        body: JSON.stringify({
          name: offlineName,
          mode: offlineMode,
          guestNames: guests,
          doubleOut: offlineDoubleOut,
          legsToWin: Number(offlineLegsToWin),
          setsToWin: Number(offlineSetsToWin),
          countingMode: offlineCountingMode
        })
      });
      goto(`/match/${data.id}`);
    } catch (event) {
      error = (event as { error?: string }).error ?? "Nie udalo sie utworzyc gry offline.";
    }
  }

  async function createDuel() {
    error = "";
    try {
      const data = await api<{ id: string }>("/matches/duel", {
        method: "POST",
        body: JSON.stringify({
          name: duelName,
          mode: duelMode,
          opponentNickname: duelOpponent,
          playMode: duelIsOnline ? "online" : "stationary",
          isRanking: duelIsRanking,
          doubleOut: duelDoubleOut,
          legsToWin: Number(duelLegsToWin),
          setsToWin: Number(duelSetsToWin),
          countingMode: duelCountingMode
        })
      });
      goto(`/match/${data.id}`);
    } catch (event) {
      error = (event as { error?: string }).error ?? "Nie udalo sie utworzyc pojedynku.";
    }
  }

  async function createTournament() {
    error = "";
    try {
      const data = await api<{ id: string }>("/tournaments", {
        method: "POST",
        body: JSON.stringify({
          name: tournamentName,
          mode: tournamentMode,
          playMode: tournamentIsOnline ? "online" : "stationary",
          participantNicknames: tournamentParticipants.map((item) => item.trim()).filter(Boolean),
          isRanking: tournamentIsRanking,
          doubleOut: tournamentDoubleOut,
          legsToWin: Number(tournamentLegsToWin),
          setsToWin: Number(tournamentSetsToWin),
          countingMode: tournamentCountingMode
        })
      });
      goto(`/tournament/${data.id}`);
    } catch (event) {
      error = (event as { error?: string }).error ?? "Nie udalo sie utworzyc turnieju.";
    }
  }

  async function openChallenge(notification: NotificationSummary) {
    await api(`/notifications/${notification.id}/read`, {
      method: "POST"
    }).catch(() => undefined);
    await loadDashboard();
    goto(`/match/${notification.entityId}`);
  }
</script>

<section class="hero">
  <div class="stack">
    <span class="pill">dRating: {user.rating}</span>
    <h1>Witaj, {user.nickname}</h1>
    <p>Uruchom mecz jednym kliknieciem, a konfiguracje pokazuj tylko wtedy, gdy jej potrzebujesz.</p>
  </div>

  <div class="card stack">
    <h3>Szybkie akcje</h3>
    <div class="inline">
      <span class="pill">Live: {liveMatches.length}</span>
      <span class="pill">Historia: {myMatches.length}</span>
      <span class="pill">Powiadomienia: {notifications.length}</span>
    </div>
    <div class="inline">
      <button class="primary" on:click={() => goto("/training")} type="button">Trening</button>
      <button on:click={() => goto("/social")} type="button">Social</button>
      <button on:click={() => goto("/history")} type="button">Historia</button>
    </div>
  </div>
</section>

<section class="grid two">
  <article class="card stack">
    <div class="inline item-head">
      <h2>Wyzwania 1v1</h2>
      <span class="pill">Nowe: {challengeNotifications.length}</span>
    </div>

    <div class="list">
      {#each challengeNotifications as notification}
        <div class="list-item challenge-item">
          <strong>{notification.title}</strong>
          <span class="muted">{notification.body}</span>
          <div class="inline challenge-actions">
            <button class="primary" on:click={() => openChallenge(notification)} type="button">Otworz mecz</button>
          </div>
        </div>
      {:else}
        <div class="list-item">
          <strong>Brak nowych wyzwan</strong>
          <span class="muted">Gdy ktos utworzy dla Ciebie pojedynek 1v1, zobaczysz go tutaj bez potwierdzania.</span>
        </div>
      {/each}
    </div>
  </article>
</section>

<section class="launcher-grid">
  {#each launcherTiles as tile}
    <button
      class={`mode-tile ${activeConfigurator === tile.id ? "is-active" : ""}`}
      on:click={() => selectConfigurator(tile.id)}
      type="button"
    >
      <div class="mode-tile-icon" aria-hidden="true">
        {#if tile.id === "offline"}
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M5 6h14v12H5z" stroke="currentColor" stroke-width="1.8" />
            <path d="M8 9h8M8 12h8M8 15h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
        {:else if tile.id === "duel"}
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M8 5l4 7-4 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M16 5l-4 7 4 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        {:else if tile.id === "tournament"}
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M8 5v5M16 5v5M6 10h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            <path d="M7 10h10v7a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" stroke="currentColor" stroke-width="1.8" />
          </svg>
        {:else}
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M4 12c2.2-4 5-6 8-6s5.8 2 8 6c-2.2 4-5 6-8 6s-5.8-2-8-6Z" stroke="currentColor" stroke-width="1.8" />
            <circle cx="12" cy="12" r="2.5" stroke="currentColor" stroke-width="1.8" />
          </svg>
        {/if}
      </div>

      <div class="mode-tile-copy">
        <strong>{tile.title}</strong>
        <span>{tile.description}</span>
        <small>{tile.details}</small>
      </div>
    </button>
  {/each}
</section>

{#if error}
  <div class="alert">{error}</div>
{/if}

<section class="card stack mode-panel">
  <div class="mode-panel-head">
    <div class="stack">
      <h2>{getConfiguratorMeta().title}</h2>
      <p class="muted">{getConfiguratorMeta().description}</p>
    </div>
  </div>

  {#if activeConfigurator === "offline"}
    <div class="stack">
      <label class="field">
        <span>Nazwa gry</span>
        <input bind:value={offlineName} />
      </label>
      <label class="field">
        <span>Tryb</span>
        <select bind:value={offlineMode}>
          <option value="501">501</option>
          <option value="301">301</option>
          <option value="cricket">Cricket</option>
          <option value="around-the-clock">Around the Clock</option>
        </select>
      </label>
      <div class="stack">
        <label class="field">
          <span>Dodatkowi gracze</span>
          <div class="inline grow">
            <input bind:value={offlineGuestDraft} placeholder="Wpisz nazwe gracza lokalnego" />
            <button class="ghost compact" on:click|preventDefault={addOfflineGuest} type="button">+</button>
          </div>
        </label>
        <div class="tag-grid">
          {#each offlineGuests as guest, index}
            <div class="entry-chip">
              <input
                value={guest}
                on:input={(event) => updateOfflineGuest(index, (event.currentTarget as HTMLInputElement).value)}
              />
              <button class="ghost compact" on:click={() => removeOfflineGuest(index)} type="button">Usun</button>
            </div>
          {:else}
            <div class="list-item">
              <strong>Brak dodatkowych graczy</strong>
              <span class="muted">Dodaj do 7 lokalnych uczestnikow osobno.</span>
            </div>
          {/each}
        </div>
      </div>
      <div class="inline">
        <label class="field">
          <span>Legi do seta</span>
          <input bind:value={offlineLegsToWin} min="1" max="9" type="number" />
        </label>
        <label class="field">
          <span>Sety do meczu</span>
          <input bind:value={offlineSetsToWin} min="1" max="9" type="number" />
        </label>
      </div>
      <label class="field">
        <span>Tryb liczenia</span>
        <select bind:value={offlineCountingMode}>
          <option value="simplified">Uproszczony</option>
          <option value="default">Domyslny</option>
        </select>
      </label>
      <label class="inline">
        <input bind:checked={offlineDoubleOut} type="checkbox" />
        <span class="muted">Double-out</span>
      </label>
      <button class="primary mode-panel-submit" on:click={createOfflineMatch} type="button">Start gry offline</button>
    </div>
  {:else if activeConfigurator === "duel"}
    <div class="stack">
      <label class="field">
        <span>Nazwa gry</span>
        <input bind:value={duelName} />
      </label>
      <label class="field">
        <span>Tryb</span>
        <select bind:value={duelMode}>
          <option value="501">501</option>
          <option value="301">301</option>
        </select>
      </label>
      <label class="inline">
        <input bind:checked={duelIsOnline} type="checkbox" />
        <span class="muted">Mecz online. Po odznaczeniu tworca wpisuje wyniki dla obu graczy.</span>
      </label>
      <div class="stack">
        <label class="field">
          <span>Pseudonim przeciwnika</span>
          <input bind:value={duelOpponent} on:input={handleDuelOpponentInput} />
        </label>
        {#if duelSearchLoading}
          <span class="muted">Szukam graczy...</span>
        {/if}
        {#if duelSuggestions.length > 0}
          <div class="suggestions">
            {#each duelSuggestions as suggestion}
            <button
              class="suggestion-item"
              on:click={() => selectDuelOpponent(suggestion)}
              type="button"
            >
              <div class="suggestion-head">
                <strong>{suggestion.nickname}</strong>
                <span class="rating-pill">{suggestion.rating} dRating</span>
              </div>
              <span class="muted">{suggestion.firstName} {suggestion.lastName}</span>
            </button>
          {/each}
        </div>
        {/if}
      </div>
      <div class="inline">
        <label class="field">
          <span>Legi</span>
          <input bind:value={duelLegsToWin} type="number" min="1" max="9" />
        </label>
        <label class="field">
          <span>Sety</span>
          <input bind:value={duelSetsToWin} type="number" min="1" max="9" />
        </label>
      </div>
      <label class="field">
        <span>Tryb liczenia</span>
        <select bind:value={duelCountingMode}>
          <option value="simplified">Uproszczony</option>
          <option value="default">Domyslny</option>
        </select>
      </label>
      <div class="inline">
        <label class="inline">
          <input bind:checked={duelIsRanking} type="checkbox" />
          <span class="muted">Mecz rankingowy</span>
        </label>
        <label class="inline">
          <input bind:checked={duelDoubleOut} type="checkbox" />
          <span class="muted">Double-out</span>
        </label>
      </div>
      <button class="primary mode-panel-submit" on:click={createDuel} type="button">Wyslij zaproszenie</button>
    </div>
  {:else if activeConfigurator === "tournament"}
    <div class="stack">
      <label class="field">
        <span>Nazwa turnieju</span>
        <input bind:value={tournamentName} />
      </label>
      <label class="field">
        <span>Tryb</span>
        <select bind:value={tournamentMode}>
          <option value="501">501</option>
          <option value="301">301</option>
        </select>
      </label>
      <label class="inline">
        <input bind:checked={tournamentIsOnline} type="checkbox" />
        <span class="muted">Turniej online. Po odznaczeniu tworca wpisuje wyniki dla wszystkich meczow.</span>
      </label>
      <div class="stack">
        <label class="field">
          <span>Zaproszeni gracze</span>
          <div class="inline grow">
            <input
              bind:value={tournamentParticipantDraft}
              on:input={handleTournamentParticipantInput}
              placeholder="Wpisz pseudonim i kliknij +"
            />
            <button class="ghost compact" on:click|preventDefault={addTournamentParticipant} type="button">+</button>
          </div>
        </label>
        {#if tournamentSearchLoading}
          <span class="muted">Szukam graczy...</span>
        {/if}
        {#if tournamentSuggestions.length > 0}
          <div class="suggestions">
            {#each tournamentSuggestions as suggestion}
            <button
              class="suggestion-item"
              on:click={() => selectTournamentParticipant(suggestion)}
              type="button"
            >
              <div class="suggestion-head">
                <strong>{suggestion.nickname}</strong>
                <span class="rating-pill">{suggestion.rating} dRating</span>
              </div>
              <span class="muted">{suggestion.firstName} {suggestion.lastName}</span>
            </button>
          {/each}
        </div>
        {/if}
        <div class="tag-grid">
          {#each tournamentParticipants as participant, index}
            <div class="entry-chip">
              <input
                value={participant}
                on:input={(event) =>
                  updateTournamentParticipant(index, (event.currentTarget as HTMLInputElement).value)}
              />
              <button class="ghost compact" on:click={() => removeTournamentParticipant(index)} type="button">Usun</button>
            </div>
          {:else}
            <div class="list-item">
              <strong>Brak zaproszonych graczy</strong>
              <span class="muted">Dodaj osobno do 11 pseudonimow.</span>
            </div>
          {/each}
        </div>
      </div>
      <div class="inline">
        <label class="field">
          <span>Legi</span>
          <input bind:value={tournamentLegsToWin} type="number" min="1" max="9" />
        </label>
        <label class="field">
          <span>Sety</span>
          <input bind:value={tournamentSetsToWin} type="number" min="1" max="9" />
        </label>
      </div>
      <label class="field">
        <span>Tryb liczenia</span>
        <select bind:value={tournamentCountingMode}>
          <option value="simplified">Uproszczony</option>
          <option value="default">Domyslny</option>
        </select>
      </label>
      <div class="inline">
        <label class="inline">
          <input bind:checked={tournamentIsRanking} type="checkbox" />
          <span class="muted">Rankingowy</span>
        </label>
        <label class="inline">
          <input bind:checked={tournamentDoubleOut} type="checkbox" />
          <span class="muted">Double-out</span>
        </label>
      </div>
      <button class="primary mode-panel-submit" on:click={createTournament} type="button">Utworz turniej</button>
    </div>
  {:else}
    <div class="list">
      {#each liveMatches as match}
        <button class="list-item" on:click={() => goto(`/match/${match.id}`)} type="button">
          <div class="inline item-head">
            <span aria-hidden="true" class="live-indicator"></span>
            <strong>{match.name}</strong>
          </div>
          <span class="muted">{match.kind} | {match.mode} | {formatPlayMode(match.playMode)}</span>
          <span class="muted">{match.players.map((player) => `${player.name}: ${player.score}`).join(" | ")}</span>
        </button>
      {:else}
        <div class="list-item">
          <strong>Brak aktywnych meczow</strong>
          <span class="muted">Gdy ktos rozpocznie mecz live, pojawi sie tutaj.</span>
        </div>
      {/each}
    </div>
  {/if}
</section>

<section class="grid two">
  <article class="card stack">
    <h2>Twoje ostatnie mecze</h2>
    <div class="list">
      {#each myMatches as match}
        <button class="list-item" on:click={() => goto(`/match/${match.id}`)} type="button">
          <div class="inline item-head">
            {#if match.status === "live"}
              <span aria-hidden="true" class="live-indicator"></span>
            {/if}
            <strong>{match.name}</strong>
          </div>
          <span class="muted">{match.kind} | {match.mode} | {formatPlayMode(match.playMode)} | {match.status}</span>
        </button>
      {:else}
        <div class="list-item">
          <strong>Brak historii meczow</strong>
          <span class="muted">Utworz pierwszy mecz offline albo zapros znajomego do 1v1.</span>
        </div>
      {/each}
    </div>
  </article>
</section>

<section class="card stack">
  <h2>Powiadomienia</h2>
  <div class="list">
    {#each regularNotifications as notification}
      <div class="list-item">
        <strong>{notification.title}</strong>
        <span class="muted">{notification.body}</span>
      </div>
    {:else}
      <div class="list-item">
        <strong>Brak powiadomien</strong>
        <span class="muted">Po obserwowaniu graczy zobaczysz tutaj wyniki ich meczow rankingowych.</span>
      </div>
    {/each}
  </div>
</section>
