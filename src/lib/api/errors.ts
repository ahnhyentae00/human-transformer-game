const labels: Record<string, string> = {
  UNAUTHENTICATED: "익명 로그인이 완료되지 않았습니다. 잠시 후 다시 시도해주세요.",
  ROOM_NOT_FOUND: "해당 방을 찾을 수 없습니다.",
  ROOM_NOT_FOUND_OR_NOT_JOINED: "방에 참가하지 않았거나 방을 찾을 수 없습니다.",
  ROOM_FULL: "모든 팀의 참가 인원이 가득 찼습니다.",
  GAME_ALREADY_RUNNING: "이미 게임이 진행 중이라 새로 참가할 수 없습니다.",
  PLAYERS_NOT_READY: "해당 팀의 모든 생성자가 준비 상태가 아닙니다.",
  HOST_ONLY: "멘토만 실행할 수 있는 기능입니다.",
  NOT_ACTIVE_PLAYER: "현재 당신의 차례가 아닙니다.",
  TURN_EXPIRED: "입력 시간이 종료되었습니다.",
  STALE_GAME_VERSION: "이미 다음 턴으로 넘어갔습니다.",
  ACTIVE_GAME_EXISTS: "다른 게임이 현재 진행 중입니다.",
  PREVIOUS_GAME_NOT_COMPLETE: "이 팀의 이전 게임을 먼저 완료해야 합니다.",
  PROMPT_REQUIRED: "프롬프트를 먼저 등록해주세요.",
  PROMPT_NOT_FOUND: "프롬프트 카드를 찾을 수 없습니다.",
  SEED_REQUIRED: "첫 세 글자를 입력해주세요.",
  SEED_MUST_BE_THREE_CHARACTERS: "첫 문장은 공백·문장부호를 제외하고 정확히 세 글자여야 합니다.",
  INVALID_ENDING_LAP: "종료 지령 바퀴는 1~20 사이여야 합니다.",
  INVALID_CHARACTER_COUNT: "공백·문장부호를 제외하고 정확히 세 글자를 입력해주세요.",
  SESSION_ALREADY_STARTED: "게임이 시작된 뒤에는 이 구성을 변경할 수 없습니다.",
  TURN_NOT_STARTED: "아직 시작 카운트다운 중입니다.",
  GAME_PAUSED: "게임이 일시정지되어 있습니다.",
  GAME_ALREADY_PAUSED: "이미 게임이 일시정지되어 있습니다.",
  GAME_NOT_PAUSED: "현재 게임은 일시정지 상태가 아닙니다.",
  RESULT_NOT_REVEALED: "결과를 먼저 공개해주세요.",
  INVALID_ASSIGNMENT: "팀/순번 배정 값이 올바르지 않습니다.",
  TEAM_NOT_FOUND: "대상 팀을 찾을 수 없습니다.",
  INVALID_PLAYER_ORDER: "해당 팀에 없는 생성자 순번입니다.",
  PLAYER_MEMBERSHIP_NOT_FOUND: "생성자 정보를 찾을 수 없습니다.",
};

export function friendlyError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "UNKNOWN_ERROR");
  for (const [key, value] of Object.entries(labels)) {
    if (raw.includes(key)) return value;
  }
  return raw;
}
