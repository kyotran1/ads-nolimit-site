/**
 * CẤU HÌNH FIREBASE (dự án "ADS-Nolimit Web") cho tài khoản khách hàng.
 *
 * Đây là cấu hình CÔNG KHAI phía trình duyệt: Google thiết kế để nó nằm trong mã web,
 * ai mở trang cũng thấy được, nên đưa vào git là bình thường. Nó chỉ cho biết website
 * nói chuyện với dự án Firebase nào. Dữ liệu được bảo vệ bằng:
 *   - Firebase Authentication (chỉ tên miền được phép trong Console mới đăng nhập được),
 *   - luật bảo mật Firestore trong file firestore.rules ở thư mục gốc repo.
 *
 * Không đặt khóa bí mật (service account, khóa admin) vào đây hay bất kỳ đâu trong site.
 * Firebase chỉ được tải trên các trang tài khoản (đăng nhập, đăng ký, quên mật khẩu, tài khoản).
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyDq8IfKVvCIKAMj4HI_CZgezfUZ4K1oF0Y',
  authDomain: 'ads-nolimit-web.firebaseapp.com',
  projectId: 'ads-nolimit-web',
  storageBucket: 'ads-nolimit-web.firebasestorage.app',
  messagingSenderId: '605653074969',
  appId: '1:605653074969:web:417873d2cd4e4e232d9688',
} as const;
