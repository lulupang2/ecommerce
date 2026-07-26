# TECHZONE SSOT

이 문서는 TECHZONE의 구현 판단 기준입니다. 제품 요구사항은 [PRD](PRD.md)를 따르고, 코드·테스트·문서가 충돌하면 이 문서를 기준으로 정책과 용어를 맞춥니다.

## 1. 제품 기준

- 제품명: TECHZONE
- 도메인: 테크·IT 기기 전문 커머스
- 고객 채널: Next.js SSR 웹, Capacitor Android
- 운영 채널: Next.js 관리자 CMS, 공개 경로 `/admin`
- 언어: 한국어
- 통화: KRW, 원 단위 정수
- 세금: 부가세 포함
- 시간대: Asia/Seoul
- 디자인 방향: tech/IT 기기 쇼핑몰, 고대비 카드형 UI, cyan accent, 실무형 CMS

## 2. 기술 결정

| 영역 | 기준 |
| --- | --- |
| 저장소 | npm workspaces + Turborepo 모노레포 |
| 프론트엔드 | Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui 계열 primitive |
| 고객 서버 상태 | TanStack Query: 장바구니·찜·상품·주문·체크아웃 견적 캐시와 mutation 정합성 |
| 고객 UI 상태 | Zustand: 장바구니 패널·모바일 메뉴·검색 입력·비회원 로컬 찜 |
| 관리자 목록 | TanStack Table 서버 페이지네이션·정렬·필터 |
| 차트 | Recharts |
| 모바일 | Capacitor 8 Android |
| 백엔드 | NestJS 11, Node.js 22 |
| ORM | Drizzle ORM |
| DB | 서비스별 PostgreSQL 16 |
| 메시징 | RabbitMQ topic exchange |
| 신뢰성 | transactional outbox/inbox, retry, DLQ, idempotency |
| 관측성 | OpenTelemetry, Prometheus, Tempo, Loki, Grafana |
| 로컬 운영 | Docker Compose |
| 배포 예시 | Kubernetes manifest |
| 공개 데모 목표 | Naver Cloud Platform 한국 리전 단일 Linux 서버 |

## 3. 서비스와 데이터 소유권

| 서비스 | 포트 | 책임 |
| --- | ---: | --- |
| Gateway | 8080 | `/api/*` 단일 진입점, 인증 검증, 라우팅 |
| Auth | 3001 | 회원, 역할, 권한, JWT, JWKS |
| Catalog | 3002 | 브랜드, 카테고리, 상품, variant, 이미지, 스펙, 리뷰, Q&A, 찜, 홈 진열 |
| Cart | 3003 | 장바구니, variant 단위 가격 snapshot |
| Order | 3004 | 주문, quote, 가격 snapshot, 상태 전이 |
| Payment | 3005 | 결제 승인, 취소, 환불 transaction, Mock provider |
| Inventory | 3006 | 다중창고, bin, 재고 balance, movement, reservation, serial number |
| Notification | 3007 | 운영·고객 알림 |
| Search | 3008 | 검색 인덱스와 검색 이벤트 |
| Media | 3009 | MinIO 업로드, 미디어 메타데이터 |
| Fulfillment | 3010 | 출고, 송장, 배송 추적, 반품 |
| Procurement | 3011 | 공급사, 공급 품목, 발주, 입고 |
| Admin Query | 3012 | projection, KPI, 운영 알림, 감사 로그, DLQ 조회 |

원칙:

- 다른 서비스의 DB를 직접 조회하지 않습니다.
- 통합 조회는 Admin Query projection 또는 공개 API 계약을 사용합니다.
- 각 서비스는 자기 Drizzle schema, migration, seed를 소유합니다.
- 공통 패키지는 비즈니스 테이블이나 도메인 모델을 소유하지 않습니다.

### 공개 배포 원칙

- 공개 인프라는 크레딧 확보 후에만 생성합니다.
- OCI와 중국 접근성은 현재 배포 범위에서 제외합니다.
- 초기 NCP 배포는 비용과 현재 same-origin 인증 계약을 고려해 Storefront,
  Admin, Gateway, 도메인 서비스, PostgreSQL, Redis, RabbitMQ를 단일 Linux
  서버의 Docker Compose로 실행합니다.
- 관리형 DB, Kubernetes, Load Balancer, NAT Gateway는 포트폴리오 데모의
  초기 필수 구성에 포함하지 않습니다.
