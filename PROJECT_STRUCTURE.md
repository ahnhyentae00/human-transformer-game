# Project structure — v0.5

```text
human-transformer-game-v0.5/
├─ supabase/
│  ├─ schema.sql
│  └─ migrations/
│     ├─ 0002_v0_3_classroom_ux.sql
│     ├─ 0003_v0_4_prompt_edit_and_presentation.sql
│     └─ 0004_v0_5_classroom_safety_controls.sql
│
├─ scripts/
│  ├─ logic-qa.mjs
│  └─ scenario-qa.mjs
│
├─ src/
│  ├─ app/
│  │  ├─ page.tsx
│  │  ├─ host/[roomCode]/page.tsx
│  │  ├─ play/[roomCode]/page.tsx
│  │  ├─ display/[roomCode]/page.tsx
│  │  ├─ archive/[roomCode]/page.tsx
│  │  └─ api/
│  │     ├─ sessions/...
│  │     ├─ rooms/[roomCode]/...
│  │     ├─ memberships/[membershipId]/assignment/route.ts
│  │     ├─ prompts/[promptId]/route.ts
│  │     └─ games/[gameId]/
│  │        ├─ start/route.ts
│  │        ├─ turns/route.ts
│  │        ├─ timeout/route.ts
│  │        ├─ pause/route.ts
│  │        ├─ resume/route.ts
│  │        ├─ restart-turn/route.ts
│  │        ├─ skip/route.ts
│  │        ├─ ending/trigger/route.ts
│  │        ├─ ending/ack/route.ts
│  │        ├─ finish/route.ts
│  │        ├─ result/reveal/route.ts
│  │        └─ complete/route.ts
│  │
│  ├─ components/
│  │  ├─ game-stage.tsx
│  │  ├─ timer-bar.tsx
│  │  ├─ start-countdown.tsx
│  │  └─ result-reveal.tsx
│  ├─ hooks/
│  ├─ lib/
│  ├─ types/game.ts
│  └─ middleware.ts
│
├─ README.md
├─ QA_CHECKLIST.md
├─ CLASSROOM_RUNBOOK.md
├─ CHANGELOG.md
└─ package.json
```

## 서버 권위 상태

`game_runs`가 게임 상태의 source of truth입니다.

```text
phase
generated_text
completed_turns
remaining_ending_turns
turn_started_at
turn_deadline_at
is_paused
paused_remaining_ms
result_revealed
version
```

현재 생성자, TURN, LAP은 중복 저장하지 않고 `completed_turns`와 `player_count_snapshot`으로 계산합니다.

## 운영 상태와 게임 단계 분리

일시정지는 새 `game_phase`가 아닙니다.

```text
phase = playing | ending
is_paused = true | false
```

이 구조로 `playing → ending_notice → ending`이라는 교육적 단계와, 교실의 일시 중단을 분리합니다.

## v0.5 안전 제어

```text
pause_game(game_id, expected_version)
resume_game(game_id, expected_version)
restart_current_turn(game_id, expected_version)
skip_current_turn(game_id, expected_version)
```

- pause/resume/restart는 턴을 소비하지 않습니다.
- skip은 `turns.outcome='skipped'`로 한 턴을 소비합니다.
- 모든 제어는 HOST 권한과 optimistic `version`을 검증합니다.

## Realtime

클라이언트는 다음 테이블을 구독하고 4초 polling을 fallback으로 사용합니다.

- `game_runs`
- `session_memberships`
- `prompt_cards`

미확정 PLAYER 입력은 공유하지 않습니다. 확정된 출력 또는 TIMEOUT/SKIPPED만 서버 기록에 남습니다.
