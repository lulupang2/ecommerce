# TECHZONE 기술 의사결정

이 문서는 구현 결과뿐 아니라 선택한 이유와 감수한 비용을 기록합니다.

## ADR-001: 모노레포 안에서 MSA 경계를 유지한다

**결정:** npm workspaces와 Turborepo를 사용하되 앱 간 source import와 다른
서비스의 persistence schema import를 금지합니다.

**이유:** 한 명이 API 계약, 프론트, 모바일, 인프라를 함께 변경하는 포트폴리오
환경에서는 atomic commit과 공통 CI가 생산적입니다. polyrepo의 독립 release
장점보다 계약 drift와 반복 설정 비용이 더 컸습니다.

**비용:** 저장소 전체가 커지고 잘못된 import가 쉬워집니다. package exports,
TypeScript project reference와 `tools/validation/boundaries.mjs`로 방향을
검사합니다. 독립 Docker image와 Kubernetes Deployment로 런타임 결합을
방지합니다.

## ADR-002: 관리자 조회는 CQRS projection을 사용한다

**결정:** Admin Query가 주문·상품·재고·배송·반품·발주 이벤트를 소비해 별도
읽기 모델과 KPI를 만듭니다.

**이유:** 대시보드 한 화면이 여러 서비스 DB를 직접 조인하거나 동기 fan-out하면
응답 시간과 가용성이 가장 느린 서비스에 종속됩니다. projection은 TanStack
Table의 서버 검색·정렬·페이지네이션에도 더 적합합니다.

**비용:** 원본과 화면 사이에 짧은 지연이 생기고 rebuild가 필요합니다.
`processed_events`, 운영 알림, 원본 합계 검증과 관리자 rebuild 명령으로
운영합니다.

## ADR-003: 이벤트 전달은 at-least-once와 멱등 처리를 전제로 한다

**결정:** exactly-once를 가정하지 않고 transactional outbox, publisher confirm,
inbox event ID와 command `Idempotency-Key`를 사용합니다.

**이유:** DB commit과 RabbitMQ publish를 원자적으로 묶을 수 없고 네트워크
재시도는 중복 전달을 만듭니다. 도메인 변경과 outbox를 한 transaction에 쓰면
메시지 유실을 막고, consumer 멱등 처리로 중복 효과를 제거할 수 있습니다.

**비용:** 테이블 정리, publisher 지연, DLQ 운영이 추가됩니다. outbox 5분 적체와
DLQ 1건 이상을 경보로 두고 장애 복구 테스트를 CI에서 실행합니다.

## ADR-004: 상품과 재고의 판매 단위는 variant다

**결정:** Product는 노출·콘텐츠 단위, Product Variant는 SKU·모델번호·바코드·
옵션·가격·원가 단위로 사용합니다. 재고 balance·movement·reservation·serial은
variant와 창고를 기준으로 기록합니다.

**이유:** 같은 상품의 용량·색상 옵션이 서로 다른 가격과 재고를 가지며, 주문
snapshot과 실제 출고 SKU가 일치해야 합니다.

**비용:** 장바구니·쿠폰·주문·재고 API가 모두 variant ID를 전달해야 합니다.
서버 quote가 최신 가격과 가용 재고를 다시 계산해 클라이언트 snapshot 오염을
막습니다.

## ADR-005: 웹 SSR과 Capacitor가 화면 컴포넌트를 공유한다

**결정:** 웹은 Next.js standalone SSR, 앱은 `CAPACITOR_BUILD=1` 정적 export를
사용합니다. 도메인 화면은 공유하고 라우팅·인증 저장 adapter만 분리합니다.

**이유:** SEO와 동적 상품 URL이 필요한 웹의 장점을 유지하면서, 별도 React
Native 코드베이스 없이 Android 포트폴리오 산출물을 만들 수 있습니다.

**비용:** native 중심 UX와 복잡한 background 기능에는 한계가 있습니다. 현재
범위는 커머스 조회·구매 흐름이므로 Capacitor가 적합하며, 고성능 native 화면이
핵심이 되면 React Native 전환을 재검토합니다.

## ADR-006: 외부 결제·택배는 adapter와 Mock 구현으로 제한한다

**결정:** Payment와 Fulfillment domain은 provider port를 정의하고 로컬·CI에서는
Mock adapter를 사용합니다.

**이유:** 실제 PG·택배 계약과 secret 없이도 승인·취소·환불, 송장·배송 상태의
도메인 흐름과 장애 처리를 재현할 수 있습니다.

**비용:** provider webhook 서명, 실제 정산과 부분 실패의 모든 edge case를
검증하지는 못합니다. 운영 연동 시 adapter contract test, sandbox E2E,
webhook inbox와 provider reconciliation job이 추가로 필요합니다.

## ADR-007: 개발과 운영의 배포 기준을 분리한다

**결정:** 로컬 통합 환경은 Docker Compose, 운영 예시는 Kubernetes renderer로
관리합니다.

**이유:** Compose는 전체 스택 재현이 빠르고, Kubernetes는 replica·probe·HPA·
PDB·rolling update·migration Job 같은 운영 계약을 표현할 수 있습니다.

**비용:** 두 배포 표현을 함께 유지해야 합니다. CI가 Compose 통합 테스트와
Kubernetes 46개 리소스 검증을 별도 gate로 실행해 drift를 줄입니다.

## ADR-008: 최초 공개 데모는 NCP 단일 서버로 시작한다

**결정:** Naver Cloud Platform 크레딧 확보 후 한국 리전의 단일 Linux 서버에
공개 데모를 배포합니다. OCI와 중국 접근성은 후보와 평가 기준에서 제외합니다.

**이유:** 현재 목표는 대규모 운영이 아니라 국내 포트폴리오 시연입니다. 한
서버에서 검증된 Docker Compose 구성을 사용하면 MSA의 코드·데이터 소유권은
유지하면서도 관리형 DB, Kubernetes, Load Balancer의 고정비와 운영 복잡도를
피할 수 있습니다. same-origin 웹 쿠키와 CSRF 계약도 변경하지 않아도 됩니다.

**비용:** 단일 장애 지점이고 서비스별 독립 확장과 무중단 인프라 교체를 실제로
증명하지는 못합니다. Kubernetes manifest와 장애 복구 테스트는 운영 설계
산출물로 유지하고, 공개 데모에서는 백업·불변 릴리스·자동 롤백과 리소스
모니터링으로 위험을 제한합니다.
