# TECHZONE 공개 데모 배포

이 문서는 단일 Linux 서버에 TECHZONE 포트폴리오 데모를 배포하는 기준 절차입니다.
실제 PG·택배·SMS는 Mock adapter를 유지하고, 고객 스토어와 관리자 CMS는 같은
HTTPS 도메인에서 제공합니다.

## 배포 구조

```text
Internet
  └─ Caddy :80/:443
       ├─ demo.example.kr       → Edge Nginx → Storefront/Admin/Gateway
       ├─ media.demo.example.kr → MinIO API
       └─ grafana.demo.example.kr → Grafana (observability 프로필 사용 시)
```

Caddy가 TLS 인증서 발급과 갱신을 담당합니다. PostgreSQL, RabbitMQ, MinIO Console,
Grafana, Gateway 직접 포트는 `127.0.0.1`에만 바인딩합니다.

## 요구 환경

- 공개 IPv4가 있는 Linux x86_64 서버
- Docker Engine과 Docker Compose v2
- Node.js 22 이상과 npm 10
- 권장 시작 사양: 4 vCPU, 메모리 8GB, SSD 50GB
- 인바운드 허용 포트: TCP 80·443, UDP 443, 관리용 SSH

관측성 스택까지 함께 실행하면 메모리 여유가 더 필요합니다. 기본 데모 명령은
Prometheus·Tempo·Loki·Grafana를 제외하고, 필요할 때만 별도 프로필로 켭니다.

## 1. DNS 준비

아래 세 레코드를 서버의 공개 IP로 연결합니다.

| 레코드 | 용도 |
| --- | --- |
| `demo.example.kr` | 고객 스토어·관리자·API |
| `media.demo.example.kr` | 상품 이미지 업로드·조회 |
| `grafana.demo.example.kr` | 선택적 운영 대시보드 |

DNS 전파가 끝나기 전에는 Caddy의 인증서 발급이 완료되지 않습니다.

## 2. 비밀 환경파일 생성

저장소를 내려받고 실제 도메인과 인증서 알림 이메일로 환경파일을 생성합니다.

```bash
git clone https://github.com/lulupang2/ecommerce.git
cd ecommerce
npm ci
npm run demo:env -- \
  demo.example.kr \
  owner@example.kr
```

명령은 RSA 2048 서명키와 관리자·DB·RabbitMQ·MinIO·Grafana 비밀번호를 무작위로
만들어 `.env.demo`에 저장합니다. 기존 파일은 자동으로 덮어쓰지 않으며,
비밀값을 터미널에 출력하지 않습니다. `.env.demo`는 Git에서 제외됩니다.

배포 전 사전 점검을 실행합니다.

```bash
npm run demo:preflight
```

다음을 모두 통과해야 합니다.

- `NODE_ENV=production`
- 기본 비밀번호와 placeholder 미사용
- RS256용 2048비트 이상 RSA 개인키
- HTTPS origin·미디어 endpoint와 도메인 일치
- 웹 upstream과 관리 포트가 `127.0.0.1`에만 바인딩
- 두 Compose 파일의 병합 결과가 유효함

## 3. 실행

가벼운 공개 데모:

```bash
npm run demo:up
```

Grafana와 전체 관측성 스택 포함:

```bash
npm run demo:up:observability
```

초기 실행은 이미지 빌드, migration, seed 때문에 시간이 걸립니다. 상태를
확인합니다.

```bash
docker compose \
  --env-file .env.demo \
  -f docker-compose.yml \
  -f infra/docker/compose.demo.yml \
  ps

curl --fail https://demo.example.kr/health/ready
curl --fail https://demo.example.kr/
curl --fail https://demo.example.kr/admin/
```

관리자 계정은 `.env.demo`의 `ADMIN_EMAIL`과 `ADMIN_PASSWORD`를 사용합니다.
이 값은 포트폴리오 검토자에게 직접 공개하지 말고, 별도 체험 계정을 추가하는
방식을 권장합니다.

## 4. 업데이트

```bash
git pull --ff-only
npm ci
npm run demo:preflight
npm run demo:up
```

migration은 애플리케이션보다 먼저 실행되고, 기존 적용 이력은
`drizzle_migrations`에 보존됩니다. seed는 자연 키를 사용해 재실행할 수 있습니다.

## 5. 백업과 복구

배포 전에 PostgreSQL 전체 백업을 생성합니다.

```bash
docker compose \
  --env-file .env.demo \
  -f docker-compose.yml \
  -f infra/docker/compose.demo.yml \
  exec -T postgres pg_dumpall -U canvas > techzone-backup.sql
```

`.env.demo`, PostgreSQL dump, Caddy의 `caddy-data` 볼륨을 서로 다른 안전한 위치에
보관합니다. `.env.demo`를 잃으면 기존 JWT 서명키와 서비스 비밀값을 복구할 수
없습니다.

## 6. 운영 점검

- `/health/ready` 실패 시 `gateway`, `migration`, `seed` 로그부터 확인합니다.
- 관리자 `/admin/system/`에서 outbox 지연, DLQ, 실패 Saga를 확인합니다.
- 관측성 프로필 사용 시 Grafana의 오류율·p95·RabbitMQ·DB pool 대시보드를
  확인합니다.
- 공개 서버에서는 15173, 18080, 13000, 15672, 19000, 19001 포트를 방화벽으로
  열지 않습니다.

```bash
docker compose \
  --env-file .env.demo \
  -f docker-compose.yml \
  -f infra/docker/compose.demo.yml \
  logs --tail=200 caddy gateway auth order inventory
```

## 종료

컨테이너만 종료하고 데이터 볼륨은 보존합니다.

```bash
npm run demo:down
```

`docker compose down -v`는 PostgreSQL·MinIO를 포함한 데이터를 삭제하므로 공개
데모 서버에서 사용하지 않습니다.
