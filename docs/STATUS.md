# TECHZONE 전달 상태

이 문서는 저장소의 현재 완료 범위와 남은 운영 작업을 한눈에 확인하기 위한
체크포인트입니다. 제품 정책과 인터페이스의 기준은 [SSOT](SSOT.md), 실행과
장애 대응은 [Runbook](RUNBOOK.md), 공개 서버 절차는
[배포 가이드](DEPLOYMENT.md)를 따릅니다.

## 현재 상태

| 영역 | 상태 | 근거 |
| --- | --- | --- |
| 고객 스토어 | 구현 완료 | 홈, 탐색, 상품 상세, 장바구니, 주문, 회원·비회원 주문조회 |
| 관리자 CMS | 구현 완료 | KPI, 상품, 주문, 재고, 배송, 반품, 발주, 회원, 리뷰, CMS, 쿠폰, 시스템 운영 |
| 백엔드 MSA | 구현 완료 | Gateway와 12개 도메인 서비스, 서비스별 DB 소유권 |
| 데이터·이벤트 | 구현 완료 | Drizzle migration, outbox/inbox, retry, DLQ, projection |
| 프론트 상태 관리 | 구현 완료 | TanStack Query 서버 상태, Zustand UI 상태 |
| 로컬 통합 환경 | 구현 완료 | Docker Compose, migration·seed, observability |
| CI와 배포 자동화 | 구현 완료 | 정적 검사, 계약·통합·보안·E2E·복구 검사, 불변 릴리스와 롤백 |
| 공개 데모 인프라 | 대기 | Naver Cloud Platform 크레딧 확보 후 프로비저닝 |
| Android 검증 | 후순위 | 수동 워크플로와 로컬 명령은 준비됐으며 실기기·APK 최종 검증은 보류 |

## 공개 배포 결정

- 중국 접근성은 배포 의사결정 범위에서 제외합니다.
- OCI는 배포 후보에서 제외합니다.
- 1차 배포 대상은 Naver Cloud Platform 한국 리전의 단일 Linux 서버입니다.
- 크레딧 확보 전에는 유료 리소스를 생성하지 않습니다.
- 비용을 줄이기 위해 PostgreSQL, Redis, RabbitMQ는 같은 서버의 Docker
  Compose에서 실행합니다.
- Storefront와 Admin을 외부 무료 호스팅으로 분리하는 안은 선택 사항입니다.
  첫 배포는 현재 검증된 same-origin 쿠키·CSRF 흐름을 보존하기 위해 두 Next.js
  앱과 Gateway를 같은 공개 도메인에서 제공하는 단일 서버 구성을 우선합니다.
- 상품 이미지는 초기에는 MinIO를 유지합니다. 실제 트래픽과 크레딧 조건을
  확인한 뒤 S3 호환 Object Storage로 옮길 수 있습니다.

## 배포 전 남은 작업

1. NCP 크레딧의 만료일, 적용 상품, VAT 포함 여부를 확인합니다.
2. 한국 리전에 VPC, subnet, ACG와 Linux 서버를 생성합니다.
3. 최소 2 vCPU·8GB로 시작하되 전체 스택 메모리 측정 결과가 기준을 넘으면
   4 vCPU 또는 12GB 이상으로 조정합니다.
4. Public IP와 도메인을 연결하고 TCP 80·443과 관리용 SSH만 허용합니다.
5. `.env.demo`를 서버에만 생성하고 저장소나 CI 로그에 secret을 남기지 않습니다.
6. `Deploy TECHZONE Demo` 워크플로의 GitHub Environment secret을 등록합니다.
7. 배포 후 고객 구매, 관리자 로그인, 주문 처리, 재고 예약, 반품·환불 smoke
   시나리오를 실행합니다.
8. 최소 24시간 동안 메모리, CPU, DB 용량, outbox 지연과 오류율을 관찰합니다.

## 완료 판정

공개 데모는 다음 조건을 모두 충족할 때 완료로 표시합니다.

- `main`의 CI가 통과합니다.
- 공개 HTTPS에서 Storefront, `/admin`, `/api`가 정상 응답합니다.
- 데이터 포트와 운영 콘솔이 인터넷에 직접 노출되지 않습니다.
- 배포 전 PostgreSQL 백업과 직전 릴리스 롤백을 실제로 한 번 검증합니다.
- 포트폴리오 문서와 공개 URL이 일치합니다.
- 크레딧 종료일과 이후 종료·이전 계획이 기록되어 있습니다.
