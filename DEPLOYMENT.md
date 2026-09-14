# 배포 절차 — v0.8 Deployment Candidate

## 현재 권장 구성

- Next.js 15.5.24
- Node.js 24 계열 권장
- Supabase PostgreSQL + Anonymous Auth + Realtime
- **Railway: 현재 1순위 배포 대상**
- Vercel: 대체 배포 대상

Railway 상세 절차는 `RAILWAY_DEPLOYMENT.md`를 기준으로 합니다.

## 1. 사전 점검

```bash
npm install
npm run preflight
npm run qa
npm run typecheck
npm run build
```

GitHub Actions도 `main` push 및 PR에서 같은 핵심 검증을 수행합니다.

## 2. Supabase

1. 프로젝트 생성
2. Anonymous Sign-ins 활성화
3. 새 DB라면 `supabase/schema.sql` 전체 실행
4. 기존 DB라면 필요한 migration 적용
5. Project URL과 **Publishable key** 확인
6. Realtime / RLS / RPC 상태 확인

환경변수:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Service Role / Secret key를 `NEXT_PUBLIC_*`에 넣지 않습니다.

## 3. Railway

저장소는 Railway self-hosting을 위해 다음과 같이 준비되어 있습니다.

- `next.config.ts` → `output: "standalone"`
- `npm start` → `node .next/standalone/server.js`
- Railway가 주입하는 `PORT` 사용
- `/api/health` healthcheck 지원

정확한 절차는:

```text
RAILWAY_DEPLOYMENT.md
```

## 4. Vercel

필요하면 여전히 Next.js 프로젝트로 배포할 수 있습니다. 단, 현재 기본 배포 경로는 Railway입니다.

## 5. 배포 직후 smoke test

배포 URL이 나온 뒤:

```bash
BASE_URL=https://YOUR-DEPLOYED-DOMAIN npm run smoke:remote
```

자동 검사:

- `/api/health` → 200
- Supabase public env 설정 여부
- 앱 버전 `0.8.0`
- 홈 화면
- `noindex`

별도로 실제 교실 흐름을 확인해야 합니다.

- HOST 세션 생성
- PLAYER 익명 참가
- READY
- Prompt / Queue
- 3초 countdown
- 7초 turn
- 정확한 3글자 제출
- TIMEOUT
- pause / resume / restart / skip
- ending
- result / archive
- 새로고침 및 Realtime 복구

## 6. 공개 파일럿 전 보안 점검

- Supabase RLS 재확인
- 학생 개인정보 대신 닉네임 사용
- `robots: noindex` 유지
- Anonymous Sign-in 남용 방지 필요 시 CAPTCHA/Turnstile 검토
- 데이터 보존/삭제 정책 결정
