# TECHZONE

TECHZONE은 한국어 테크·IT 기기 쇼핑몰을 주제로 만든 풀스택 포트폴리오 프로젝트입니다. Next.js 웹을 Capacitor Android 앱으로 공유하고, 10개 Node.js 서비스와 RabbitMQ 주문 Saga로 MSA의 핵심 경계를 구현합니다.

## 기술 스택

- Frontend: Next.js 16, React 19, Tailwind CSS 4, shadcn/ui 패턴
- Mobile: Capacitor 8 Android
- Backend: Node.js 22, Express 5
- Data & Messaging: PostgreSQL 16, RabbitMQ
- Infrastructure: Docker Compose, Nginx

## 빠른 실행

```bash
npm install
docker compose up --build -d
npm run test:integration
```

- 웹: http://localhost:15173
- API Gateway: http://localhost:18080

## 주요 문서

- [PRD](docs/PRD.md)
- [SSOT](docs/SSOT.md)
- [아키텍처](docs/ARCHITECTURE.md)
- [데이터 모델](docs/DATA_MODEL.md)
- [실행 가이드](docs/RUNBOOK.md)

## 핵심 시나리오

회원가입/로그인 → 상품 탐색 → 장바구니 → 주문 생성 → Mock 결제 승인 → 재고 예약 → 주문 확정 → 알림 및 주문 내역 조회

> 현재는 포트폴리오 MVP입니다. 실제 결제·객체 스토리지·API Gateway 인증·이벤트 outbox는 다음 단계의 운영 확장 항목입니다.