- Kubernetes manifest는 운영 계약을 설명하고 검증하는 산출물이며 초기 공개
  데모의 런타임 선택과 동일할 필요는 없습니다.
- 상세 진행 상태와 완료 조건은 [전달 상태](STATUS.md)를 따릅니다.

## 4. 상태 ENUM

| 도메인 | 값 | 한글 라벨 |
| --- | --- | --- |
| 상품 | `draft` | 작성 중 |
| 상품 | `published` | 판매 중 |
| 상품 | `hidden` | 숨김 |
| 상품 | `archived` | 보관 |
| 주문 | `pending` | 결제 대기 |
| 주문 | `confirmed` | 주문 확정 |
| 주문 | `preparing` | 상품 준비 |
| 주문 | `shipped` | 배송 중 |
| 주문 | `delivered` | 배송 완료 |
| 주문 | `cancelled` | 주문 취소 |
| 결제 | `pending` | 결제 대기 |
| 결제 | `approved` | 승인 완료 |
| 결제 | `partially_refunded` | 부분 환불 |
| 결제 | `refunded` | 환불 완료 |
| 결제 | `cancelled` | 결제 취소 |
| 결제 | `failed` | 결제 실패 |
| 출고 | `unfulfilled` | 미출고 |
| 출고 | `ready` | 출고 대기 |
| 출고 | `shipped` | 출고 완료 |
| 출고 | `delivered` | 배송 완료 |
| 출고 | `returned` | 반품 |
| 배송 | `ready` | 출고 대기 |
| 배송 | `packed` | 포장 완료 |
| 배송 | `shipped` | 배송 중 |
| 배송 | `delivered` | 배송 완료 |
| 배송 | `cancelled` | 취소 |
| 반품 | `requested` | 접수 |
| 반품 | `approved` | 승인 |
| 반품 | `received` | 검수 완료 |
| 반품 | `refunded` | 환불 완료 |
| 반품 | `rejected` | 반려 |
| 발주 | `draft` | 작성 중 |
| 발주 | `approved` | 승인 |
| 발주 | `partially_received` | 부분 입고 |
| 발주 | `received` | 입고 완료 |
| 발주 | `cancelled` | 취소 |
| 리뷰 | `pending` | 검수 대기 |
| 리뷰 | `published` | 공개 |
| 리뷰 | `hidden` | 숨김 |
| 리뷰 | `rejected` | 반려 |

## 5. 역할과 권한

| 역할 | 설명 |
| --- | --- |
| `super_admin` | 전체 메뉴와 권한 관리 |
| `cs` | 주문, 회원, 리뷰, 반품 처리 |
| `product_md` | 상품, CMS 진열, 쿠폰, 리뷰 확인 |
| `logistics` | 재고, 출고, 배송, 반품 입고 |
| `finance` | 결제, 환불, 매출 KPI |
| `viewer` | 조회 전용 |

권한은 메뉴 접근과 `read`, `update`, `export`, `refund`, `admin.manage` 같은 작업 권한으로 분리합니다. 관리자 mutation은 actor, action, entity, reason, requestId를 감사 로그에 남깁니다.

## 6. 고객 정책

- 무료배송 기준: 80,000원
- 기본 배송비: 3,000원
- 기본 쿠폰: `TECHZONE10`
- `TECHZONE10`: 300,000원 이상 구매 시 10%, 최대 50,000원 할인
- quote token 유효시간: 10분
- 비회원 주문 JWT 유효시간: 15분
- 주문 취소: 출고 준비 전까지 허용
- 반품 요청: 배송 완료 후 7일 이내 허용
- 리뷰 작성: 배송 완료된 로그인 구매자만 허용
- Q&A 작성: 로그인 사용자만 허용
- 찜: 로그인 사용자는 서버 저장, 비회원은 localStorage 저장 후 로그인 시 병합 대상

## 7. 가격·주문 불변식

