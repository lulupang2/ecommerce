# TECHZONE PRD

| 항목 | 내용 |
| --- | --- |
| 문서 상태 | 포트폴리오 데모 v1 기준 |
| 제품 | 테크·IT 기기 전문 커머스와 상용형 운영 CMS |
| 목표 | 고객 구매 전환, OMS/WMS 운영, MSA 신뢰성, 배포·관측 가능성을 한 저장소에서 증명 |
| 기준 통화/시간대 | KRW, 부가세 포함, Asia/Seoul |

## 1. 제품 목표

TECHZONE은 단순 쇼핑몰 화면이 아니라 “판매가 실제로 운영되는 시스템”을 보여주는 포트폴리오입니다. 고객 화면은 구매 전환을, 관리자 화면은 주문·상품·재고·배송 운영을, 백엔드는 MSA 경계와 이벤트 신뢰성을 설명할 수 있어야 합니다.

## 2. 사용자

- 고객: 상품 탐색, 상세 확인, 장바구니, 결제, 주문 조회, 취소·반품을 수행합니다.
- 비회원 고객: 주문번호와 휴대폰 번호로 주문을 조회하고 정책 조건 내 취소·반품을 요청합니다.
- CS 담당자: 주문, 회원, 리뷰, 반품 요청을 조회하고 처리합니다.
- 상품 MD: 상품, variant, SKU, 이미지, 스펙, 가격, 상태, 홈 진열을 관리합니다.
- 물류 담당자: 다중창고 재고, 출고, 송장, 배송 상태, 반품 입고를 관리합니다.
- 재무 담당자: 결제, 취소, 환불, 매출 KPI를 확인합니다.
- 슈퍼관리자: 역할, 권한, 감사 로그, 시스템 상태를 관리합니다.

## 3. 고객 스토어 요구사항

| ID | 요구사항 | 완료 기준 |
| --- | --- | --- |
| STR-01 | 홈 | CMS 섹션 기반 히어로, 카테고리, 특가, 인기, 신상품, 브랜드관, 기획전, 최근 본 상품을 노출합니다. |
| STR-02 | 상품 목록 | 카테고리, 브랜드, 가격, 재고, 할인 필터와 인기·신상품·가격·할인율 정렬을 지원합니다. |
| STR-03 | 상품 상세 | 이미지 갤러리, variant, SKU, 가격, 쿠폰, 배송 안내, 스펙, WYSIWYG 콘텐츠, 리뷰, Q&A, 찜, 관련 상품을 제공합니다. |
| STR-04 | 장바구니 | variant 단위 수량, 서버 가격 snapshot, 무료배송 진행률, 쿠폰 안내, 주문서 이동을 제공합니다. |
| STR-05 | 주문서 | 배송지, 쿠폰, 배송비, 결제수단, 약관, 최종 금액을 단계별로 표시합니다. |
| STR-06 | 결제 | 카드, 카카오페이, 네이버페이, 무통장 UI를 제공하고 provider adapter는 Mock으로 유지합니다. |
| STR-07 | 주문 완료 | 주문번호, 결제 금액, 주문 타임라인 이동 CTA를 제공합니다. |
| STR-08 | 마이페이지 | 최근 주문, 찜, 최근 본 상품, 주문·배송 바로가기, 취소·반품 정책 안내를 제공합니다. |
| STR-09 | 비회원 주문조회 | 주문번호와 휴대폰 검증으로 주문 전용 15분 JWT를 발급받아 조회합니다. |
| STR-10 | 리뷰/Q&A | 리뷰는 배송 완료된 로그인 구매자만, Q&A는 로그인 사용자만 작성할 수 있습니다. 조회는 공개입니다. |
| STR-11 | SEO/앱 | 웹은 SSR metadata, canonical, sitemap, JSON-LD를 제공하고 Capacitor는 동일 화면의 정적 앱 셸을 빌드합니다. |

## 4. 관리자 요구사항

| ID | 요구사항 | 완료 기준 |
| --- | --- | --- |
| ADM-01 | 공통 셸 | 그룹형 사이드바, 상단 검색, 창고 선택, 알림, 관리자 프로필, 모바일 드로어를 제공합니다. |
| ADM-02 | 대시보드 | 총매출, 순매출, 주문수, 객단가, 환불률, 결제 승인율, 출고 지연, 재고 위험 KPI를 표시합니다. |
| ADM-03 | 차트 | 주문/매출 추이, 주문 퍼널, 결제/배송 상태, 브랜드·카테고리 매출, 재고 위험 차트를 제공합니다. |
| ADM-04 | 목록 | 모든 운영 목록은 TanStack Table 기반 서버 페이지네이션, 정렬, 필터, 컬럼 표시, 행 선택을 사용합니다. |
| ADM-05 | 주문 | 상태 탭, 상세 타임라인, 상품·결제·배송·메모, 일괄 상태 변경을 지원합니다. |
| ADM-06 | 배송/반품 | 출고 대기, 송장 등록, 배송 추적, 반품 승인·검수·환불을 지원합니다. |
| ADM-07 | 상품 | 상품/variant/SKU 목록, 이미지, 스펙, 가격, ENUM 상태, 등록·수정을 지원합니다. |
| ADM-08 | 상품 콘텐츠 | 썸네일 drag-and-drop 미리보기와 Lexical WYSIWYG 편집기를 제공합니다. |
| ADM-09 | 재고 | 창고별 수량, 입출고 원장, 조정, 창고 이동, 안전재고를 관리합니다. |
| ADM-10 | 공급사/발주 | 공급사 품목, 발주서, 승인, 입고 처리, 미입고 수량을 관리합니다. |
| ADM-11 | 회원/리뷰 | 회원 상태와 누적 주문 정보, 리뷰 검수 상태를 관리합니다. |
| ADM-12 | CMS/쿠폰 | 홈 진열 섹션과 쿠폰을 검색, 필터, 등록, 상태 변경할 수 있습니다. |
| ADM-13 | RBAC/감사 | 6개 역할과 메뉴·작업 권한을 분리하고 모든 mutation 사유를 감사 로그에 기록합니다. |

