# TECHZONE Kubernetes

실제 비밀 값은 저장소에 커밋하지 않습니다. `secret.example.yaml`을 복사한 뒤 외부 Secret Manager 또는 `kubectl create secret generic`으로 `techzone-secrets`를 생성합니다.

```bash
kubectl apply -f infra/k8s/rbac.yaml
npm run k8s:render | kubectl apply --dry-run=server -f -
npm run k8s:render | kubectl apply -f -
```

렌더러는 13개 NestJS 서비스별 Deployment·Service·PDB를 생성합니다. Gateway, Order, Payment, Inventory, Fulfillment에는 CPU 70% 기준 2–6 replica HPA가 포함됩니다. Migration Job이 성공한 뒤 애플리케이션을 배포하는 순서는 CI/CD 파이프라인에서 보장해야 합니다.
