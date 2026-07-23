# TECHZONE

TECHZONE은 한국형 Tech/IT 커머스를 주제로 한 포트폴리오 서비스입니다. 고객 스토어, Capacitor Android 앱, 상용형 OMS/WMS 관리자, 13개 독립 백엔드 서비스를 하나의 저장소에서 운영합니다.

## 기술 구성

- Web: Next.js 16, React 19, Tailwind CSS 4, shadcn/ui
- Mobile: Capacitor 8, Android Keystore 기반 refresh token 보관
- Backend: Node.js 22, NestJS 11, Drizzle ORM, PostgreSQL 16
- Messaging: RabbitMQ, transactional outbox/inbox, 5단계 재시도, DLQ
- Security: RS256/JWKS, 회전형 refresh token, CSRF, RBAC, Redis rate limit
- Observability: OpenTelemetry, Prometheus, Tempo, Loki, Grafana
- Infrastructure: Docker Compose, Kubernetes Deployment/HPA/PDB/Job 렌더러

## 로컬 실행

```bash
npm install
docker compose up -d --build
npm run test:security
npm run test:integration
npm run test:storefront
```

- 고객/관리자 웹: http://localhost:15173
- API Gateway: http://localhost:18080
- Grafana: http://localhost:13000 (`admin` / `techzone`)
- Prometheus: http://localhost:19090
- RabbitMQ Management: http://localhost:15672
- MinIO Console: http://localhost:19001

개발 관리자 계정은 `admin@techzone.local` / `TechzoneAdmin123!`입니다. 운영 환경에서는 반드시 Secret Manager 값으로 교체합니다.

## 품질 게이트

```bash
npm run generate:api
npm run lint
npm run typecheck
npm run test:unit
npm run test:contract
npm run build
npm run build:mobile
node scripts/render-k8s.mjs
```

전체 Docker 환경에서는 보안, 주문 Saga, storefront, RabbitMQ 장애 복구 테스트를 추가로 수행합니다. CI는 Android debug APK도 빌드합니다.

## 주요 문서

- [PRD](docs/PRD.md)
- [SSOT](docs/SSOT.md)
- [아키텍처](docs/ARCHITECTURE.md)
- [데이터 모델](docs/DATA_MODEL.md)
- [신뢰성·보안 설계](docs/RELIABILITY.md)
- [운영 Runbook](docs/RUNBOOK.md)
- [Kubernetes 배포](infra/k8s/README.md)

실제 비밀 값은 저장소에 포함하지 않습니다. 환경 변수 예시는 [.env.example](.env.example), Kubernetes Secret 구조는 [secret.example.yaml](infra/k8s/secret.example.yaml)을 확인하세요.