## 5. 백엔드·아키텍처 요구사항

- Gateway, Auth, Catalog, Cart, Order, Payment, Inventory, Notification, Search, Media, Fulfillment, Procurement, Admin Query를 독립 NestJS 앱 구조로 유지합니다.
- 각 서비스는 Controller, DTO, Application Service, Domain Model, Drizzle Repository, Event Handler를 분리합니다.
- 서비스는 자기 PostgreSQL DB와 Drizzle schema/migration/seed를 소유하며 다른 서비스 DB를 직접 읽지 않습니다.
- Admin Query는 이벤트 기반 projection으로 대시보드, 운영 목록, KPI, 알림, 감사 로그를 제공합니다.
- 주문, 결제, 재고, 출고, 반품, 발주 이벤트는 `schemaVersion: 1` envelope를 사용합니다.
- transactional outbox/inbox, retry, DLQ, idempotency key를 통해 이벤트 중복과 장애 복구를 처리합니다.
- 모든 서비스는 `/health/live`, `/health/ready`, `/metrics`를 제공합니다.
- OpenTelemetry trace, Prometheus metric, Loki log, Grafana dashboard를 Docker Compose에 포함합니다.

## 6. 데이터 요구사항

- 상품은 brand, category, product, product_variant, product_image, product_spec으로 분리합니다.
- SKU, 모델번호, 바코드, 정가, 판매가, 원가, 옵션, 상품 상태는 variant 기준으로 관리합니다.
- 재고는 warehouse, bin, balance, movement, reservation, serial number, stock alert rule로 분리합니다.
- 가용, 예약, 불량, 입고예정 수량을 분리하고 모든 수량 변경은 movement 원장으로 추적합니다.
- 주문은 상품 가격, 할인, 세금, 배송비, 주소 snapshot을 저장합니다.
- 주문 상태, 결제 상태, 출고 상태는 별도 ENUM으로 관리합니다.
- 결제 승인, 취소, 환불은 transaction으로 누적 기록합니다.
- 쿠폰 사용은 중복 사용을 방지하고 주문서 quote 시점에 다시 검증합니다.

## 7. 정책

- 무료배송 기준은 80,000원, 기본 배송비는 3,000원입니다.
- 기본 쿠폰 `TECHZONE10`은 300,000원 이상 구매 시 10%, 최대 50,000원 할인입니다.
- 주문 quote token은 10분, 비회원 주문 JWT는 15분 유효합니다.
- 가격이 변경되면 `409 PRICE_CHANGED`, quote가 만료되면 `410 QUOTE_EXPIRED`를 반환합니다.
- 출고 준비 전까지만 주문 취소를 허용합니다.
- 배송 완료 후 7일 이내 반품 요청을 허용합니다.
- WYSIWYG HTML은 저장과 출력 양쪽에서 allowlist 기반으로 정화합니다.

## 8. 비기능 요구사항

- 모든 공개 mutation은 DTO validation, 표준 오류 응답, requestId를 제공합니다.
- 웹은 HttpOnly Secure SameSite=Lax 쿠키, Capacitor는 Bearer token 방식을 사용합니다.
- access token은 15분, refresh token은 14일 회전형으로 관리합니다.
- Redis 기반 rate limit, 로그인 지연·잠금, 보안 헤더, 요청 크기 제한, 파일 MIME 검증을 적용합니다.
- 관리자 모바일 화면에서는 드로어 메뉴와 가로 스크롤 테이블을 사용합니다.
- 모든 운영 action은 확인 다이얼로그, 사유 입력, 성공/실패 토스트를 제공합니다.

## 9. 완료 기준

- 현실적인 한국형 seed 데이터가 상품 variant, 다중창고, 회원, 주문, 배송, 반품, 공급사, 발주, 재고 이력을 생성합니다.
- 주문→결제→재고예약→출고→배송과 반품→환불 통합 테스트가 통과합니다.
- 역할별 허용·차단, guest order token 격리, CSRF, refresh token 재사용 방지 테스트가 통과합니다.
- 같은 `Idempotency-Key`와 같은 event ID가 반복되어도 상태 변경은 한 번만 반영됩니다.
- RabbitMQ, PostgreSQL, Order, Inventory 장애 테스트에서 retry, DLQ, readiness, 복구가 검증됩니다.
- Next.js storefront/admin production build, Docker healthcheck, Kubernetes manifest 검증, Capacitor sync, Android debug APK 빌드가 통과합니다.
