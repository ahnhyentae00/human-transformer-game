import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL?.replace(/\/$/, "");
if (!baseUrl) throw new Error("BASE_URL is required");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForAnonymousAuth(page, label) {
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));

  const response = await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  if (!response?.ok()) {
    throw new Error(`${label}: home navigation failed with HTTP ${response?.status()}`);
  }

  try {
    await page.waitForFunction(
      () => {
        const button = [...document.querySelectorAll("button")].find((node) =>
          node.textContent?.includes("세션 생성"),
        );
        const authError = [...document.querySelectorAll(".error")].find((node) =>
          node.textContent?.includes("익명 인증 실패"),
        );
        return Boolean((button && !button.disabled) || authError);
      },
      { timeout: 20000 },
    );
  } catch {
    const bodyText = (await page.locator("body").innerText()).slice(0, 2500);
    throw new Error(
      `${label}: anonymous auth did not become ready. body=${JSON.stringify(bodyText)} console=${JSON.stringify(consoleErrors.slice(-10))}`,
    );
  }

  const authError = await page.locator(".error").filter({ hasText: "익명 인증 실패" }).first();
  if (await authError.count()) {
    throw new Error(
      `${label}: ${await authError.innerText()} console=${JSON.stringify(consoleErrors.slice(-10))}`,
    );
  }
}

async function api(page, path, { method = "GET", body } = {}) {
  return page.evaluate(
    async ({ path, method, body }) => {
      const response = await fetch(path, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        // keep text for diagnostics
      }
      return { ok: response.ok, status: response.status, json, text };
    },
    { path, method, body },
  );
}

function expectOk(result, label) {
  if (!result.ok) {
    throw new Error(`${label} failed: HTTP ${result.status} ${result.text.slice(0, 800)}`);
  }
  return result.json;
}

async function waitUntilIso(iso, extraMs = 150) {
  if (!iso) return;
  const ms = Date.parse(iso) - Date.now() + extraMs;
  if (ms > 0) await sleep(ms);
}

const browser = await chromium.launch({ headless: true });
const hostContext = await browser.newContext();
const playerContext = await browser.newContext();
const hostPage = await hostContext.newPage();
const playerPage = await playerContext.newPage();

let roomCode = null;

