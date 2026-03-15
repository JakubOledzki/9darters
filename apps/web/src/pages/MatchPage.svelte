<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "../lib/api";
  import { goto } from "../lib/router";
  import { getSocket } from "../lib/socket";

  export let id: string;
  export let user: { id: string; nickname: string };

  type ThrowView = {
    label?: string;
    score?: number;
    segment?: number;
    multiplier?: number;
    dartsUsed?: number;
  };

  type TimelineEntry = {
    playerIndex: number;
    playerName: string;
    total: number;
    busted: boolean;
    checkout: boolean;
    throws: ThrowView[];
    at: string;
  };

  type MatchData = {
    id: string;
    name: string;
    mode: string;
    kind: string;
    status: string;
    playMode: "online" | "stationary";
    createdByUserId: string;
    countingMode: string;
    isRanking: boolean;
    doubleOut: boolean;
    legsToWin: number;
    setsToWin: number;
    stateJson: {
      status: string;
      currentPlayerIndex: number;
      pendingThrows: ThrowView[];
      players: Array<{
        participantId: string;
        userId?: string | null;
        name: string;
        x01Score: number;
        cricketPoints: number;
        setsWon: number;
        legsWon: number;
        totalLegsWon?: number;
        atcTarget: number;
        stats: {
          threeDartAverage: number;
          turn50Plus: number;
          turn100Plus: number;
          turn180: number;
          busts: number;
        };
      }>;
      timeline: TimelineEntry[];
      winnerIndex: number | null;
    };
  };

  type RatingPreview = {
    currentRating: number;
    winDelta: number;
    lossDelta: number;
  };

  const simplifiedBoards = [
    { label: "Single", value: 1 as const },
    { label: "Double", value: 2 as const },
    { label: "Triple", value: 3 as const }
  ];

  const simplifiedSegments = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 25];

  const numericKeypad = [
    ["7", "8", "9"],
    ["4", "5", "6"],
    ["1", "2", "3"],
    ["C", "0", "<-"]
  ];

  let match: MatchData | null = null;
  let participants: Array<{ id: string; userId?: string | null; displayName: string; status: string }> = [];
  let ratingPreviewByParticipantId: Record<string, RatingPreview> = {};
  let error = "";
  let viewerCount = 0;
  let selectedBoard: 1 | 2 | 3 = 1;
  let manualScoreDraft = "";
  let manualDartsUsed: 1 | 2 | 3 = 3;
  const socket = getSocket();

  $: participant = participants.find((item) => item.userId === user.id) ?? null;
  $: isParticipant = Boolean(participant);
  $: isStationaryManager = Boolean(match?.playMode === "stationary" && match.createdByUserId === user.id);
  $: currentPlayer = match?.stateJson.players[match.stateJson.currentPlayerIndex];
  $: canThrow = Boolean(
    match?.stateJson.status === "live" &&
      (isStationaryManager || (isParticipant && currentPlayer?.participantId === participant?.id))
  );
  $: isX01 = Boolean(match && (match.mode === "501" || match.mode === "301"));
  $: pendingCount = match?.stateJson.pendingThrows.length ?? 0;
  $: canCommit = Boolean(canThrow && pendingCount > 0);
  $: canUndo = Boolean(canThrow && pendingCount > 0);
  $: canStartMatch = Boolean(
    match &&
      (match.status === "ready" || match.stateJson.status === "ready" || match.status === "accepted") &&
      (isParticipant || isStationaryManager)
  );
  $: canSubmitDefaultTurn = Boolean(
    canThrow && match?.countingMode === "default" && manualScoreDraft.length > 0 && pendingCount === 0
  );
  $: rulesLabel = match
    ? `${match.mode}, ${match.doubleOut ? "Double Out" : "Straight Out"}, First to ${match.setsToWin} Set ${match.legsToWin} Leg`
    : "";
  $: activeTurnThrows = match?.stateJson.pendingThrows ?? [];
  $: activeTurnTotal = activeTurnThrows.reduce((sum, entry) => sum + getThrowValue(entry), 0);
  $: controlModeLabel = match?.playMode === "stationary" ? "stacjonarnie" : "online";

  async function loadMatch() {
    const data = await api<{
      match: MatchData;
      participants: typeof participants;
      ratingPreviewByParticipantId: Record<string, RatingPreview>;
    }>(`/matches/${id}/state`);
    match = data.match;
    participants = data.participants;
    ratingPreviewByParticipantId = data.ratingPreviewByParticipantId;
  }

  async function acceptMatch() {
    await api(`/matches/${id}/accept`, { method: "POST" });
    await loadMatch();
  }

  async function startMatch() {
    await api(`/matches/${id}/start`, { method: "POST" });
    await loadMatch();
    socket.emit(isParticipant ? "match:join" : "spectator:join", { matchId: id, spectator: !isParticipant });
  }

  function exitMatch() {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    goto("/");
  }

  function getThrowValue(entry: ThrowView) {
    if (typeof entry.score === "number") {
      return entry.score;
    }

    const segment = entry.segment ?? 0;
    const multiplier = entry.multiplier ?? 1;
    if (segment === 25) {
      return multiplier === 2 ? 50 : 25;
    }

    return segment * multiplier;
  }

  function formatThrowCell(entry: ThrowView | null) {
    if (!entry) {
      return "";
    }

    if (typeof entry.score === "number") {
      return String(entry.score);
    }

    const segment = entry.segment ?? 0;
    const multiplier = entry.multiplier ?? 1;
    if (segment === 0) {
      return "0";
    }

    if (multiplier === 3) {
      return `T${segment}`;
    }

    if (multiplier === 2) {
      return `D${segment}`;
    }

    return String(segment);
  }

  function formatAverage(value: number) {
    return value.toFixed(2).replace(".", ",");
  }

  function getLastPlayerTurn(playerIndex: number) {
    return [...(match?.stateJson.timeline ?? [])].reverse().find((entry) => entry.playerIndex === playerIndex) ?? null;
  }

  function getDisplayedThrows(playerIndex: number) {
    if (!match) {
      return [null, null, null] as Array<ThrowView | null>;
    }

    const isActivePlayer = playerIndex === match.stateJson.currentPlayerIndex && match.stateJson.status === "live";
    const source = isActivePlayer ? match.stateJson.pendingThrows : (getLastPlayerTurn(playerIndex)?.throws ?? []);
    return [...source.slice(0, 3), null, null, null].slice(0, 3);
  }

  function getDisplayedTotal(playerIndex: number) {
    if (!match) {
      return 0;
    }

    const isActivePlayer = playerIndex === match.stateJson.currentPlayerIndex && match.stateJson.status === "live";
    if (isActivePlayer) {
      return match.stateJson.pendingThrows.reduce((sum, entry) => sum + getThrowValue(entry), 0);
    }

    return getLastPlayerTurn(playerIndex)?.total ?? 0;
  }

  function setSimplifiedBoard(value: 1 | 2 | 3) {
    selectedBoard = value;
  }

  function pushSimplifiedSegment(segment: number) {
    if (!match || !canThrow) {
      return;
    }

    if (segment === 25 && selectedBoard === 3) {
      error = "Pole 25 obsluguje tylko single albo double.";
      return;
    }

    error = "";
    socket.emit("turn:throw", {
      matchId: id,
      throw: {
        segment,
        multiplier: selectedBoard
      }
    });
    selectedBoard = 1;
  }

  function appendManualDigit(digit: string) {
    if (!canThrow) {
      return;
    }

    if (digit === "C") {
      manualScoreDraft = "";
      return;
    }

    if (digit === "<-") {
      manualScoreDraft = manualScoreDraft.slice(0, -1);
      return;
    }

    const nextValue = `${manualScoreDraft}${digit}`.slice(0, 3).replace(/^0+(?=\d)/, "");
    if (nextValue && Number(nextValue) > 180) {
      error = "Podaj wynik tury od 0 do 180.";
      return;
    }

    error = "";
    manualScoreDraft = nextValue;
  }

  function setManualDartsUsed(value: 1 | 2 | 3) {
    manualDartsUsed = value;
  }

  function submitDefaultTurn() {
    if (!match || !canSubmitDefaultTurn) {
      return;
    }

    const parsedScore = Number(manualScoreDraft);
    if (Number.isNaN(parsedScore) || parsedScore < 0 || parsedScore > 180) {
      error = "Podaj wynik tury od 0 do 180.";
      return;
    }

    error = "";
    socket.emit("turn:throw", {
      matchId: id,
      throw: {
        score: parsedScore,
        dartsUsed: manualDartsUsed,
        label: `Suma ${parsedScore}`
      }
    });
    socket.emit("turn:commit", { matchId: id });
    manualScoreDraft = "";
    manualDartsUsed = 3;
  }

  function undoLastThrow() {
    if (!canUndo) {
      return;
    }

    socket.emit("turn:undo", { matchId: id });
  }

  function commit() {
    if (!canCommit) {
      return;
    }

    socket.emit("turn:commit", { matchId: id });
  }

  function getReadOnlyMessage() {
    if (!match) {
      return "Mozesz obserwowac stan gry, ale nie wykonujesz teraz ruchu.";
    }

    if (match.playMode === "stationary" && !isStationaryManager) {
      return "To mecz stacjonarny. Wyniki wpisuje tworca meczu lub organizator turnieju.";
    }

    if (isParticipant) {
      return "Czekasz na swoja ture. W trybie online kazdy gracz wpisuje punkty tylko dla siebie.";
    }

    return "Obserwujesz mecz live. Panel pozostaje zablokowany.";
  }

  function getPlayerPlace(playerIndex: number) {
    if (!match || match.stateJson.status !== "finished") {
      return null;
    }

    if (match.stateJson.players.length === 2) {
      return match.stateJson.winnerIndex === playerIndex ? 1 : 2;
    }

    return match.stateJson.winnerIndex === playerIndex ? 1 : null;
  }

  function getRatingPreview(participantId: string) {
    if (!match || !match.isRanking || match.stateJson.status === "finished") {
      return null;
    }

    return ratingPreviewByParticipantId[participantId] ?? null;
  }

  onMount(() => {
    const handleSnapshot = (nextState: MatchData["stateJson"]) => {
      if (match) {
        match = {
          ...match,
          stateJson: nextState
        };
      }
    };

    const handleUpdate = (nextState: MatchData["stateJson"]) => {
      if (match) {
        match = {
          ...match,
          stateJson: nextState
        };
      }
    };

    const handleError = (payload: { message: string }) => {
      error = payload.message;
    };

    const handleViewers = (payload: { count: number }) => {
      viewerCount = payload.count;
    };

    socket.on("match:snapshot", handleSnapshot);
    socket.on("match:update", handleUpdate);
    socket.on("match:finish", handleUpdate);
    socket.on("match:error", handleError);
    socket.on("match:viewers", handleViewers);

    void (async () => {
      await loadMatch();

      if (match) {
        socket.emit(isParticipant ? "match:join" : "spectator:join", {
          matchId: id,
          spectator: !isParticipant
        });
      }
    })();

    return () => {
      socket.emit("match:leave", { matchId: id });
      socket.off("match:snapshot", handleSnapshot);
      socket.off("match:update", handleUpdate);
      socket.off("match:finish", handleUpdate);
      socket.off("match:error", handleError);
      socket.off("match:viewers", handleViewers);
    };
  });
