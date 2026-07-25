# TECHZONE

한국형 Tech/IT 커머스를 주제로 한 포트폴리오 서비스입니다. 고객 스토어,
Capacitor Android 앱, OMS/WMS 관리자 CMS, API Gateway와 12개 도메인
서비스를 npm workspaces 기반 모노레포에서 운영합니다.

## 기술 구성

- Storefront/Admin: Next.js 16, React 19, Tailwind CSS 4, shadcn/ui
- Mobile: Capacitor 8, Android
- Backend: Node.js 22, NestJS 11, Drizzle ORM, PostgreSQL 16
- Messaging: RabbitMQ, transactional outbox/inbox, retry, DLQ
- Security: RS256/JWKS, 회전형 refresh token, CSRF, RBAC, Redis rate limit
- Observability: OpenTelemetry, Prometheus, Tempo, Loki, Grafana
- Infrastructure: Docker Compose, Kubernetes Deployment/HPA/PDB/Job

## 로컬 실행

```bash
npm ci
npm run ms:up
```

- 고객 스토어: http://localhost:15173
- 관리자: http://localhost:15173/admin
- API Gateway: http://localhost:18080
- Grafana: http://localhost:13000 (`admin` / `techzone`)
- RabbitMQ Management: http://localhost:15672
- MinIO Console: http://localhost:19001

개발 관리자 계정은 `admin@techzone.local` / `TechzoneAdmin123!`입니다.
운영에서는 반드시 Secret Manager 값으로 교체해야 합니다.

## 품질 게이트

```bash
npm run generate:api
npm run lint
npm run typecheck
npm run test:unit
npm run test:contract
npm run build
npm run build:mobile
npm run k8s:render
```

상세한 코드 소유권과 실행 단위는 [모노레포 가이드](docs/monorepo.md)를,
환경 변수는 [.env.example](.env.example)을 참고하세요.
