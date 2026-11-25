#!/bin/bash
# Chạy e2e-chup-tai-khoan.cjs trong emulator cổng 8090 (không đụng cổng 8080 của phiên chính).
# Dùng: bash e2e/sang-toi/chay-tai-khoan.sh <cổng web> <khach|quan-tri> <toi|sang> <thư mục ảnh>
# Cần "$(pwd)/../e2e/sang-toi/firebase.8090.json" (bản sao firebase.json với cổng firestore 8090 và đường dẫn rules tuyệt đối).
sleep 3
cd "$(dirname "$0")/../../firebase" || exit 1
SHOTS_DIR="$4" WEB_PORT="$1" EMU_PORT=8090 ROLE="$2" THEME="$3" npx firebase --config "$(pwd)/../e2e/sang-toi/firebase.8090.json" emulators:exec --only firestore --project demo-ads-nolimit "node ../e2e/sang-toi/e2e-chup-tai-khoan.cjs" 2>&1 | grep -E "xong|rror|console|FAIL|TUONG-PHAN|QUAN-TRI"
