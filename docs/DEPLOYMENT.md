# TECHZONE 공개 데모 배포

이 문서는 단일 Linux 서버에 TECHZONE 포트폴리오 데모를 배포하는 기준 절차입니다.
실제 PG·택배·SMS는 Mock adapter를 유지하고, 고객 스토어와 관리자 CMS는 같은
HTTPS 도메인에서 제공합니다.

현재 공개 인프라는 아직 생성하지 않았습니다. 1차 대상은 Naver Cloud Platform
한국 리전이며 크레딧 확보 전에는 과금 리소스를 만들지 않습니다. 공급자 선택과
완료 상태는 [전달 상태](STATUS.md)를 따릅니다.

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

### Naver Cloud Platform 준비

초기 NCP 구성은 비용 통제를 위해 다음 리소스로 제한합니다.

| 리소스 | 기준 |
| --- | --- |
| 리전 | 한국 |
| Server | Linux, 최소 2 vCPU·8GB, 권장 4 vCPU·8GB 이상 |
| 네트워크 | VPC, public subnet, Public IP |
| ACG | TCP 80·443, UDP 443, 허용된 관리 IP의 SSH만 허용 |
| 데이터 | 서버 Block Storage와 Docker volume |
| 선택 서비스 | Object Storage 백업 |

Cloud DB, Cloud DB for Cache, Ncloud Simple RabbitMQ, NKS, Load Balancer와 NAT
Gateway는 최초 데모에서 생성하지 않습니다. 2 vCPU 구성은 비용 절감용
최솟값이므로 GitHub Actions에서 이미지를 빌드하고 서버에서는 배포·실행만
담당해야 합니다. 메모리 부족이나 지속적인 CPU 포화가 확인되면 사양을
상향합니다.

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

### GitHub Actions 자동 배포

최초 한 번만 서버에 배포 계정과 공유 환경파일을 준비합니다. 배포 계정은 Docker를
실행할 수 있어야 하며 `/opt/techzone`을 소유해야 합니다.

```bash
sudo install -d -o "$USER" -g "$USER" \
  /opt/techzone/shared \
  /opt/techzone/releases \
  /opt/techzone/backups

git clone https://github.com/lulupang2/ecommerce.git /tmp/techzone-bootstrap
cd /tmp/techzone-bootstrap
npm ci
npm run demo:env -- demo.example.kr owner@example.kr
install -m 0600 .env.demo /opt/techzone/shared/.env.demo
```

GitHub 저장소의 `demo` Environment에 다음 값을 등록합니다.

| 종류 | 이름 | 값 |
| --- | --- | --- |
| Secret | `DEMO_SSH_HOST` | 서버 호스트명 또는 IPv4 |
| Secret | `DEMO_SSH_USER` | Docker 실행 권한이 있는 배포 계정 |
| Secret | `DEMO_SSH_PRIVATE_KEY` | 배포 전용 Ed25519 개인키 |
| Secret | `DEMO_SSH_KNOWN_HOSTS` | 사전에 확인한 서버 host key 한 줄 |
| Variable | `DEMO_DOMAIN` | 공개 데모 도메인 |
| Variable | `DEMO_SSH_PORT` | SSH 포트, 기본값 `22` |
| Variable | `DEMO_DEPLOY_ROOT` | 배포 루트, 기본값 `/opt/techzone` |

`DEMO_SSH_KNOWN_HOSTS`는 신뢰할 수 있는 경로에서 서버 fingerprint를 확인한 뒤
등록합니다. 워크플로 안에서 `ssh-keyscan`으로 즉석 수집하지 않습니다.

Actions의 `Deploy TECHZONE Demo` 워크플로를 열고 `deploy`를 실행합니다. 워크플로는
해당 `main` commit의 CI 성공 여부를 확인하고, 불변 릴리스 디렉터리에 소스를
전송한 뒤 다음 순서로 처리합니다.

1. 기존 PostgreSQL 전체 백업
2. 환경·Compose 사전 검사
3. 이미지 빌드와 migration·서비스 기동
4. Gateway·Storefront·Admin·Media HTTPS 스모크 테스트
5. 성공 시 `current`/`previous` 릴리스 포인터 교체
6. 실패 시 직전 릴리스를 자동 재기동

GitHub Environment의 required reviewer를 설정하면 실제 반영 전에 수동 승인을
강제할 수 있습니다. 관측성 스택은 워크플로의 `observability` 옵션으로 선택합니다.

직전 버전으로 되돌릴 때는 같은 워크플로에서 `rollback`을 선택합니다. 롤백
직전에도 DB 백업을 만들고 스모크 테스트를 통과한 경우에만 릴리스 포인터를
교체합니다. SQL migration 자체를 역으로 실행하지는 않으므로 비호환 DB 변경은
`/opt/techzone/backups`의 dump를 이용한 별도 복구가 필요합니다.

### 수동 업데이트

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

## 크레딧 종료

크레딧 만료 최소 7일 전에 비용과 사용량을 확인합니다.

1. PostgreSQL 전체 dump와 `.env.demo`, 미디어 데이터를 별도 위치에 백업합니다.
2. 공개 데모 유지, 저가 VPS 이전, 일시 중지 중 하나를 결정합니다.
3. 종료할 경우 DNS를 제거하고 Server, Public IP, Block Storage와 선택 서비스를
   콘솔에서 확인해 잔여 과금을 막습니다.
4. 공개 URL을 제거했다면 README와 포트폴리오 소개도 같은 커밋에서 갱신합니다.
