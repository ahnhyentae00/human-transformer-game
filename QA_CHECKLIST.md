# Classroom QA Checklist — v0.5

실제 멘토링 전에 **HOST 1대 + PLAYER 5대(또는 브라우저 프로필 5개)** 기준으로 한 번 끝까지 리허설합니다.

## A. 준비 / 입장

1. HOST에서 팀 1개, 생성자 5명으로 세션 생성
2. PLAYER 5명이 동일 ROOM CODE로 참가
3. 서로 다른 1~5번 자리에 배정되는지 확인
4. HOST에서 두 생성자의 자리 교환
5. 두 생성자의 READY가 해제되는지 확인
6. 전원 READY 후에만 START 가능한지 확인

## B. Prompt 카드

표준 카드:

- Prompt: `오늘 저녁 메뉴 하나를 추천하고 그 이유를 설명해줘.`
- Seed: `오늘은`
- Ending LAP: `3`

확인:

- `오늘은` 저장 가능
- `비 오는` 입력은 공백 제외 3글자
- `좋아요.`는 문장부호 제외 3글자
- `좋아!`는 2글자라 제출 불가
- Prompt 수정 후 미시작 게임 큐 재구성 가능

## C. 수업 화면 / 시작

1. `수업 화면` 진입
2. ROOM CODE와 READY 현황 확인
3. BGM은 HOST/MAIN에서만 재생
4. START 후 `3 → 2 → 1`
5. 카운트다운 종료 뒤 첫 7초 시작

## D. 기본 턴

5명 기준:

- TURN 1~5 = LAP 1
- TURN 6~10 = LAP 2
- TURN 11~15 = LAP 3

각 턴에서:

1. 현재 생성자만 입력 가능
2. 미확정 입력은 다른 화면에 노출되지 않음
3. 정확히 3글자만 제출 가능
4. TIME OUT은 Context 변경 없이 턴 1회 소비
5. 지원 모바일에서는 자기 턴 진동 확인

## E. v0.5 안전 제어

### 일시정지 / 재개

1. 7초가 약 절반 지난 시점에서 `일시정지`
2. 진행 바와 PLAYER 입력이 정지되는지 확인
3. BGM이 멈추는지 확인
4. 2~3초 기다린 뒤 `게임 재개`
5. **새 7초가 아니라 저장된 남은 시간**부터 진행되는지 확인
6. TURN/LAP/Context가 pause 자체로 변경되지 않는지 확인

### 현재 턴 재시작

1. 턴 중 `현재 턴 7초 다시 시작`
2. 3초 카운트다운이 다시 표시되는지 확인
3. 그 뒤 완전한 7초가 주어지는지 확인
4. completed turn 수가 증가하지 않는지 확인

### 현재 생성자 건너뛰기

1. 확인창이 표시되는지 확인
2. 확정 시 현재 턴이 `SKIPPED`로 기록되는지 확인
3. Context가 바뀌지 않는지 확인
4. 다음 생성자로 이동하는지 확인

## F. 종료 지령

Ending LAP = 3:

1. 10번째 턴 종료 직후 `GENERATION ENDING`
2. 멘토 확인 전 타이머 정지
3. `마지막 한 바퀴 시작` 후 정확히 5회
4. accepted / timeout / skipped 모두 1회 소비
5. 5회를 모두 쓰면 RESULT
6. 조기 종료도 RESULT로 이동

## G. 결과 / Archive

1. RESULT 직후 결과가 미공개인지 확인
2. `결과 공개` 후 Prompt ↔ 응답 표시
3. 공개 전 complete 불가
4. Archive에서 accepted/timeout/skipped 모두 확인
5. Context before/after 보존 확인
6. 같은 Prompt를 여러 팀이 수행하면 결과 비교 확인

## H. Race / 네트워크

1. HOST와 PLAYER timeout race에서 한 턴만 소비
2. stale version 재요청은 `STALE_GAME_VERSION`
3. PLAYER 새로고침 후 기존 익명 세션 복귀
4. 비HOST가 HOST 기능 사용 불가
5. pause 직후 늦게 도착한 submit은 version 또는 paused 상태로 거부

## I. 자동 QA

```bash
npm run qa
```

기대 출력:

```text
QA PASS — character rules, turn/lap math, ending boundary
SCENARIO QA PASS — 5-player flow, ending lap, timeout/skip consumption, non-consuming safety controls
```

## J. 수업 직전

- HOST 충전/전원
- 프로젝터 해상도
- 스피커/BGM 볼륨
- 학생 Wi-Fi
- Supabase Anonymous Sign-in
- DB migration 적용 여부
- Prompt / Seed / Ending LAP
- 테스트 게임 1회
