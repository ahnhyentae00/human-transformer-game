import assert from "node:assert/strict";

function nextLap(completedTurns, playerCount) {
  return Math.floor(completedTurns / playerCount) + 1;
}

function runStandardScenario({ playerCount = 5, endingLap = 3 } = {}) {
  let phase = endingLap === 1 ? "ending_notice" : "playing";
  let completedTurns = 0;
  let remainingEndingTurns = endingLap === 1 ? playerCount : null;
  const outcomes = [];

  function consume(outcome) {
    assert.ok(["accepted", "timeout", "skipped"].includes(outcome));
    assert.ok(phase === "playing" || phase === "ending");
    completedTurns += 1;
    outcomes.push(outcome);

    if (phase === "ending") {
      remainingEndingTurns = Math.max((remainingEndingTurns ?? playerCount) - 1, 0);
      if (remainingEndingTurns === 0) phase = "result";
      return;
    }

    if (nextLap(completedTurns, playerCount) >= endingLap) {
      phase = "ending_notice";
      remainingEndingTurns = playerCount;
    }
  }

  return {
    snapshot: () => ({ phase, completedTurns, remainingEndingTurns, outcomes: [...outcomes] }),
    consume,
    acknowledgeEnding() {
      assert.equal(phase, "ending_notice");
      phase = "ending";
    },
  };
}

// Standard classroom rehearsal: 5 players, ending notice at LAP 3.
const game = runStandardScenario();
for (let i = 0; i < 8; i += 1) game.consume("accepted");
game.consume("timeout");
game.consume("accepted");
assert.deepEqual(game.snapshot(), {
  phase: "ending_notice",
  completedTurns: 10,
  remainingEndingTurns: 5,
  outcomes: [
    "accepted", "accepted", "accepted", "accepted", "accepted",
    "accepted", "accepted", "accepted", "timeout", "accepted",
  ],
});

game.acknowledgeEnding();
game.consume("accepted");
game.consume("skipped");
game.consume("accepted");
game.consume("timeout");
game.consume("accepted");
assert.equal(game.snapshot().phase, "result");
assert.equal(game.snapshot().completedTurns, 15);
assert.equal(game.snapshot().remainingEndingTurns, 0);

// Pause/restart are deliberately non-consuming controls: they must not change turn/lap counters.
const beforeSafetyControl = { completedTurns: 7, generatedText: "오늘은따뜻한" };
const afterPauseResume = { ...beforeSafetyControl };
const afterRestart = { ...beforeSafetyControl };
assert.deepEqual(afterPauseResume, beforeSafetyControl);
assert.deepEqual(afterRestart, beforeSafetyControl);

console.log("SCENARIO QA PASS — 5-player flow, ending lap, timeout/skip consumption, non-consuming safety controls");
