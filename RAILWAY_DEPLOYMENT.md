# Railway 배포 가이드 — Human Transformer Game v0.8

이 프로젝트는 Railway에서 **Next.js self-hosted Node.js 서비스**로 실행하도록 준비되어 있습니다.

## 1. 준비된 항목

- `next.config.ts`: `output: "standalone"`
- `package.json` start: `node .next/standalone/server.js`
- Node.js: `>=22` / CI 검증은 Node.js 24
- 배포 health endpoint: `/api/health`
- Supabase public 환경변수만 사용
- GitHub Actions에서 preflight / QA / typecheck / build 검증

Railway는 `PORT`를 자동 주입하므로 직접 지정하지 않습니다.

## 2. Railway 프로젝트 생성

1. Railway에서 **New Project**
2. **Deploy from GitHub repo**
3. GitHub 저장소 `ahnhyentae00/human-transformer-game` 선택
4. 서비스 생성

별도의 Railway PostgreSQL은 만들 필요가 없습니다. 데이터베이스/Auth/Realtime은 기존 설계대로 Supabase를 사용합니다.

## 3. Railway Variables

서비스의 **Variables** 탭에 다음 두 값을 등록합니다.

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

주의:

- `service_role` / secret key를 `NEXT_PUBLIC_*`에 넣지 않습니다.
- 두 변수는 Next.js client bundle에도 필요한 browser-safe public 값입니다.
- Railway 변수는 build와 runtime 모두에 전달됩니다.

## 4. Build / Start

Railway의 기본 Railpack 자동 감지를 사용합니다.

- Build command: `npm run build`
- Start command: package.json의 `npm start`
- 실제 start: `node .next/standalone/server.js`

별도 Dockerfile은 필요하지 않습니다.

## 5. Healthcheck

서비스 Settings의 Healthcheck Path를 다음으로 설정합니다.

```text
/api/health
```

Supabase public 환경변수가 없으면 이 endpoint는 503을 반환합니다.
두 변수가 정상적으로 설정되면 200을 반환합니다.

Railway가 `PORT`를 자동 주입하고 healthcheck에도 같은 포트를 사용하므로 `PORT`를 수동 설정하지 않습니다.

## 6. Public Domain

배포 성공 후:

1. Service → Settings
2. Networking
3. **Generate Domain**

생성된 URL을 기록합니다.

## 7. Supabase 사전 조건

Supabase에서 다음 항목이 완료되어 있어야 합니다.

1. Anonymous Sign-ins 활성화
2. 새 DB라면 `supabase/schema.sql` 전체 적용
3. 기존 DB라면 필요한 migration 적용
4. 게임에서 사용하는 테이블의 Realtime 사용 가능 상태 확인
5. RLS / SECURITY DEFINER RPC 정책 확인

## 8. 배포 후 smoke test

로컬에서:

```bash
BASE_URL=https://YOUR-RAILWAY-DOMAIN npm run smoke:remote
```

최소 확인 항목:

- `GET /api/health` → 200
- 홈 화면 렌더링
- SESSION 생성
- PLAYER 익명 접속
- READY
- HOST ↔ PLAYER Realtime 동기화
- 턴 제출
- TIMEOUT
- pause / resume / restart / skip
- ending notice → ending → result
- 모바일 한글 IME 입력

## 9. 권장 실제 수업 검증

최종 검증은 최소 다음 구성으로 진행합니다.

- HOST 1대
- PLAYER 5대
- 서로 다른 브라우저/모바일 포함
- 동일 Wi-Fi와 모바일 데이터 환경 각각 확인
- 5인 표준 시나리오 1회 완주

## 10. 배포 실패 시 우선 확인 순서

1. Railway Variables 두 개가 정확한가
2. Build log에서 `npm run build`가 통과했는가
3. Start log에서 standalone server가 실행되는가
4. `/api/health`가 200인가
5. Supabase Anonymous Auth가 활성화되어 있는가
6. RLS/RPC 오류가 발생하는가
7. Realtime subscription이 동작하는가

---

Railway는 GitHub push 기반 자동 배포를 사용할 수 있으므로, 이후 `main` 변경사항을 자동 배포하도록 연결해 두는 것을 권장합니다.
