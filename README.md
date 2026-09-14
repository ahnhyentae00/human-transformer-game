# 세 글자 생성 게임 — Human Transformer Game MVP v0.8

중학생 AI 멘토링에서 여러 명의 멘티가 **하나의 생성형 AI 역할을 공동 수행**하며 다음 흐름을 체험하는 웹게임입니다.

> **Prompt + 누적 Context → 다음 생성 단위 선택 → Context 갱신 → 반복**

게임의 “세 글자”는 실제 Transformer의 token과 동일하지 않습니다. 자동회귀(autoregressive) 생성 과정을 사람이 놀이로 체험하기 위해 만든 **단순화된 생성 단위**입니다.

## 핵심 플레이

1. 멘토가 Prompt와 응답의 첫 세 글자(Seed)를 미리 등록합니다.
2. 생성자는 Prompt와 누적 응답을 항상 확인합니다.
3. 자기 차례가 되면 7초 안에 정확히 세 글자를 입력합니다.
4. 확정된 출력만 Context에 추가되고 다음 생성자에게 넘어갑니다.
5. 설정된 LAP에 도달하면 `GENERATION ENDING`이 발동합니다.
6. 마지막 한 바퀴 안에 Prompt에 대한 응답을 마무리합니다.
7. 생성 완료 후 멘토가 결과를 공개하고 Prompt와 최종 응답을 함께 비교합니다.

---

## 현재 구현된 범위

- 세션 생성, 팀 수/팀별 생성자 수 설정
- 4자리 ROOM CODE
- 익명 참가: 방 코드 + 닉네임
- 생성자 READY 및 게임 시작 전 팀/순번 재배정·자리 교환
- Prompt 카드 생성/수정/삭제
  - 제목
  - 사용자 Prompt
  - Seed
  - Ending LAP
- 모든 팀 × Prompt의 게임 큐 생성
- HOST / PLAYER / 선택적 DISPLAY / ARCHIVE 화면
- HOST 프로젝터용 `수업 화면`
- 3초 시작 및 턴 재시작 카운트다운
- 숫자 없는 7초 진행 바
- 공백·문장부호 제외 **정확히 3 grapheme** 규칙
- TIME OUT
- 지정 LAP 종료 지령 + 마지막 한 바퀴
- 멘토 조기 종료
- 결과 `미공개 → 공개 → 확정`
- MAIN/HOST에서만 로컬 BGM 재생
- 각 턴의 Context before / output / Context after 저장
- 팀별 동일 Prompt 결과 비교 아카이브
- 전체 게임 완료 시 SESSION COMPLETE
- **v0.5 교실 안전 제어**
  - 일시정지 / 남은 시간부터 재개
  - 현재 턴 7초 재시작
  - 현재 생성자 건너뛰기(SKIPPED 기록)
  - HOST 최근 5턴 확인

---

## GitHub / CI / Railway 준비 상태 (v0.8)

- `.github/workflows/ci.yml` 포함
- GitHub Actions에서 Node.js 24로 `preflight → qa → typecheck → build` 검증
- 실제 Supabase 비밀키는 저장소에 커밋하지 않음
- CI는 빌드 검증용 더미 Public URL/Publishable Key만 사용
- 실제 배포 환경변수는 Railway 서비스 Variables에 별도로 등록

저장소 생성과 업로드 절차는 `GITHUB_SETUP.md`, Railway 배포는 `RAILWAY_DEPLOYMENT.md`, 공통 배포 점검은 `DEPLOYMENT.md`를 참고합니다.

---

# 기술 스택

- TypeScript
- Next.js App Router
- React
- Supabase
  - PostgreSQL
  - Anonymous Auth
  - Realtime
  - RLS + SECURITY DEFINER RPC

---

# 역할별 화면

## `/host/[roomCode]`

멘토 운영 화면이자 기본 MAIN 화면입니다.

- Prompt / 누적 응답 / 현재 생성자 / LAP
- 7초 진행 바
- 종료 지령
- Prompt 관리
- 참가/READY 현황
- 팀/순번 재배정
- 게임 큐
- 결과 공개/확정
- 아카이브 이동
- 로컬 BGM 파일 선택 및 볼륨
- 프로젝터용 `수업 화면`
- 일시정지 / 재개 / 현재 턴 재시작 / 현재 생성자 건너뛰기

