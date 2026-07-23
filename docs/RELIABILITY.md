# TECHZONE 신뢰성·보안 설계

## 인증

- access token: RS256, 15분, `techzone-api` audience
- refresh token: 14일, 매 갱신 시 회전, SHA-256 hash만 DB 저장
- 재사용 탐지: 이미 폐기된 refresh token이 다시 제출되면 같은 family 전체 폐기
- Web: `HttpOnly`, `Secure(production)`, `SameSite=Lax` 쿠키와 CSRF 이중 제출
- Capacitor: access token은 앱 세션, refresh token은 Android Keystore secure storage
- 서비스 검증: Auth의 `/.well-known/jwks.json`을 5분 캐시

회원 장바구니·주문은 JWT `sub`와 소유자를 비교합니다. 비회원 주문은 주문번호와 정규화된 휴대폰 번호 확인 후 발급한 주문 전용 15분 JWT만 허용합니다.

## 이벤트 전달

쓰기 서비스는 도메인 변경과 `outbox_events` 기록을 동일 PostgreSQL transaction으로 커밋합니다. Publisher는 confirm channel로 RabbitMQ 확인을 받은 후 `published_at`을 기록합니다.

소비자는 처리 완료 후 `inbox_events`에 event ID를 기록합니다. 같은 ID의 재전달은 ACK만 수행합니다. 실패 시 1초, 5초, 30초, 2분, 10분 순서로 재시도하며 이후 DLQ로 투영합니다.

관리자 `/admin/system/`에서 DLQ 조회, 사유를 포함한 재처리·폐기, outbox 지연, 최근 이벤트 처리량을 확인할 수 있습니다. 모든 작업은 감사로그에 남습니다.

이벤트 envelope v1:

```json
{
  "id": "uuid",
  "type": "order.created",
  "source": "order",
  "requestId": "request-id",
  "correlationId": "correlation-id",
  "causationId": null,
  "actorId": "uuid-or-null",
  "occurredAt": "ISO-8601",
  "schemaVersion": 1,
  "payload": {}
}
```

## 관측성

- HTTP, PostgreSQL, RabbitMQ 자동 계측은 OTLP/HTTP로 Collector에 전달
- Prometheus: RED 지표, Node runtime, outbox, DLQ
- Tempo: Gateway → Order → Payment → Inventory → Fulfillment trace
- Loki: JSON 구조화 애플리케이션 로그
- Grafana: 서비스 요청률, 오류율, p95, outbox/DLQ 대시보드

기본 경보는 오류율 5%, p95 1초, DLQ 1건, outbox 5분 적체, 서비스 down입니다. 로그의 비밀번호, 토큰, 이메일, 휴대폰, Authorization 값은 마스킹합니다.

## 복구 절차

1. `/health/ready`, Grafana 경보와 correlation ID를 확인합니다.
2. Admin 시스템 화면에서 outbox 적체와 DLQ 원인을 확인합니다.
3. 의존 서비스가 정상화된 후 DLQ를 한 건씩 재처리합니다.
4. 주문 상세 `sagaTimeline`과 Admin projection이 원본 상태와 일치하는지 확인합니다.
5. 불일치 시 사유를 입력하고 `/admin/rebuild`를 실행합니다.

`npm run test:resilience`는 RabbitMQ를 중단한 상태에서 주문을 커밋한 뒤 재기동하여 outbox 발행과 Saga 복구를 검증합니다.
