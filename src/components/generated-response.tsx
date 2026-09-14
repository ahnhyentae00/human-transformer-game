"use client";

import type { TurnRow } from "@/types/game";

export function GeneratedResponse({
  seedText,
  generatedText,
  turns,
  className = "",
}: {
  seedText: string;
  generatedText: string;
  turns: TurnRow[];
  className?: string;
}) {
  const orderedTurns = turns
    .filter((turn) => turn.raw_text !== null)
    .slice()
    .sort((a, b) => a.turn_number - b.turn_number);

  const segments = [
    { key: "seed", text: seedText, title: "Seed" },
    ...orderedTurns.map((turn) => ({
      key: turn.id,
      text: turn.raw_text ?? "",
      title: `Turn ${turn.turn_number}`,
    })),
  ];

  const reconstructed = segments.map((segment) => segment.text).join("");

  if (reconstructed !== generatedText) {
    return <span className={className}>{generatedText}</span>;
  }

  return (
    <span className={`generated-response-segments ${className}`.trim()}>
      {segments.map((segment) => (
        <span className="generated-response-segment" key={segment.key} title={segment.title}>
          {segment.text}
        </span>
      ))}
    </span>
  );
}