</script>

{#if match}
  <section class="match-view">
    <header class="match-compact-bar">
      <button class="match-exit" on:click={exitMatch} type="button">Wyjdz</button>

      <div class="match-title-block">
        <strong>{match.name}</strong>
        <span class="muted">{match.kind} | {match.mode} | {controlModeLabel}</span>
      </div>

      <div class="match-status-cluster">
        <span class="pill">{rulesLabel}</span>
        <span class="pill">
          <svg class="viewer-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" stroke-width="1.8" />
            <path d="M5 20a7 7 0 0 1 14 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
          {viewerCount}
        </span>
        {#if match.stateJson.status === "live"}
          <span class="pill"><span aria-hidden="true" class="live-indicator"></span> Live</span>
        {/if}
        {#if currentPlayer}
          <span class="pill">Na ruchu: {currentPlayer.name}</span>
        {/if}
        {#if participants.some((item) => item.userId === user.id && item.status === "pending")}
          <button class="ghost compact" on:click={acceptMatch} type="button">Akceptuj</button>
        {/if}
        {#if canStartMatch}
          <button class="secondary compact" on:click={startMatch} type="button">Start</button>
        {/if}
      </div>
    </header>

    {#if error}
      <div class="alert match-alert">{error}</div>
    {/if}

    <div class="match-content">
      {#if isX01}
        <section class="card x01-arena">
          <div class="x01-player-list">
            {#each match.stateJson.players as player, index}
              <div
                class={`x01-player-row ${index === match.stateJson.currentPlayerIndex && match.stateJson.status === "live" ? "is-active" : ""} ${match.stateJson.winnerIndex === index ? "is-winner" : ""}`}
              >
                <div class="x01-player-score">{player.x01Score}</div>

                <div class="x01-player-identity">
                  <div class="inline item-head">
                    {#if getPlayerPlace(index)}
                      <span class={`place-badge place-${getPlayerPlace(index)}`}>{getPlayerPlace(index)}</span>
                    {/if}
                    <strong>{player.name}</strong>
                  </div>
                  {#if getRatingPreview(player.participantId)}
                    <span class="rating-outlook">
                      +{getRatingPreview(player.participantId)?.winDelta} / -{getRatingPreview(player.participantId)?.lossDelta} dRating
                    </span>
                  {/if}
                  <span class="muted">
                    {#if index === match.stateJson.currentPlayerIndex && match.stateJson.status === "live"}
                      Aktualna tura
                    {:else if match.stateJson.winnerIndex === index}
                      Zwyciezca
                    {:else}
                      Ostatnia zagrana tura
                    {/if}
                  </span>
                </div>

                <div class="x01-throw-column">
                  <div class="x01-throw-boxes">
                    {#each getDisplayedThrows(index) as throwItem}
                      <div class="x01-throw-box">{formatThrowCell(throwItem)}</div>
                    {/each}
                  </div>
                  <div class="x01-turn-total">{getDisplayedTotal(index)}</div>
                </div>

                <div class="x01-player-side">
                  <span>Sety: {player.setsWon} Legi: {player.legsWon}</span>
                  <span>Avg {formatAverage(player.stats.threeDartAverage)}</span>
                </div>
              </div>
            {/each}
          </div>

          <div class="x01-control-block">
            <div class="x01-control-head">
              <span class="pill">Rzuty: {pendingCount}/3</span>
              <span class="pill">Liczenie: {match.countingMode === "simplified" ? "uproszczone" : "domyslne"}</span>
              {#if match.stateJson.winnerIndex !== null}
                <span class="pill">Wygral: {match.stateJson.players[match.stateJson.winnerIndex]?.name}</span>
              {/if}
            </div>

            {#if activeTurnThrows.length > 0}
              <div class="x01-live-strip">
                {#each activeTurnThrows as throwItem}
                  <span class="pill">{formatThrowCell(throwItem)}</span>
                {/each}
                <span class="pill">Suma: {activeTurnTotal}</span>
              </div>
            {/if}

            {#if match.countingMode === "simplified"}
              <div class="x01-multiplier-tabs">
                {#each simplifiedBoards as board}
                  <button
                    class={`x01-tab ${selectedBoard === board.value ? "is-active" : ""}`}
                    disabled={!canThrow}
                    on:click={() => setSimplifiedBoard(board.value)}
                    type="button"
                  >
                    {board.label}
                  </button>
                {/each}
              </div>

              <div class="x01-segment-grid">
                {#each simplifiedSegments as segment}
                  <button class="x01-key" disabled={!canThrow} on:click={() => pushSimplifiedSegment(segment)} type="button">
                    {segment}
                  </button>
                {/each}
              </div>

              <div class="x01-keypad-actions">
                <button class="x01-key" disabled={!canThrow} on:click={() => pushSimplifiedSegment(0)} type="button">
                  0
                </button>
                <button class="x01-key x01-backspace" disabled={!canUndo} on:click={undoLastThrow} type="button">
                  {"<-"}
                </button>
                <button class="x01-commit" disabled={!canCommit} on:click={commit} type="button">Zatwierdz ture</button>
              </div>
            {:else}
              <div class="x01-default-display">{manualScoreDraft || "0"}</div>

              <div class="x01-darts-row">
                {#each [1, 2, 3] as darts}
                  <button
                    class={`x01-tab ${manualDartsUsed === darts ? "is-active" : ""}`}
                    disabled={!canThrow}
                    on:click={() => setManualDartsUsed(darts as 1 | 2 | 3)}
                    type="button"
                  >
                    {darts} dart{darts === 1 ? "" : "s"}
                  </button>
                {/each}
              </div>

              <div class="x01-default-grid">
                {#each numericKeypad as row}
                  {#each row as key}
                    <button class="x01-key" disabled={!canThrow} on:click={() => appendManualDigit(key)} type="button">
                      {key}
                    </button>
                  {/each}
                {/each}
              </div>

              <button class="x01-commit" disabled={!canSubmitDefaultTurn} on:click={submitDefaultTurn} type="button">
                Zatwierdz ture
              </button>
            {/if}

            {#if !canThrow}
              <div class="list-item compact-note">
                <strong>Tryb podgladu</strong>
                <span class="muted">{getReadOnlyMessage()}</span>
              </div>
            {/if}
          </div>
        </section>
      {:else}
        <section class="match-standard-layout">
          <article class="card scoreboard match-panel">
            <h2>Tablica wynikow</h2>
            {#each match.stateJson.players as player, index}
              <div class:active={index === match.stateJson.currentPlayerIndex} class="score-row">
                <div class="inline item-head">
                  {#if getPlayerPlace(index)}
                    <span class={`place-badge place-${getPlayerPlace(index)}`}>{getPlayerPlace(index)}</span>
                  {/if}
                  <strong>{player.name}</strong>
                </div>
                {#if getRatingPreview(player.participantId)}
                  <span class="rating-outlook">
                    +{getRatingPreview(player.participantId)?.winDelta} / -{getRatingPreview(player.participantId)?.lossDelta} dRating
                  </span>
                {/if}
                {#if match.mode === "cricket"}
                  <span class="pill">Punkty: {player.cricketPoints}</span>
                {:else}
                  <span class="pill">Cel: {player.atcTarget}</span>
                {/if}
                <span class="muted">Sety {player.setsWon} | Legi {player.legsWon} | Avg {player.stats.threeDartAverage}</span>
                <span class="muted">
                  50+ {player.stats.turn50Plus} | 100+ {player.stats.turn100Plus} | 180 {player.stats.turn180} | Busts {player.stats.busts}
                </span>
              </div>
            {/each}
          </article>

          <article class="card stack match-panel">
            <h2>Panel ruchu</h2>
            {#if match.playMode === "stationary"}
              <div class="list-item compact-note">
                <strong>Tryb stacjonarny</strong>
                <span class="muted">Wyniki dla aktualnego zawodnika wpisuje tworca meczu lub organizator turnieju.</span>
              </div>
            {/if}
            {#if canThrow}
              <label class="field">
                <span>Segment</span>
                <input bind:value={manualScoreDraft} min="0" max={match.mode === "cricket" ? 25 : 20} type="number" />
              </label>
              <label class="field">
                <span>Multiplier</span>
                <select bind:value={manualDartsUsed}>
                  <option value="1">Single</option>
                  <option value="2">Double</option>
                  <option value="3">Triple</option>
                </select>
              </label>
              <div class="inline">
                <button
                  class="primary"
                  on:click={() =>
                    socket.emit("turn:throw", {
                      matchId: id,
                      throw: {
                        segment: Number(manualScoreDraft),
                        multiplier: Number(manualDartsUsed)
                      }
                    })}
                  type="button"
                >
                  Dodaj rzut
                </button>
                <button on:click={commit} type="button">Zatwierdz ture</button>
              </div>
            {:else}
              <div class="list-item compact-note">
                <strong>Tryb podgladu</strong>
                <span class="muted">{getReadOnlyMessage()}</span>
              </div>
            {/if}
          </article>
        </section>
      {/if}
    </div>
  </section>
{:else}
  <section class="match-view">
    <div class="card stack">
      <h2>Ladowanie meczu</h2>
    </div>
  </section>
{/if}
