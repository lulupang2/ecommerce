# TECHZONE SSOT (Single Source of Truth)

이 문서는 구현 판단의 최종 기준이다. 제품 범위는 `PRD.md`, 실행 절차는 `RUNBOOK.md`, 구조 상세는 `ARCHITECTURE.md`와 `DATA_MODEL.md`를 따른다. 코드나 계약이 바뀌면 같은 변경에서 이 문서도 갱신한다.

## 1. 제품 정체성

- 제품명: **TECHZONE**
- 한 문장 설명: 새로운 IT 기기를 탐색하고 안전하게 주문하는 한국어 테크 커머스
- 채널: Next.js 웹, Capacitor Android 하이브리드 앱
- 디자인 방향: 넓은 여백, 강한 타이포그래피, 블루 포인트 컬러를 사용한 에디토리얼 커머스
- 참고 원칙: Behance 레퍼런스의 분위기와 정보 위계만 참고하며 화면·자산을 복제하지 않는다.

## 2. 기술 기준

| 영역 | 결정 |
| --- | --- |
| 저장소 | 단일 모노레포, 서비스별 독립 실행·배포 경계 유지 |
| 프론트엔드 | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui 패턴 |
| 모바일 | Capacitor 8 Android. 네이티브 중심 요구가 생기기 전까지 React Native를 도입하지 않는다. |
| 백엔드 | Node.js 22, Express 5 |
| 데이터 | 서비스별 PostgreSQL 16 데이터베이스, Drizzle ORM |
| 메시징 | RabbitMQ topic exchange |
| 진입점 | API Gateway `/api/*` |
| 로컬 운영 | Docker Compose |

## 3. 서비스와 데이터 소유권

| 서비스 | 포트 | 소유 데이터 | 주요 책임 |
| --- | ---: | --- | --- |
| Auth | 3001 | users | 회원가입, 로그인, JWT 검증 |
| Catalog | 3002 | products | 상품 조회·등록 |
| Cart | 3003 | cart_items | 사용자 장바구니 |
| Order | 3004 | orders, order_items | 주문 생성·조회·상태 전이 |
| Payment | 3005 | payments | Mock 결제 승인 |
| Inventory | 3006 | stock | 재고 예약 |
| Notification | 3007 | notifications | 주문 알림 저장 |
| Search | 3008 | search_events | 상품 이벤트 수신, 검색 요청 중계 |
| Media | 3009 | media_assets | 업로드 URL 메타데이터 |
| Gateway | 8080 | 없음 | 외부 API 라우팅과 서비스 health 프록시 |

## 4. API 계약

- 외부 기본 경로: `http://localhost:18080/api`
- JSON 요청은 `Content-Type: application/json`을 사용한다.
- 인증 토큰은 `Authorization: Bearer <JWT>`로 전달한다.
- 현재 API는 포트폴리오 MVP 계약이며 `/v1` 버저닝은 공개 배포 전 도입한다.
- 오류는 최소 `{ "code": "ERROR_CODE" }` 형식을 유지한다.

주요 경로:

- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- `GET /products`, `GET /products/:id`, `POST /products`
- `GET /search?q=`, `GET /carts/:userId`
- `POST /carts/:userId/items`, `PATCH /carts/:userId/items/:productId`, `DELETE /carts/:userId`
- `POST /orders`, `GET /orders/:id`
- `GET /payments/:orderId`, `GET /inventory/:productId`
- `GET /notifications/:userId`, `POST /media/upload-url` (관리자 인증 필요)

## 5. 이벤트 계약

이벤트 봉투는 `{ id, type, occurredAt, payload }`를 사용한다.

```text
order.created
  -> payment.approved
  -> inventory.reserve
  -> inventory.reserved | inventory.failed
  -> order.confirmed | order.cancelled
  -> notification 저장
```

- Order는 `payment.approved`를 받으면 재고 예약을 요청한다.
- Order는 `inventory.reserved`를 받으면 `confirmed`, 실패하면 `cancelled`로 전이한다.
- 소비자는 이벤트 ID를 기준으로 멱등성을 확보하는 방향으로 확장한다.

## 6. 공통 데이터 규칙

- ID는 Node.js `crypto.randomUUID()`가 생성하는 UUID를 사용한다.
- 시간은 PostgreSQL `TIMESTAMPTZ`와 UTC를 사용한다.
- 금액은 원 단위 정수로 저장한다.
- 상품 공개 상태의 기본값은 `published`이다.
- 서비스는 다른 서비스의 DB를 직접 조회하지 않는다.
- 애플리케이션 CRUD는 `backend/shared/schema.js`의 Drizzle 테이블 정의와 `db.orm`을 사용한다. 초기 MVP의 테이블 생성은 서비스 시작 시 호환용 SQL bootstrap을 사용하며, 운영 전 Drizzle migration으로 대체한다.
- 현재 게스트 사용자는 브라우저 로컬 UUID를 사용하며 로그인 사용자는 Auth 사용자 ID를 사용한다.

## 7. 디자인 토큰

| 토큰 | 값 |
| --- | --- |
| Primary | Blue `#2563EB` 계열 |
| Ink | Slate `#020617` 계열 |
| Surface | `#F6F8FC`, white |
| 본문 | 시스템 sans-serif |
| 강조 | serif italic 보조 사용 |
| 반응형 | mobile `< 768px`, desktop `>= 768px` 중심 |

## 8. 의사결정 기록

| 날짜 | 결정 | 이유 |
| --- | --- | --- |
| 2026-07-23 | 제품 콘셉트를 TECHZONE으로 확정 | 다양한 커머스·검색·결제·재고 기술을 설명하기 적합함 |
| 2026-07-23 | Next.js 정적 산출물 + Capacitor 채택 | 웹과 Android UI 코드를 공유하며 포트폴리오 범위를 통제함 |
| 2026-07-23 | 모노레포 안에서 MSA 경계 유지 | 작은 팀/개인 프로젝트의 변경 추적과 로컬 실행을 단순화함 |
| 2026-07-23 | RabbitMQ 기반 주문 Saga 채택 | 비동기 상태 전이와 장애 시나리오를 시연하기 적합함 |
| 2026-07-23 | 개발 결제는 Mock 승인 | 실제 결제 계약 없이 주문 흐름을 재현 가능하게 함 |
