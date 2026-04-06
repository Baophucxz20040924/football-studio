# Food Management App

Ứng dụng quản lý thực phẩm đơn giản với 2 vai trò:

- `admin`: đăng nhập, thêm/sửa/xóa sản phẩm, tạo tài khoản, xem lịch sử hoạt động.
- `user`: đăng nhập và chỉ được trừ số lượng sản phẩm, bắt buộc chọn hình thức thanh toán (tiền mặt/chuyển khoản) và ghi note.

## Chức năng

- Đăng nhập theo vai trò.
- Quản lý tồn kho sản phẩm.
- Ghi lại lịch sử đăng nhập, trừ sản phẩm, CRUD sản phẩm và tạo tài khoản.
- Giao diện web thuần `HTML/CSS/JS`, backend `Node.js + Express`.
- Lưu dữ liệu bằng file `data.json` để chạy nhanh trên máy local.

## Tài khoản mặc định

- Admin: `admin` / `admin123`

User sẽ được admin tạo thêm trong hệ thống khi cần.

## Cách chạy

```bash
npm install
npm start
```

Mở trình duyệt tại `http://localhost:3000`.

## Deploy Hosting

Chạy được trên hosting Node.js bình thường.

Lưu ý quan trọng: app đang lưu dữ liệu bằng file JSON, nên cần ổ đĩa persistent nếu muốn giữ dữ liệu lâu dài.

### 1. Render (khuyên dùng nhanh)

1. Push code lên GitHub.
2. Tạo `Web Service` trên Render, chọn repo này.
3. Cấu hình:
	- Build Command: `npm install`
	- Start Command: `npm start`
4. Tạo `Persistent Disk` (ví dụ mount path: `/var/data`).
5. Thêm biến môi trường:
	- `DATA_FILE=/var/data/data.json`
	- `JWT_SECRET=<chuoi-bi-mat-cua-ban>`
6. Deploy xong là chạy được.

### 2. Railway

1. Tạo project mới và connect GitHub repo.
2. Railway tự nhận diện Node app, start bằng `npm start`.
3. Thêm Volume hoặc persistent storage.
4. Set biến môi trường:
	- `DATA_FILE=/data/data.json` (hoặc đường dẫn mount tương ứng)
	- `JWT_SECRET=<chuoi-bi-mat-cua-ban>`

### 3. Lưu ý khi dùng hosting serverless

- Các nền tảng serverless tĩnh (như Vercel kiểu frontend) không phù hợp cho app này vì có API stateful + file dữ liệu cục bộ.
- Nếu bắt buộc dùng serverless, nên đổi sang DB ngoài (PostgreSQL/MySQL) thay vì file JSON.
