# 배포 절차 — v0.7 Deployment Candidate

## 현재 권장 구성

- Next.js 15.5.24 (Maintenance LTS, 2026-08 보안 패치 포함)
- Node.js 24.x on Vercel
- Supabase PostgreSQL + Anonymous Auth + Realtime
- Vercel

## 1. 로컬 사전 점검

```bash
npm install
npm run preflight
npm run qa
npm run typecheck
npm run build
npm run dev
```

`/api/health`가 HTTP 200과 `"ok": true`를 반환해야 합니다.

## 2. Supabase

1. 새 프로젝트 생성
2. Anonymous Sign-ins 활성화
3. SQL Editor에서 `supabase/schema.sql` 전체 실행
4. Project URL과 **Publishable key** 확인
5. Realtime에서 `game_runs`, `session_memberships`, `prompt_cards`의 Postgres Changes가 사용 가능한지 확인
6. RLS가 모든 public 테이블에서 활성화되어 있는지 확인

환경변수:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

브라우저에 Service Role / Secret key를 넣지 않습니다.

## 3. Git 저장소

```bash
git init
git add -A
git commit -m "release: human transformer game v0.7 deployment candidate"
git branch -M main
```

GitHub/GitLab/Bitbucket의 비어 있는 저장소에 push합니다.


## GitHub Actions CI

저장소에 포함된 `.github/workflows/ci.yml`은 `main` push 및 pull request에서 다음 검증을 수행합니다.

```text
preflight → qa → typecheck → build
```

CI에 실제 Supabase 프로젝트 키를 넣지 않습니다. 빌드 검증에는 더미 Public URL/Publishable Key를 사용하며, 실제 Production/Preview 값은 Vercel Environment Variables에만 설정합니다.

## 4. Vercel

1. `Add New Project`
2. 저장소 Import
3. Framework Preset: Next.js
4. Root Directory: `.`
5. Node.js Version: **24.x**
6. Environment Variables에 위 두 Supabase 값을 Production/Preview에 등록
7. Deploy

## 5. 배포 직후 smoke test

- `/api/health` → 200
- `/` → 세션 생성/입장 화면
- HOST에서 1팀 2명 세션 생성
- PLAYER 2명 익명 참가
- READY → Prompt 생성 → Queue → Game Start
- 3초 countdown → 7초 turn
- 2글자/4글자 제출 거부
- 정확한 3글자 제출
- TIMEOUT
- Ending Lap → 마지막 한 바퀴
- Result reveal
- Archive
- 새로고침 후 세션 복구

## 6. 공개 파일럿 전 보안 점검

- Supabase RLS 정책 재확인
- 학생 개인정보 대신 닉네임만 사용
- 공개 검색 노출 방지를 위해 `robots: noindex` 유지
- Anonymous Sign-in 남용이 우려되면 Supabase CAPTCHA/Turnstile 도입
- 수업 종료 후 데이터 보존/삭제 정책 결정

## 계정 인증이 필요한 단계

Vercel/Git 공급자/Supabase 계정에 대한 사용자 인증이 필요합니다. 따라서 인증된 브라우저 또는 해당 서비스의 CLI 환경에서 위 절차를 수행해야 합니다.

## 7. 원격 smoke test

배포 URL이 나온 뒤 로컬에서 다음을 실행합니다.

```bash
BASE_URL=https://YOUR-APP.vercel.app npm run smoke:remote
```

검사 항목은 `/api/health`, 홈 화면, 배포 버전, `noindex`입니다. 실제 멀티 디바이스 게임 흐름은 별도 교실 시나리오 QA가 필요합니다.
