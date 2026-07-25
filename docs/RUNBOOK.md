# TECHZONE 실행·복구 Runbook

## 요구 환경

- Node.js 22 이상, npm 10
- Docker Desktop
- Android 빌드 시 JDK 21과 Android SDK

## 최초 실행

```bash
npm ci
npm run ms:up
```

`ms:up`은 PostgreSQL, RabbitMQ, Redis, MinIO, migration·seed, 13개 NestJS
앱, 두 Next.js 앱과 관측성 스택을 빌드하고 실행합니다. 다른 터미널에서 상태를
확인합니다.

```bash
docker compose ps
curl http://localhost:18080/health/ready
```

| 대상 | 주소·계정 |
| --- | --- |
| 스토어 | `http://localhost:15173` |
| 관리자 | `http://localhost:15173/admin` |
| Gateway API | `http://localhost:18080/api` |
| 관리자 로그인 | `admin@techzone.local` / `TechzoneAdmin123!` |
| Grafana | `http://localhost:13000` · `admin` / `techzone` |
| RabbitMQ | `http://localhost:15672` |
| MinIO | `http://localhost:19001` |

## 일상 개발

전체 인프라를 Docker로 실행한 상태에서 특정 workspace만 검사할 수 있습니다.

```bash
npm run typecheck -w @techzone/order
npm run build -w @techzone/admin
npm run test:unit
npm run test:contract
```

공개 DTO나 이벤트를 수정했다면 생성물을 갱신하고 diff를 함께 커밋합니다.

```bash
npm run generate:api
git diff -- packages/api-client/src/generated
```

## 전체 품질 게이트

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:contract
npm run build

# Docker 스택이 healthy인 상태
npm run test:security
npm run test:integration
npm run test:storefront
npm run test:browser-e2e
npm run test:resilience

npm run --silent k8s:render > techzone-k8s.json
npm run k8s:validate -- techzone-k8s.json
```

통합 테스트는 주문→결제→재고 예약→출고→배송과 반품→환불, projection rebuild,
권한·감사로그를 검증합니다. 장애 복구 테스트는 RabbitMQ 중단 중 주문을
커밋하고 재기동 후 outbox 발행과 Saga 완료를 확인합니다.

## Android debug APK

```bash
npm run build:mobile
npm run mobile:sync
cd apps/mobile/android
./gradlew assembleDebug
```

Windows PowerShell에서는 마지막 명령을 `.\gradlew.bat assembleDebug`로
실행합니다. 산출물은
`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`입니다.

## DB migration과 seed

앱 부팅 중 DDL을 실행하지 않습니다. 각 서비스의 `drizzle/` baseline과 공통
messaging migration을 단일 작업이 순서대로 적용합니다.

```bash
npm run db:migrate
npm run db:seed
```

seed는 개발·테스트 환경에서만 명시적으로 실행합니다. 기존 데이터가 있어도
slug·SKU 같은 자연 키를 기준으로 재실행할 수 있습니다.

개발 DB를 완전히 초기화할 때만 다음 명령을 사용합니다.

```bash
docker compose down -v
docker compose up --build -d
```

`-v`는 PostgreSQL·Redis·MinIO를 포함한 로컬 볼륨을 삭제합니다.

## 장애 진단

1. Gateway와 대상 서비스의 readiness를 확인합니다.
2. Grafana에서 오류율, p95, outbox 지연, DLQ와 correlation ID를 확인합니다.
3. 구조화 로그에서 같은 `requestId`·`traceId`·`eventId` 흐름을 추적합니다.
4. 주문 상세의 Saga 타임라인에서 실패 단계와 보상 결과를 확인합니다.

```bash
docker compose ps
docker compose logs --tail=200 gateway order payment inventory fulfillment
docker compose exec -T postgres psql -U canvas -d admin
```

### RabbitMQ 장애

- 쓰기 요청이 DB와 outbox에 커밋됐는지 확인합니다.
- RabbitMQ 정상화 후 publisher가 미발행 이벤트를 전송하는지 확인합니다.
- 5회 재시도 후 DLQ로 이동한 메시지는 관리자 `/admin/system/`에서 원인을
  확인하고 한 건씩 재처리합니다.

### Admin projection 불일치

- 원본 주문·결제·재고·배송 상태를 먼저 확인합니다.
- event ID 중복 또는 미처리 이벤트 여부를 확인합니다.
- 원인이 제거된 뒤 슈퍼관리자 권한과 감사 사유로 `POST /api/admin/rebuild`를
  호출합니다.
- KPI와 원본 합계, 목록 개수를 다시 비교합니다.

### 로그인 후 대시보드 오류

- `/api/auth/session`과 `/api/auth/refresh` 응답을 확인합니다.
- 웹 요청에 `tz_refresh` HttpOnly 쿠키와 CSRF 헤더가 포함되는지 확인합니다.
- Auth와 Redis readiness, refresh token family 폐기 여부를 확인합니다.
- 만료·재사용 감지로 family가 폐기된 경우 다시 로그인합니다.

## Kubernetes 배포 순서

실제 secret을 저장소에 커밋하지 않습니다.

```bash
kubectl apply -f infra/kubernetes/rbac.yaml
npm run k8s:render | kubectl apply --dry-run=server -f -
npm run k8s:render | kubectl apply -f -
```

1. 외부 Secret Manager 또는 `kubectl create secret generic`으로 secret을 만듭니다.
2. migration Job이 성공한 뒤 애플리케이션 Deployment를 진행합니다.
3. readiness·liveness·startup probe와 HPA, PDB 상태를 확인합니다.
4. 주문 smoke test와 단일 correlation ID trace를 확인합니다.

## 종료

```bash
docker compose down
```
