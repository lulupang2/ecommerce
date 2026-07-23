# TECHZONE SSOT

이 문서는 구현 판단의 최종 기준이다. 제품 요구는 `PRD.md`, 시스템 경계는 `ARCHITECTURE.md`, 데이터 규칙은 `DATA_MODEL.md`, 실행 절차는 `RUNBOOK.md`를 따른다. 코드나 계약을 바꾸는 커밋은 관련 문서도 함께 갱신한다.

## 제품과 채널

- 제품: 한국어 테크·IT 기기 전문 커머스와 상용형 운영 CMS
- 고객 채널: Next.js 웹, Capacitor Android 하이브리드 앱
- 운영 채널: 주문·결제·배송·반품·상품·재고·발주·회원·리뷰·권한·감사로그 관리자
- 디자인: 넓은 여백과 명확한 정보 위계, 네이비·시안 계열의 실무형 CMS. Behance 레퍼런스는 분위기만 참고하고 자산과 화면은 복제하지 않는다.
- 기본값: KRW, 부가세 포함, `Asia/Seoul`

## 기술 결정

| 영역 | 결정 |
| --- | --- |
| 저장소 | 단일 모노레포, 서비스별 독립 실행·DB·배포 경계 |
| 프론트엔드 | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui 패턴 |
| 관리자 목록 | TanStack Table 서버 페이지네이션·정렬·검색·필터·선택·CSV |
| 차트 | Recharts |
| 상품 편집 | Lexical WYSIWYG, MinIO presigned 업로드 |
| 모바일 | Capacitor 8 Android |
| 백엔드 | NestJS 11 런타임 패턴, Node.js 22 |
| 데이터 | 서비스별 PostgreSQL 16, Drizzle ORM |
| 이벤트 | RabbitMQ topic exchange, 이벤트 ID 멱등 처리 |
| 로컬 운영 | Docker Compose |

## 서비스와 데이터 소유권

| 서비스 | 포트 | 책임 |
| --- | ---: | --- |
| Auth | 3001 | 회원, 역할, 권한, JWT |
| Catalog | 3002 | 브랜드, 카테고리, 상품, variant, 이미지, 스펙, 리뷰 |
| Cart | 3003 | 장바구니 |
| Order | 3004 | 주문, 가격·주소 snapshot, 상태 전이 |
| Payment | 3005 | 결제와 승인·취소·환불 transaction |
| Inventory | 3006 | 다중창고, bin, 재고 원장·예약·시리얼·알림 |
| Notification | 3007 | 사용자 알림 |
| Search | 3008 | 고객 검색 |
| Media | 3009 | MinIO 업로드 메타데이터 |
| Fulfillment | 3010 | 출고, 송장, 배송 추적, 반품 |
| Procurement | 3011 | 공급사, 공급 품목, 발주, 입고 |
| Admin Query | 3012 | 통합 projection, KPI, 운영 알림, 감사로그 |
| Gateway | 8080 | `/api/*` 외부 진입점 |

다른 서비스의 DB를 직접 읽지 않는다. 운영 조회는 이벤트 projection을 사용하고 rebuild에서만 내부 API 계약으로 원본을 다시 읽는다.

## 상태와 권한

- 상품: `draft | active | sold_out | hidden | discontinued`
- 주문: `pending | confirmed | preparing | shipped | delivered | cancelled`
- 결제: `pending | approved | partially_refunded | refunded | cancelled | failed`
- 출고: `unfulfilled | ready | shipped | delivered | returned`
- 배송: `ready | packed | shipped | delivered | cancelled`
- 반품: `requested | approved | received | refunded | rejected`
- 발주: `draft | approved | partially_received | received | cancelled`
- 역할: `super_admin | cs | product_md | logistics | finance | viewer`

메뉴 접근과 `read/update/export/refund/admin.manage` 권한을 분리한다. 모든 관리자 상태 변경은 행위자와 사유를 감사로그에 남긴다.

## 데이터 불변식

- 금액은 원 단위 정수, 시간은 `TIMESTAMPTZ`, ID는 UUID를 사용한다.
- SKU·모델번호·바코드는 variant 기준이다. SKU·주문번호·송장번호는 unique다.
- `available`, `reserved`, `damaged`, `incoming`을 분리하고 음수 재고를 허용하지 않는다.
- 모든 재고 수량 변경은 `inventory_movements` 원장으로 추적한다.
- 주문 품목 가격·할인·세금과 배송 주소는 주문 시점 snapshot이다.
- 결제 승인·취소·환불은 누적 transaction이며 환불 합계는 승인 금액을 넘지 않는다.
- 고객용 기존 API DTO를 유지한다.

## 관리자 API

- 조회: `/admin/dashboard`, `/admin/orders`, `/admin/products`, `/admin/inventory`, `/admin/shipments`, `/admin/returns`, `/admin/purchase-orders`, `/admin/members`, `/admin/reviews`, `/admin/alerts`, `/admin/audit-logs`
- projection: `POST /admin/rebuild`
- 공통 목록 파라미터: `page`, `pageSize`, `search`, `sort`, `direction`, `status`, `warehouseId`, `from`, `to`
- 인증: `Authorization: Bearer <JWT>`

## 의사결정 기록

| 날짜 | 결정 | 이유 |
| --- | --- | --- |
| 2026-07-23 | TECHZONE, Next.js, Capacitor, 모노레포 MSA 채택 | 웹·앱 코드 공유와 서비스 경계 시연 |
| 2026-07-23 | RabbitMQ 주문 Saga와 Mock provider 채택 | 외부 계약 없이 장애·상태 흐름 재현 |
| 2026-07-24 | Admin Query, Fulfillment, Procurement 경계 추가 | 운영 조회와 OMS/WMS 쓰기 모델 분리 |
| 2026-07-24 | variant·다중창고·원장 중심 DB로 초기화 | 테크 유통의 SKU·시리얼·입출고 요구 수용 |
| 2026-07-24 | 6개 관리자 역할과 감사로그 도입 | 최소 권한과 운영 추적성 확보 |
