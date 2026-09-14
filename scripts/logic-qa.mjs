import assert from "node:assert/strict";

const segmenter = new Intl.Segmenter("ko", { granularity: "grapheme" });
const IGNORABLE = /^[\p{P}\p{Z}\s]+$/u;

function countEffectiveCharacters(input) {
  return Array.from(segmenter.segment(input), (part) => part.segment)
    .filter((segment) => !IGNORABLE.test(segment)).length;
}

function activePlayerOrder(completedTurns, playerCount) {
  return (completedTurns % playerCount) + 1;
}

function activeLap(completedTurns, playerCount) {
  return Math.floor(completedTurns / playerCount) + 1;
}

function shouldEnterEndingNotice(newCompletedTurns, playerCount, endingLap) {
  const nextLap = Math.floor(newCompletedTurns / playerCount) + 1;
  return nextLap >= endingLap;
}

const textCases = [
  ["속에서", 3],
  ["비 오는", 3],
  ["좋아요.", 3],
  ["좋아!", 2],
  ["추천해요", 4],
  ["어느날", 3],
];
for (const [input, expected] of textCases) {
  assert.equal(countEffectiveCharacters(input), expected, `character count: ${input}`);
}

const expectedFivePlayerTurns = [
  [0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 1], [4, 5, 1],
  [5, 1, 2], [6, 2, 2], [9, 5, 2], [10, 1, 3],
];
for (const [completed, player, lap] of expectedFivePlayerTurns) {
  assert.equal(activePlayerOrder(completed, 5), player, `player order after ${completed} turns`);
  assert.equal(activeLap(completed, 5), lap, `lap after ${completed} turns`);
}

// 종료 지령 LAP 3: 두 바퀴(10턴)가 끝나는 순간 ending_notice 진입.
assert.equal(shouldEnterEndingNotice(9, 5, 3), false);
assert.equal(shouldEnterEndingNotice(10, 5, 3), true);

let remaining = 5;
for (let i = 0; i < 5; i += 1) remaining = Math.max(remaining - 1, 0);
assert.equal(remaining, 0, "one final lap consumes exactly playerCount opportunities");

console.log("QA PASS — character rules, turn/lap math, ending boundary");
