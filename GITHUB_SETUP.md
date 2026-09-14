# GitHub 업로드 준비 — v0.7

## 현재 상태

이 프로젝트는 GitHub에 올릴 수 있도록 정리되어 있습니다. 저장소에는 실제 Supabase 키를 커밋하지 않습니다.

## 1. GitHub에서 빈 저장소 생성

권장 설정:

- Repository name: `human-transformer-game`
- Visibility: **Private** (파일럿 단계 권장)
- `Add a README file`: 끔
- `.gitignore`: None
- License: None

빈 저장소가 생성되면 ChatGPT의 GitHub 연결을 통해 파일 업로드를 이어갈 수 있습니다.

## 2. 직접 Git으로 올리는 경우

프로젝트 루트에서:

```bash
git init
git add -A
git commit -m "release: human transformer game v0.7"
git branch -M main
git remote add origin https://github.com/<OWNER>/human-transformer-game.git
git push -u origin main
```

## 3. GitHub Actions

`.github/workflows/ci.yml`이 자동 실행됩니다.

검증 순서:

```text
preflight → qa → typecheck → build
```

CI는 빌드 검증용 더미 Supabase Public URL/Publishable Key를 사용합니다. 실제 Supabase 자격정보는 Vercel의 Production/Preview Environment Variables에만 등록하세요.

## 4. 저장소 생성 후 다음 단계

1. CI 성공 확인
2. Supabase 프로젝트 생성 및 `supabase/schema.sql` 적용
3. Anonymous Sign-ins 활성화
4. Vercel에서 GitHub 저장소 Import
5. Vercel Environment Variables 등록
6. Production Deploy
7. `npm run smoke:remote` 및 실제 멀티 디바이스 수업 QA
