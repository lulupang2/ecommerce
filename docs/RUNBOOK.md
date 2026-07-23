# TECHZONE 실행 가이드

## 요구 환경

- Node.js 22+
- Docker Desktop
- Android 빌드: JDK 21, Android SDK

## 실행과 로그인

```bash
npm install
docker compose up --build -d
docker compose ps
```

- 웹·관리자: `http://localhost:15173`
- Gateway: `http://localhost:18080/api`
- MinIO 콘솔: `http://localhost:19001`
- 관리자 계정: `admin@techzone.local` / `TechzoneAdmin123!`

관리자로 로그인하면 `/admin` 대시보드로 이동한다.

## 검증

```bash
npm run build
npm run test:integration
npm run mobile:sync
cd android
gradlew.bat assembleDebug
```

통합 테스트는 health, 고객/관리자 접근 제어, 주문→결제→재고예약→출고→배송, 반품→환불, projection rebuild, 서버 테이블, 감사로그, viewer 쓰기 차단을 검증한다.

APK: `android/app/build/outputs/apk/debug/app-debug.apk`

## DB 초기화와 projection 복구

개발 데이터를 완전히 재생성할 때만 다음 명령을 사용한다.

```bash
docker compose down -v
docker compose up --build -d
```

초기 시드는 테크 상품 variant 8개, 중앙·반품 창고, 주문·배송·반품, 공급사·발주를 만든다. 운영 projection만 복구하려면 슈퍼관리자 토큰으로 `POST /api/admin/rebuild`를 호출한다.

## 운영 점검

```bash
docker compose logs --tail=100 admin order inventory fulfillment procurement
docker compose exec -T postgres psql -U canvas -d admin
```

모든 서비스가 healthy이고 대시보드 KPI가 원본 데이터와 일치해야 한다. Mock 결제와 Mock 택배 adapter가 기본이며 실제 provider secret은 저장소에 커밋하지 않는다.

## 종료

```bash
docker compose down
```

`-v`는 모든 개발 데이터를 삭제하므로 초기화가 명시적으로 필요할 때만 사용한다.
