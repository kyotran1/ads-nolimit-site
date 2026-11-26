/**
 * Cách đăng nhập được bật trên website. Đọc từ biến lúc build, mặc định TẮT để lên web lúc nào cũng an toàn.
 *   Facebook: PUBLIC_FB_LOGIN = off (mặc định) | test | on
 *     off  : không có nút "Tiếp tục với Facebook" và không có mã Facebook nào trong bản build;
 *     test : mã Facebook được build vào nhưng nút chỉ hiện trên trình duyệt đã bật chế độ thử
 *            (mở /dang-nhap/?fbtest=1 một lần, ?fbtest=0 để tắt; lưu localStorage 'adsnl-fbtest'). Chưa bật thì y như "off";
 *     on   : hiện cho mọi khách (sau khi Firebase + Meta đã cấu hình xong).
 * Mã trình duyệt dùng `facebookLoginOn` (mã Facebook có trong bản build: on hoặc test; hằng lúc build nên ở "off" các
 * nhánh Facebook là mã chết, không chạy) và `facebookTestOnly`; trang web (Astro) dùng `authProviders`, trong đó `facebook` = hiện cho mọi khách.
 * File này không nạp gì khác (cả trang web lẫn mã trình duyệt đều đọc được); `src/config/site.ts` xuất lại nó.
 */
export const facebookTestOnly: boolean = (import.meta.env.PUBLIC_FB_LOGIN ?? 'off') === 'test';
export const facebookLoginOn: boolean = (import.meta.env.PUBLIC_FB_LOGIN ?? 'off') === 'on' || facebookTestOnly;
export const authProviders = { facebook: (import.meta.env.PUBLIC_FB_LOGIN ?? 'off') === 'on', facebookTest: facebookTestOnly } as const;