**오디오는 이 브라우저에서만 재생됩니다.**

## `/play/[roomCode]`

생성자의 모바일 입력 화면입니다.

- Prompt 항상 표시
- 현재까지 생성된 Context 표시
- 자기 차례에만 입력 가능
- 숫자 없는 7초 바
- 유효 글자 수 `n / 3`
- 한글 IME composition 처리
- 다른 생성자의 미확정 입력은 보이지 않음
- 일시정지 시 입력 비활성화
- 오디오 없음

## `/archive/[roomCode]`

- Prompt / Seed / 최종 응답
- 팀별 동일 Prompt 결과 비교
- TURN / LAP / 생성자 / outcome
- `Context before → output → Context after`
- TIMEOUT / SKIPPED 포함

## `/display/[roomCode]`

선택적 읽기 전용 미러입니다. 기본 수업 운영에서는 HOST의 `수업 화면` 사용을 권장합니다.

---

# 1. Supabase 설정

## 1-1. 프로젝트 생성

Supabase 프로젝트를 생성합니다.

## 1-2. Anonymous Auth 활성화

Supabase Dashboard에서 **Anonymous Sign-ins**를 활성화합니다.

## 1-3. SQL 적용

### 새 프로젝트

SQL Editor에서 다음 파일 전체를 실행합니다.

```text
supabase/schema.sql
```

### 기존 DB 업그레이드

기존 설치 버전에 따라 순서대로 실행합니다.

```text
v0.2 → v0.3 : supabase/migrations/0002_v0_3_classroom_ux.sql
v0.3 → v0.4 : supabase/migrations/0003_v0_4_prompt_edit_and_presentation.sql
v0.4 → v0.5 : supabase/migrations/0004_v0_5_classroom_safety_controls.sql
```

v0.5 migration은 `game_runs.paused_remaining_ms`와 다음 RPC를 추가합니다.

```text
pause_game
resume_game
restart_current_turn
skip_current_turn
```

---

# 2. 환경변수

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Service Role Key는 사용하지 않습니다.

---

# 3. 실행

```bash
npm install
npm run dev
```

운영 빌드 전:

```bash
npm run qa
npm run typecheck
npm run build
```

---

# 4. 세 글자 규칙

**공백과 Unicode 문장부호를 제외한 grapheme cluster 정확히 3개**여야 합니다.

| 입력 | 유효 글자 수 | 제출 |
|---|---:|---|
| `속에서` | 3 | 가능 |
| `비 오는` | 3 | 가능 |
| `좋아요.` | 3 | 가능 |
| `좋아!` | 2 | 불가 |
| `추천해요` | 4 | 불가 |

입력 원문은 그대로 저장합니다. 공백과 문장부호는 **글자 수 계산에서만 제외**합니다.

7초가 끝났을 때 정확히 3글자가 아니면 `TIME OUT`이며 Context는 바뀌지 않습니다.

---

# 5. 턴 / LAP

5명일 때:

```text
TURN 1~5   → LAP 1
TURN 6~10  → LAP 2
TURN 11~15 → LAP 3
```

현재 생성자와 LAP은 별도 저장하지 않고 `completed_turns`와 `player_count_snapshot`으로 계산합니다.

---

# 6. 시작과 타이머

첫 게임 시작 또는 멘토의 `현재 턴 7초 다시 시작`은 서버 기준 카운트다운을 사용합니다.

```text
server now
  ├─ + 3s  → turn_started_at
  └─ + 10s → turn_deadline_at
```

클라이언트는 `turn_started_at`까지 `3 → 2 → 1`을 표시합니다. 서버 RPC도 시작 전 제출을 거부합니다.

일반 턴 전환은 즉시 다음 7초가 시작됩니다.

---

# 7. 종료 지령

예: 생성자 5명, `ending_lap = 3`

```text
LAP 1: 5턴
LAP 2: 5턴
↓
ENDING NOTICE
"지금부터 한 바퀴 안에 사용자의 요청에 대한 응답을 완성하십시오."
↓ 멘토 확인
ENDING: 최대 5턴
↓
RESULT
```

