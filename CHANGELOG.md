# Changelog

## v0.8.3 — Railway standalone static asset fix

- Next.js standalone runtime에 `.next/static`을 명시적으로 복사
- `public/`이 존재할 경우 standalone runtime에 함께 복사
- production browser E2E에서 발견된 `/_next/static/*` 404 문제 수정
- standalone QA가 실제 runtime static 경로를 검증하도록 강화


## v0.8.1 — Railway healthcheck hardening

- Railway liveness healthcheck와 Supabase readiness 검사를 분리
  - `/api/health`: 앱 프로세스가 살아 있으면 항상 HTTP 200
  - `/api/readiness`: Supabase public 환경변수가 준비된 경우에만 HTTP 200
- standalone 서버를 `0.0.0.0`에 명시적으로 바인딩
- remote smoke test가 liveness와 readiness를 각각 검증하도록 수정


## v0.8 — Railway deployment handoff

- Railway self-hosting을 위한 `next.config.ts` 추가
  - `output: "standalone"`
- production start script를 Next.js standalone server로 변경
- `/api/health` 버전을 0.8.0으로 정합화
- deploy preflight에 Railway standalone 설정 검증 추가
- `RAILWAY_DEPLOYMENT.md` 추가
- Vercel 종속 없이 GitHub → Railway → Supabase 구조로 배포 가능하도록 준비

## v0.7 — GitHub/CI handoff

- GitHub Actions CI 추가 (`.github/workflows/ci.yml`)
- Node.js 24 기준 자동 검증: preflight / QA / typecheck / build
- 저장소 생성 후 업로드를 위한 `GITHUB_SETUP.md` 추가
- `.nvmrc` 추가
- package script `npm run ci` 추가
- 배포 문서에 CI와 환경변수 분리 원칙 추가

## v0.6 — 웹 배포 준비 및 2026-09 공식 문서 정합화

- Next.js를 15.5.24로 고정(2026-08 보안 릴리스 반영)
- Supabase 환경변수를 Publishable key 명칭으로 전환
- 기존 `NEXT_PUBLIC_SUPABASE_ANON_KEY`는 코드상 임시 fallback만 유지
- Supabase SSR middleware에서 `auth.getClaims()` 사용
- 루트 렌더링을 `force-dynamic`으로 설정
- 교육용 비공개 서비스 성격에 맞춰 robots noindex
- `/api/health` 배포 상태 점검 endpoint 추가
- `npm run preflight`, `npm run check:deploy` 추가
- `DEPLOYMENT.md` 추가

## v0.5.0

- 실제 교실 운영 중 예외 상황을 위한 HOST 안전 제어 추가
  - `일시정지`: 남은 턴 시간을 서버에 보존
  - `재개`: 보존한 남은 시간부터 계속
  - `현재 턴 7초 다시 시작`: 턴 소비 없이 3초 카운트다운 + 새 7초
  - `현재 생성자 건너뛰기`: `SKIPPED` 기록 후 다음 생성자로 이동
- `game_runs.paused_remaining_ms` 추가
- PLAYER 일시정지 상태 입력 차단 및 안내
- 수업 화면에서 pause 시 BGM도 정지
- HOST 최근 5턴 운영 기록 표시
- `pause/resume/restart-turn/skip` API route 추가
- `0004_v0_5_classroom_safety_controls.sql` migration 추가
- 표준 5인 시나리오 자동 QA 추가
- `CLASSROOM_RUNBOOK.md` 추가
- `QA_CHECKLIST.md`를 v0.5 안전 제어까지 확장

## v0.4.0

- HOST 프로젝터용 `수업 화면` 모드 추가
- Prompt 카드 수정 기능 추가
- PLAYER 자기 차례 진동/시각 강조
- 핵심 규칙 QA 및 수업용 체크리스트 추가

## v0.3.0

- 서버 기준 3초 시작 카운트다운
- 멘토 팀/순번 재배정 및 자리 교환
- 종료 지령 애니메이션 강화
- 결과 `미공개 → 공개 → 확정` 단계 추가

- 원격 배포 smoke test 스크립트 추가 (`BASE_URL=... npm run smoke:remote`)
