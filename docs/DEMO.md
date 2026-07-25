# TECHZONE Portfolio Demo

이 문서는 TECHZONE을 포트폴리오로 보여줄 때 가장 설득력 있는 시연 순서입니다. 목표는 화면을 많이 넘기는 것이 아니라, 고객 구매가 관리자 OMS/WMS와 이벤트 기반 읽기 모델까지 이어진다는 점을 짧고 선명하게 보여주는 것입니다.

## 1. 고객 구매 흐름

1. 스토어 홈에서 배너, 카테고리, 특가, 인기 상품 진열을 보여준다.
2. 상품 목록에서 브랜드, 가격, 재고 필터와 정렬을 적용한다.
3. 상품 상세에서 이미지 갤러리, variant, 스펙, 리뷰, 재고 요약을 확인한다.
4. 장바구니에 담고 쿠폰 `TECHZONE10`을 적용한다.
5. Mock 결제로 주문을 생성하고 주문 완료 화면의 주문번호를 기록한다.
6. 주문 상세에서 주문 타임라인과 배송 정보를 확인한다.

## 2. 관리자 운영 흐름

1. `/admin/login`에서 관리자 계정으로 로그인한다.
2. 대시보드에서 총매출, 주문 수, 결제 승인율, 출고 지연, 재고 위험 KPI를 확인한다.
3. 최근 주문의 이동 버튼을 눌러 주문번호가 검색된 주문 관리 화면으로 이동한다.
4. 주문 상태를 `상품 준비` 또는 `배송 중`으로 변경하고 처리 사유를 남긴다.
5. 배송 관리에서 출고 대기 필터를 확인하고 송장번호를 등록한다.
6. 재고 관리에서 주문된 SKU의 예약 수량과 가용 수량 변화를 확인한다.
7. 시스템 상태에서 DLQ, Outbox 지연, 이벤트 처리량을 확인한다.

## 3. 기술 설명 포인트

- 고객 API와 관리자 API는 같은 DTO 계약을 유지하고, 관리자 조회는 Admin Query 읽기 모델로 분리한다.
- 주문 생성 후 결제, 재고 예약, 출고, 관리자 projection은 event ID 기반 멱등 처리로 연결된다.
- 상품과 재고는 variant/SKU 기준으로 연결되고, 모든 수량 변경은 movement 원장으로 추적한다.
- Next.js SSR 웹과 Capacitor 앱은 동일 스토어 컴포넌트를 공유하되 빌드 산출물은 분리한다.
- Docker Compose는 로컬 통합 검증용, Kubernetes manifest는 운영형 배포 설명용으로 둔다.

## 4. 검증 명령

```bash
npm run test:storefront
npm run test:admin-e2e
npm run test:integration
npm run test:resilience
npm run build
```

전체 서비스가 필요한 검증은 먼저 Docker Compose로 PostgreSQL, RabbitMQ, Redis, MinIO와 각 서비스를 실행한 뒤 수행한다.