try {
  await waitForAnonymousAuth(hostPage, "host");

  const sessionResult = await api(hostPage, "/api/sessions", {
    method: "POST",
    body: {
      title: `__PRODUCTION_E2E__ ${new Date().toISOString()}`,
      teamSizes: [1],
    },
  });
  const sessionJson = expectOk(sessionResult, "create session");
  roomCode = sessionJson.session.room_code;
  assert(roomCode, "room code missing after session creation");

  await waitForAnonymousAuth(playerPage, "player");

  const joinJson = expectOk(
    await api(playerPage, `/api/rooms/${roomCode}/join`, {
      method: "POST",
      body: { displayName: "__E2E_PLAYER__" },
    }),
    "join session",
  );
  assert(joinJson.membership?.role === "player", "player membership was not created");

  const readyJson = expectOk(
    await api(playerPage, `/api/rooms/${roomCode}/ready`, {
      method: "POST",
      body: { ready: true },
    }),
    "set ready",
  );
  assert(readyJson.membership?.is_ready === true, "player did not become ready");

  let stateJson = expectOk(
    await api(hostPage, `/api/rooms/${roomCode}/state`),
    "read room state",
  );
  assert(stateJson.memberships?.length === 2, "expected host + one player");
  assert(stateJson.teams?.length === 1, "expected one team");

  const promptJson = expectOk(
    await api(hostPage, `/api/rooms/${roomCode}/prompts`, {
      method: "POST",
      body: {
        title: "Production E2E",
        promptText: "오늘 저녁 메뉴 하나를 추천하고 그 이유를 설명해줘.",
        seedText: "오늘은",
        endingLap: 4,
      },
    }),
    "create prompt",
  );
  assert(promptJson.prompt?.id, "prompt id missing");

  const prepareJson = expectOk(
    await api(hostPage, `/api/rooms/${roomCode}/prepare-games`, { method: "POST" }),
    "prepare game runs",
  );
  assert(Number(prepareJson.gameCount) === 1, `expected 1 game run, got ${prepareJson.gameCount}`);

  stateJson = expectOk(
    await api(hostPage, `/api/rooms/${roomCode}/state`),
    "read prepared state",
  );
  const gameId = stateJson.games?.[0]?.id;
  assert(gameId, "game id missing after prepare");

  const startJson = expectOk(
    await api(hostPage, `/api/games/${gameId}/start`, { method: "POST" }),
    "start game",
  );
  let game = startJson.game;
  assert(game.phase === "playing", `expected playing, got ${game.phase}`);

  await waitUntilIso(game.turn_started_at, 250);

  const invalidTurn = await api(playerPage, `/api/games/${gameId}/turns`, {
    method: "POST",
    body: { text: "좋아!", expectedVersion: game.version },
  });
  assert(
    invalidTurn.status === 422 && invalidTurn.json?.error === "INVALID_CHARACTER_COUNT",
    `invalid 2-character turn was not rejected correctly: ${invalidTurn.status} ${invalidTurn.text}`,
  );

  const acceptedJson = expectOk(
    await api(playerPage, `/api/games/${gameId}/turns`, {
      method: "POST",
      body: { text: "좋아요.", expectedVersion: game.version },
    }),
    "submit valid turn",
  );
  game = acceptedJson.game;
  assert(game.completed_turns === 1, "valid turn did not consume one turn");

  const pauseJson = expectOk(
    await api(hostPage, `/api/games/${gameId}/pause`, {
      method: "POST",
      body: { expectedVersion: game.version },
    }),
    "pause game",
  );
  game = pauseJson.game;
  assert(game.is_paused === true, "game was not paused");

  const resumeJson = expectOk(
    await api(hostPage, `/api/games/${gameId}/resume`, {
      method: "POST",
      body: { expectedVersion: game.version },
    }),
    "resume game",
  );
  game = resumeJson.game;
  assert(game.is_paused === false, "game was not resumed");

  const restartJson = expectOk(
    await api(hostPage, `/api/games/${gameId}/restart-turn`, {
      method: "POST",
      body: { expectedVersion: game.version },
    }),
    "restart current turn",
  );
  game = restartJson.game;

  await waitUntilIso(game.turn_deadline_at, 350);

  const timeoutJson = expectOk(
    await api(hostPage, `/api/games/${gameId}/timeout`, {
      method: "POST",
      body: { expectedVersion: game.version },
    }),
    "expire timed-out turn",
  );
  game = timeoutJson.game;
  assert(game.completed_turns === 2, "timeout did not consume one turn");

  const skipJson = expectOk(
    await api(hostPage, `/api/games/${gameId}/skip`, {
      method: "POST",
      body: { expectedVersion: game.version },
    }),
    "skip current turn",
  );
  game = skipJson.game;
  assert(game.phase === "ending_notice", `expected ending_notice, got ${game.phase}`);

  const ackJson = expectOk(
    await api(hostPage, `/api/games/${gameId}/ending/ack`, { method: "POST" }),
    "acknowledge ending",
  );
  game = ackJson.game;
  assert(game.phase === "ending", `expected ending, got ${game.phase}`);

  await waitUntilIso(game.turn_started_at, 150);

  const endingTurnJson = expectOk(
    await api(playerPage, `/api/games/${gameId}/turns`, {
      method: "POST",
      body: { text: "끝나요.", expectedVersion: game.version },
    }),
    "submit ending turn",
  );
  game = endingTurnJson.game;
  assert(game.phase === "result", `expected result, got ${game.phase}`);

  const revealJson = expectOk(
    await api(hostPage, `/api/games/${gameId}/result/reveal`, { method: "POST" }),
    "reveal result",
  );
  game = revealJson.game;
  assert(game.result_revealed === true, "result was not revealed");

  const completeJson = expectOk(
    await api(hostPage, `/api/games/${gameId}/complete`, { method: "POST" }),
    "complete game",
  );
  game = completeJson.game;
  assert(game.phase === "complete", `expected complete, got ${game.phase}`);

  stateJson = expectOk(
    await api(hostPage, `/api/rooms/${roomCode}/state`),
    "read final state",
  );

  assert(stateJson.session?.status === "complete", `session not complete: ${stateJson.session?.status}`);
  const outcomes = (stateJson.turns ?? []).map((turn) => turn.outcome);
  assert(
    outcomes.join(",") === "accepted,timeout,skipped,accepted",
    `unexpected turn outcomes: ${outcomes.join(",")}`,
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        roomCode,
        gameId,
        sessionStatus: stateJson.session.status,
        gamePhase: game.phase,
        outcomes,
        checks: [
          "anonymous host auth",
          "session creation",
          "anonymous player auth",
          "join",
          "ready",
          "prompt creation",
          "game queue preparation",
          "start countdown",
          "3-character validation",
          "accepted turn",
          "pause/resume",
          "restart turn",
          "timeout",
          "skip",
          "ending notice/ack",
          "ending turn",
          "result reveal",
          "complete",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await playerContext.close();
  await hostContext.close();
  await browser.close();
}
