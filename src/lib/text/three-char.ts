const graphemeSegmenter = new Intl.Segmenter("ko", {
  granularity: "grapheme",
});

// 공백과 Unicode 문장부호는 글자 수에서 제외한다.
const IGNORABLE = /^[\p{P}\p{Z}\s]+$/u;

export function splitGraphemes(input: string): string[] {
  return Array.from(graphemeSegmenter.segment(input), (part) => part.segment);
}

export function countEffectiveCharacters(input: string): number {
  return splitGraphemes(input).filter((segment) => !IGNORABLE.test(segment)).length;
}

export function validateThreeCharacterOutput(input: string) {
  const effectiveCount = countEffectiveCharacters(input);

  if (effectiveCount < 3) {
    return {
      ok: false as const,
      effectiveCount,
      reason: "TOO_SHORT" as const,
      message: "공백과 문장부호를 제외하고 세 글자를 입력하세요.",
    };
  }

  if (effectiveCount > 3) {
    return {
      ok: false as const,
      effectiveCount,
      reason: "TOO_LONG" as const,
      message: "세 글자를 초과했습니다. 세 글자로 줄여주세요.",
    };
  }

  return {
    ok: true as const,
    effectiveCount: 3,
  };
}