마지막 한 바퀴에서도 세 글자/7초 규칙은 동일합니다.

`accepted`, `timeout`, `skipped`는 모두 한 번의 생성 기회를 소비합니다.

---

# 8. 교실 안전 제어

## 일시정지

HOST가 활성 턴을 일시정지하면 서버가 **남은 밀리초**를 저장하고 deadline을 제거합니다.

```text
is_paused = true
paused_remaining_ms = 현재 남은 시간
turn_started_at = null
turn_deadline_at = null
```

PLAYER 입력은 비활성화되고 MAIN BGM도 멈춥니다.

## 재개

저장한 `paused_remaining_ms`부터 계속합니다. 새 7초를 지급하지 않습니다.

## 현재 턴 7초 다시 시작

기술 문제·잘못된 포커스 등으로 현재 생성자에게 턴을 다시 주어야 할 때 사용합니다.

- `completed_turns` 증가 없음
- Context 변경 없음
- Turn 기록 추가 없음
- 3초 카운트다운 후 새로운 7초

즉 **게임 결과를 변경하지 않는 운영 복구 기능**입니다.

## 현재 생성자 건너뛰기

해당 턴을 `SKIPPED`로 기록하고 다음 생성자로 넘어갑니다.

- Context 변경 없음
- 한 턴 소비
- 마지막 한 바퀴에서는 남은 생성 기회도 1회 소비

세 글자 미만/초과를 강제로 승인하는 기능은 제공하지 않습니다. 운영 예외 상황에서도 **정확히 세 글자 규칙은 유지**합니다.

---

# 9. BGM

음악은 서버에 업로드하지 않습니다.

멘토가 HOST에서 자신의 기기 오디오 파일을 선택하면 Object URL로 MAIN에서만 재생합니다.

- HOST/MAIN: BGM 재생
- PLAYER: 무음
- Realtime: 음악 재생 위치 동기화 안 함
- 일시정지: BGM도 일시정지

---

# 10. 데이터 모델

```text
Session
├─ Teams
│  ├─ Players (session_memberships)
│  └─ Game Runs
│     └─ Turns
└─ Prompt Cards
```

`game_runs`가 게임 source of truth입니다.

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

각 Turn은 다음을 보존합니다.

```text
context_before
raw_text
effective_char_count
context_after
player
lap
phase
outcome
```

---

# 11. 상태 머신

```text
queued → ready → playing → ending_notice → ending → result → complete
```

`pause`는 별도 phase가 아니라 `playing/ending + is_paused=true`로 표현합니다. 따라서 교육적 게임 단계와 운영 중단 상태를 분리합니다.

---

# 12. 결과 공개

```text
result / result_revealed=false
  ↓ 멘토: 결과 공개
result / result_revealed=true
  ↓ 멘토: 결과 확정
complete
```

Prompt와 최종 응답을 비교하며 instruction following, context 유지, 동일 Prompt에서의 결과 다양성을 토론할 수 있습니다.

---

# 13. QA

핵심 로직은 의존성 설치 없이 검사할 수 있습니다.

```bash
npm run qa
```

현재 확인 범위:

- 세 글자 판정
- 5인 턴/LAP 계산
- Ending LAP 경계
- 마지막 한 바퀴 기회 수
- 5인 표준 시나리오 15턴
- TIMEOUT/SKIPPED의 턴 소비
- pause/resume/restart의 비소비 성질

실제 기기 리허설은 `QA_CHECKLIST.md`, 운영 순서는 `CLASSROOM_RUNBOOK.md`를 사용하세요.

---

# 14. 확인 상태

`npm run qa`는 이 배포본에서 통과했습니다.

GitHub Actions에서 Node.js 24 기준 의존성 설치, preflight, QA, typecheck, Next.js production build까지 통과했습니다. 배포 전 변경사항이 있다면 다음을 다시 수행하세요.

```bash
npm install
npm run typecheck
npm run build
```


# 배포

2026-09 기준 기본 배포 대상은 Railway입니다. `RAILWAY_DEPLOYMENT.md`와 `DEPLOYMENT.md`를 참조하고, 배포 전 `npm run preflight`, `npm run qa`, `npm run typecheck`, `npm run build`를 모두 통과해야 합니다.
