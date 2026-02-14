# Tiến Lên Miền Bắc Multiplayer (Phaser + Node.js)

## Chạy nhanh từ thư mục gốc

```bash
npm install
npm run install:all
npm start
```

Lệnh `npm start` ở thư mục gốc sẽ chạy đồng thời backend + frontend.

Frontend đã chuyển sang **Phaser 3** và tự tạo sprite sheet từ thư mục `Cards (large)` khi chạy `npm start`/`npm run dev`.

## Cấu trúc

- `server`: backend Node.js + Socket.IO
- `server/client`: frontend Phaser 3 (Vite)
- `server/client/src/scenes`: `BootScene`, `PreloadScene`, `GameScene`
- `server/client/src/components`: `Card`, `Hand`, `Table`
- `server/client/src/socket/events.js`: socket contract + render sync state

## Chạy backend

```bash
cd server
npm install
npm run dev
```

Backend chạy tại: `http://localhost:3001`

## Dùng chung DB với bot

- Server Tiến Lên đã dùng chung `MONGODB_URI` với bot (ưu tiên đọc từ `.env` ở thư mục gốc project).
- Cần có `MONGODB_URI` trỏ về DB bot hiện tại.
- Khi vào phòng, người chơi cần nhập `User ID (Discord ID)` để map đúng tài khoản trong collection `User`.
- Thắng/thua trong ván sẽ cộng/trừ trực tiếp vào `User.balance` của bot.
- Chặn vào bàn nếu không đủ điểm tối thiểu: `betUnit * 15` (ví dụ cược 10 cần ít nhất 150 điểm).
- Có thể chỉnh hệ số qua biến môi trường `TIENLEN_MIN_ENTRY_MULTIPLIER`.

## Mở game từ bot Discord

- Dùng lệnh `/tienlen` trên bot để nhận link vào game.
- Link từ bot sẽ có dạng `/tienlen?token=...` trên domain chính của bot.
- Link có token đăng nhập, web sẽ tự lấy `userId` + `userName` từ token nên không cần nhập tên tay.
- Cần set `TIENLEN_WEB_URL` (ví dụ `http://localhost:5173` hoặc domain deploy frontend) để route `/tienlen` redirect đúng nơi.
- Cần set `TIENLEN_TOKEN_SECRET` giống nhau giữa bot server và Tiến Lên server.
- Có thể chỉnh hạn token bằng `TIENLEN_TOKEN_TTL_MS`.
- Nếu chạy bot + Tiến Lên cùng lúc, dùng `TIENLEN_PORT` (mặc định `3001`) để tránh trùng `PORT` của bot.

## Chạy frontend

```bash
cd server/client
npm install
npm run dev
```

Frontend mặc định chạy tại: `http://localhost:5173`

## Asset bài bắt buộc

Source ảnh nằm ở thư mục gốc: `Cards (large)`.

Frontend sẽ tự generate tại `server/client/public/assets`:

- `cards.png` (sprite sheet 52 lá)
- `card_back.png`
- `cards.meta.json` (kích thước frame)

Có thể chạy thủ công:

```bash
cd server/client
npm run build:assets
```

## Chức năng đã có

- Tạo phòng + mã phòng để người khác join
- Hỗ trợ 2-4 người chơi
- Chủ phòng bắt đầu ván khi đủ từ 2 người
- Chia 13 lá/người
- Ván đầu: ai có `3♠` đi trước
- Ván sau: người thắng ván trước đi trước
- Đánh bài theo lượt, bỏ lượt, reset vòng khi mọi người bỏ
- Kết thúc ván khi một người hết bài

## Kiểu bài hỗ trợ

- Bài lẻ
- Đôi
- Sám
- Tứ quý
- Sảnh đồng chất (không chứa `2`)
- Đôi thông từ 3 đôi trở lên (dùng cho 3 đôi thông / 4 đôi thông)

## Luật chặt hỗ trợ

- Tứ quý chặt `2` lẻ
- 4 đôi thông chặt đôi `2`

## Lưu ý

Nguyên tắc FE:

> FE chỉ render theo state/event từ Socket.IO, không tự suy luận luật.

Đây là bản MVP để chơi online realtime. Nếu bạn muốn, mình có thể làm tiếp:

- Chặt nâng cao đầy đủ hơn theo biến thể bạn muốn
- Xử lý reconnect vào lại phòng
- Bảng xếp hạng theo nhiều ván
- Triển khai Docker + deploy