- 금액은 원 단위 정수로 저장합니다.
- 주문 생성 시 상품 가격, 할인, 세금, 배송비, 주소를 snapshot으로 저장합니다.
- 주문 생성은 quote를 다시 검증합니다.
- 가격이 변경되면 `409 PRICE_CHANGED`를 반환합니다.
- quote가 만료되면 `410 QUOTE_EXPIRED`를 반환합니다.
- 쿠폰은 서버에서 최소 주문금액, 최대 할인액, 중복 사용 여부를 검증합니다.
- 결제 확인은 클라이언트의 주문 상품·금액 snapshot을 신뢰하지 않고 Order 원본을 다시 조회합니다. 승인 요청 금액이 주문 합계와 다르면 `409 PAYMENT_AMOUNT_MISMATCH`, 취소·환불된 주문이면 `409 ORDER_NOT_PAYABLE`을 반환합니다.
- 자동 승인과 수동 확인이 동시에 도착해도 주문별 DB lock으로 승인 transaction과 `payment.approved` 이벤트를 한 번만 생성합니다.
- 결제 승인 금액보다 환불 누적 금액이 클 수 없습니다.
- 같은 `Idempotency-Key` 요청은 상태를 한 번만 변경합니다.

## 8. 재고 불변식

- 재고 수량은 `available`, `reserved`, `damaged`, `incoming`으로 분리합니다.
- 가용 재고는 음수가 될 수 없습니다.
- 결제 승인 후 variant 단위로 재고를 예약하며, 한 주문의 모든 항목은 단일 DB transaction에서 성공하거나 모두 롤백됩니다.
- 가용 재고 조회와 예약은 모두 활성 출고 창고(`central`, `fulfillment`) 범위를 사용하며 여러 창고에 걸쳐 할당할 수 있습니다.
- 예약은 `reserved → confirmed → committed` 상태로 전이합니다. 주문 확정 전 30분이 지나면 만료되고, 주문 취소 시에는 `released`로 전환하면서 가용 수량을 복원합니다.
- 출고 시 `reserved_qty`를 차감하고 이미 예약 때 차감한 `available_qty`는 다시 차감하지 않습니다.
- 입고, 예약, 해제, 조정, 이동은 모두 `inventory_movements` 원장으로 기록합니다.
- 예약 원장은 Inventory가 소유하며 관리자는 `GET /admin/reservations`를 통해 주문, variant, 창고, 상태, 만료·해제 사유를 서버 페이지네이션으로 조회합니다.
- 관리자 재고 조정은 `variantId + warehouseId`를 명시하며 상품 단위 호환 API도 실제 balance의 variant를 먼저 결정합니다.
- SKU, 주문번호, 송장번호는 unique입니다.

## 9. 공개 API 기준

### 고객

- `GET /storefront/home`
- `GET /products`
- `GET /products/by-slug/:slug`
- `POST /checkout/quote`
- `POST /orders`
- `GET /orders/:id`
- `POST /orders/guest/access`
- `GET /orders/guest/:id`
- `POST /orders/guest/:id/cancel`
- `POST /fulfillment/returns/guest`
- `POST /products/:id/reviews`
- `POST /products/:id/questions`
- `GET /wishlists/:userId`
- `POST|DELETE /wishlists/:userId/:productId`
- 찜 목록 조회·변경은 로그인한 JWT subject와 `:userId`가 일치할 때만 허용합니다.
- 회원별 찜 목록 응답은 `Cache-Control: private, no-store`로 제공하며 로그인 시 로컬 찜과 서버 찜을 합집합으로 병합합니다. 병합 성공 후 게스트용 로컬 목록을 비워 로그아웃 뒤 회원 데이터가 노출되지 않게 합니다.
- 상품 상세의 각 variant는 중앙 출고 창고 기준 `availableQty`, `inStock`을 제공합니다. Inventory 조회 장애 시 두 값은 `null`이며, 고객 UI는 재고 확인 중 상태로 표시합니다.
- 장바구니는 클라이언트가 보낸 상품명·가격을 신뢰하지 않고 Catalog의 variant 정보로 정규화합니다. 옵션별 가용 수량을 초과하면 `409 INSUFFICIENT_STOCK`을 반환합니다.
- 결제 견적과 주문 생성은 Inventory의 같은 variant 가용 수량을 다시 검증합니다. 재고 서비스 장애 시 `503 INVENTORY_UNAVAILABLE`, 품절·수량 부족 시 `409 INSUFFICIENT_STOCK`을 반환합니다.

### 관리자

