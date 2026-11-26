#!/bin/bash
# Chạy e2e-thong-bao.cjs trong emulator Firestore cổng 8101 (cấu hình riêng, không đụng cổng 8080 của phiên khác).
# Dùng: bash e2e/thong-bao/chay.sh <cổng web> <độ rộng> <toi|sang> <thư mục ảnh>
# Cần: bản build ở dist/ đã được phục vụ ở <cổng web> (bash e2e/pwa/serve.sh <cổng web> <đường dẫn>/dist).
cd "$(dirname "$0")/../../firebase" || exit 1
SHOTS_DIR="$4" WEB_PORT="$1" EMU_PORT=8101 W="$2" THEME="$3" CONTRAST=1 \
  npx firebase --config ../e2e/thong-bao/firebase.8101.json emulators:exec --only firestore --project demo-ads-nolimit "node ../e2e/thong-bao/e2e-thong-bao.cjs"
