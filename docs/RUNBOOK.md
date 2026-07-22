# TECHZONE 실행 가이드

## 요구 환경

- Node.js 22+
- Docker Desktop
- Android 빌드 시 JDK 21과 Android SDK

## 전체 MSA 실행

```bash
npm install
docker compose up --build -d
```

- 웹: `http://localhost:15173`
- Gateway: `http://localhost:18080`
- 상품 API: `GET http://localhost:18080/api/products`

상태 확인:

```bash
docker compose ps
npm run test:integration
```

## 프론트엔드 개발

Gateway 컨테이너를 실행한 상태에서:

```bash
npm run dev
```

정적 배포 산출물 확인:

```bash
npm run build
```

## Android 빌드

```bash
npm run build
npm run mobile:sync
cd android
gradlew.bat assembleDebug
```

APK 위치: `android/app/build/outputs/apk/debug/app-debug.apk`

Windows 작업 경로에 한글이 포함되어 있어 `android/gradle.properties`에 `android.overridePathCheck=true`를 사용한다.

## 주문 Saga 확인

1. Order가 `order.created`를 발행한다.
2. Payment가 Mock 승인 후 `payment.approved`를 발행한다.
3. Order가 `inventory.reserve`를 발행한다.
4. Inventory가 재고를 예약하고 결과 이벤트를 발행한다.
5. Order가 `confirmed` 또는 `cancelled`로 전환한다.
6. Notification이 사용자 알림을 저장한다.

## 종료

```bash
docker compose down
```

데이터 볼륨까지 삭제하는 `docker compose down -v`는 테스트 데이터를 모두 제거하므로 의도한 경우에만 실행한다.