- `GET /admin/dashboard`
- `GET /admin/orders`
- `GET /admin/products`
- `GET /admin/inventory`
- `GET /admin/shipments`
- `GET /admin/returns`
- `GET /admin/purchase-orders`
- `GET /admin/members`
- `GET /admin/reviews`
- `GET /admin/alerts`
- `GET /admin/audit-logs`
- `GET /admin/system-status`
- `GET /admin/outbox`
- `GET /admin/reservations`
- `POST /admin/rebuild`
- `GET /storefront/admin/sections`
- `PATCH /storefront/admin/sections/:id`
- `GET /coupons/admin`
- `POST /coupons/admin`

목록 공통 파라미터:

- `page`
- `pageSize`
- `search` 또는 `q`
- `sort`
- `direction`
- `status`
- `warehouseId`
- `from`
- `to`

고객 상품 목록은 `category`, `brand`, `minPrice`, `maxPrice`, `inStock`,
`discounted`, `sort`를 추가로 지원합니다. `discounted=true`는 대표 활성
variant의 정가가 판매가보다 큰 상품만 반환합니다.

## 10. 이벤트 기준

모든 이벤트 envelope는 아래 필드를 포함합니다.

- `eventId`
- `eventType`
- `schemaVersion: 1`
- `requestId`
- `correlationId`
- `causationId`
- `actorId`
- `occurredAt`
- `payload`

주요 이벤트:

- `product.created`
- `product.updated`
- `order.created`
- `order.status_changed`
- `payment.approved`
- `payment.cancelled`
- `payment.refunded`
- `inventory.received`
- `inventory.reserved`
- `inventory.released`
- `inventory.reservation_expired`
- `inventory.failed`
- `inventory.adjusted`
- `inventory.transferred`
- `shipment.created`
- `shipment.shipped`
- `shipment.delivered`
- `return.requested`
- `return.approved`
- `return.received`
- `return.refunded`
- `purchase_order.created`
- `purchase_order.approved`
- `purchase_order.received`

## 11. 운영·관측 기준

- 모든 서비스는 `/health/live`, `/health/ready`, `/metrics`를 제공합니다.
- HTTP, RabbitMQ, PostgreSQL 호출은 trace context를 전파합니다.
- 로그는 `service`, `environment`, `requestId`, `traceId`, `userId`, `eventId`, `duration`, `status`를 포함합니다.
- 개인정보는 로그에 원문으로 남기지 않습니다.
- DLQ가 1건 이상이면 운영 알림 대상입니다.
- outbox 지연이 5분 이상이면 운영 알림 대상입니다.
- p95 응답시간 1초 초과 또는 오류율 5% 초과는 알림 대상입니다.

## 12. 데모 계정과 로컬 값

- 관리자: `admin@techzone.local` / `TechzoneAdmin123!`
- Grafana: `admin` / `techzone`
- 로컬 공개 포트:
  - Storefront/Admin: `15173`
  - API Gateway: `18080`
  - Grafana: `13000`
  - RabbitMQ Management: `15672`
  - MinIO Console: `19001`

저장소에 포함된 계정, secret, provider 설정은 로컬 데모 전용입니다. 운영 배포에서는 Secret Manager나 Kubernetes Secret으로 교체해야 합니다.

## 13. 스토어 품질 게이트

- Lighthouse 예산의 SSOT는 `tools/quality/lighthouse.config.mjs`입니다.
- 고객 홈, 상품 목록, 대표 상품 상세를 모바일 환경에서 각각 3회 측정하고 중앙값을 사용합니다.
- Performance 0.80, Accessibility 0.98, Best Practices 0.95, SEO 0.98 이상이어야 합니다.
- FCP 1.8초, LCP 3초, CLS 0.1, TBT 600ms, 총 전송량 1MB를 초과하면 CI를 실패 처리합니다.
- Performance와 TBT는 모바일 에뮬레이션을 사용하는 공유 CI 러너의 변동성을 고려한 회귀 차단선이며, 실제 측정값은 Lighthouse 아티팩트에서 계속 추적합니다.
- HTML 리포트와 원본 JSON은 CI의 `lighthouse-reports` artifact로 보존합니다.
- Capacitor 정적 빌드는 동일 화면 컴포넌트를 사용하되 서버 선로딩 없이 앱 런타임 API로 데이터를 가져옵니다.
- Android 정적 빌드·Capacitor sync·debug APK는 기본 PR CI와 분리한 수동
  `TECHZONE Android Verification` 워크플로우에서 후순위로 검증합니다.
