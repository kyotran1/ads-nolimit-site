/**
 * Cách đăng nhập được bật trên website. Đọc từ biến lúc build, mặc định TẮT để lên web lúc nào cũng an toàn.
 *   Facebook: đặt PUBLIC_FB_LOGIN=on khi build (sau khi Firebase + Meta đã cấu hình xong).
 * Khi tắt: không có nút "Tiếp tục với Facebook" và không có mã Facebook nào được chạy.
 * Mã trình duyệt dùng hằng `facebookLoginOn` (để bộ gộp mã bỏ hẳn phần Facebook khi tắt); trang web dùng `authProviders`.
 * File này không nạp gì khác (cả trang web lẫn mã trình duyệt đều đọc được); `src/config/site.ts` xuất lại nó.
 */
export const facebookLoginOn: boolean = (import.meta.env.PUBLIC_FB_LOGIN ?? 'off') === 'on';
export const authProviders = { facebook: facebookLoginOn } as const;
