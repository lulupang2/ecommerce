# TECHZONE 아키텍처

## 구성

```mermaid
flowchart LR
  Client["Next.js 웹 / Capacitor 앱"] --> Gateway["API Gateway :8080"]
  AdminUI["한국어 관리자 CMS"] --> Gateway
  Gateway --> Auth
  Gateway --> Catalog
  Gateway --> Cart
  Gateway --> Order
  Gateway --> Payment
  Gateway --> Inventory
  Gateway --> Fulfillment
  Gateway --> Procurement
  Gateway --> Admin["Admin Query"]
  Gateway --> Support["Search / Media / Notification"]
  Bus{{RabbitMQ}} <--> Catalog
  Bus <--> Order
  Bus <--> Payment
  Bus <--> Inventory
  Bus <--> Fulfillment
  Bus <--> Procurement
  Bus <--> Admin
  Auth --> AuthDB[(Auth DB)]
  Catalog --> CatalogDB[(Catalog DB)]
  Order --> OrderDB[(Order DB)]
  Payment --> PaymentDB[(Payment DB)]
  Inventory --> InventoryDB[(Inventory DB)]
  Fulfillment --> FulfillmentDB[(Fulfillment DB)]
  Procurement --> ProcurementDB[(Procurement DB)]
  Admin --> AdminDB[(Projection DB)]
```

모노레포는 계약·UI·인프라 변경을 한 커밋으로 추적하기 위한 저장소 전략이다. 런타임과 DB 소유권은 서비스별로 분리되어 MSA 경계를 유지한다.

## 주문·출고·반품 흐름

```mermaid
sequenceDiagram
  participant C as Client
  participant O as Order
  participant P as Payment
  participant I as Inventory
  participant F as Fulfillment
  participant A as Admin Query
  C->>O: 주문 생성
  O-->>P: order.created
  P-->>O: payment.approved
  O-->>I: inventory.reserve
  I-->>O: inventory.reserved
  O-->>F: order.confirmed
  F-->>O: shipment.created
  F-->>O: shipment.shipped / delivered
  F-->>P: 반품 검수 후 환불 요청
  P-->>O: payment.refunded
  O-->>A: 모든 도메인 이벤트 projection
  P-->>A: 결제 이벤트
  I-->>A: 재고 이벤트
  F-->>A: 배송·반품 이벤트
```

## Admin Query

- 쓰기 모델의 DB를 조인하지 않고 이벤트로 주문·상품·재고·배송·반품·발주 projection을 갱신한다.
- `processed_events.event_id`로 중복 이벤트를 무시한다.
- `POST /admin/rebuild`는 내부 API를 읽어 projection을 완전히 재생성한다.
- KPI와 목록 조회는 projection DB에서 처리하므로 운영 화면이 원본 서비스의 가용성과 복잡한 fan-out에 직접 의존하지 않는다.

## 보안과 신뢰성

- JWT에는 역할과 권한을 포함하며 API마다 역할과 세부 permission을 함께 검사한다.
- 내부 rebuild API는 `x-internal-key`로 외부 요청과 분리한다.
- 상태 전이는 허용된 방향만 지원하며 재고·환불은 DB 제약과 조건부 갱신으로 불변식을 지킨다.
- 관리자 mutation과 projection rebuild는 감사로그에 행위자·대상·사유를 기록한다.
- 다음 운영 단계의 확장점은 transactional outbox, DLQ/재시도 정책, OpenTelemetry, secret manager다.
