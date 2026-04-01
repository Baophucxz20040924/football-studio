# Migration Plan: data.json → MongoDB

## 📋 Overview
Các bước chuyển dữ liệu từ JSON file sang MongoDB mà **vẫn giữ toàn bộ data** và có thể **rollback** nếu cần.

---

## 🎯 Giai đoạn 1: Setup MongoDB (Tuần đầu)

### Bước 1: Chạy MongoDB bằng Docker Compose trên server
```bash
cd /path/to/web-net-manager

# Khởi động MongoDB + Mongo Express
docker-compose up -d

# Kiểm tra:
docker ps | grep mongo
```

**Xác nhận:**
- MongoDB chạy ở cổng `27017` (internal)
- Mongo Express (GUI) ở `http://server-ip:8081` (default user: admin/admin123)

### Bước 2: Tạo `.env` trên server
```bash
cd /path/to/web-net-manager

cat > .env << 'EOF'
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb://admin:admin123@mongodb:27017/football-net
USE_MONGODB=false
DATA_FILE=/path/to/data.json
REPORT_UTC_OFFSET_MINUTES=420  # Vietnam UTC+7
LOG_RETENTION_DAYS=10
EOF
```

**Lưu ý:**
- `USE_MONGODB=false` → Vẫn dùng JSON (giữ được data cũ)
- `MONGODB_URI` dùng hostname `mongodb` (docker service name)

### Bước 3: Backup data.json
```bash
cd /path/to/web-net-manager
cp data.json data.json.backup.$(date +%Y%m%d_%H%M%S)
ls -la data.json.backup*
```

---

## 🔄 Giai đoạn 2: Chạy Migration Script

### Bước 4: Test migration bằng DRY RUN (không modify dữ liệu)
```bash
cd /path/to/web-net-manager

# Kiểm tra con số sẽ migrate
DRY_RUN=true MONGODB_URI="mongodb://admin:admin123@mongodb:27017/football-net" node migrate-to-mongo.js
```

**Output sẽ hiện:**
```
📖 Reading data.json...
✓ Loaded: 2 users, 1 products, 19 logs

🔗 Connecting to MongoDB...
✓ Connected to mongodb://admin:admin123@mongodb:27017/football-net

🗑️  Clearing existing collections...

📊 Migrating counters...
  ✓ [DRY] users: 2
  ✓ [DRY] products: 1
  ✓ [DRY] logs: 19

👥 Migrating users...
  ✓ [DRY] Would insert 2 users
     - admin (admin)
     - test (user)

...
```

### Bước 5: Chạy migration thật (nếu DRY RUN đúng)
```bash
cd /path/to/web-net-manager

MONGODB_URI="mongodb://admin:admin123@mongodb:27017/football-net" node migrate-to-mongo.js
```

**Kết quả:**
```
✓ Inserted 2 users
✓ Inserted 1 products
✓ Inserted 19 logs

✓ Verifying migration...
  - Users: 2 / 2
  - Products: 1 / 1
  - Logs: 19 / 19
  ✓ All data migrated successfully!
```

### Bước 6: Xem dữ liệu trên Mongo Express
Mở trình duyệt: `http://server-ip:8081`
- Đăng nhập: admin / admin123
- Chọn database: `football-net`
- Kiểm tra collections: users, products, activity_logs

---

## 🔌 Giai đoạn 3: Chuyển Server sang MongoDB

### Bước 7: Update `server.js` để dùng MongoDB
```javascript
// Thay từ:
const db = require('./db');

// Sang:
const db = require(process.env.USE_MONGODB === 'true' ? './db-mongo' : './db');
```

### Bước 8: Update `.env` - Kích hoạt MongoDB
```bash
USE_MONGODB=true
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb://admin:admin123@mongodb:27017/football-net
```

### Bước 9: Restart server
```bash
cd /path/to/web-net-manager

# Nếu dùng npm:
npm start

# Nếu dùng PM2:
pm2 restart football-bot
pm2 logs
```

**Kiểm tra logs:**
```
✓ Connected to MongoDB: football-net
✓ Server listening on port 5000
```

---

## 🔄 Hybrid Mode (An toàn nhất)

### Nếu muốn test MongoDB mà vẫn backup JSON:
```javascript
// db-hybrid.js - Write to cả 2 nơi
const dbJson = require('./db');
const dbMongo = require('./db-mongo');

module.exports = {
  readState: async () => {
    return await dbMongo.readState(); // Đọc từ Mongo
  },
  writeState: async (state) => {
    await dbJson.writeState(state);  // Ghi JSON
    await dbMongo.saveState(state);   // Ghi Mongo
    console.log('✓ Written to both JSON and MongoDB');
  },
};
```

---

## ⚠️ Rollback Plan (Nếu có sự cố)

### Nếu Mongo bị lỗi - Quay lại JSON:
```bash
# 1. Dừng server
pm2 stop football-bot

# 2. Chỉnh .env
USE_MONGODB=false

# 3. Restart
pm2 start football-bot
```

### Nếu data bị sai - Restore từ backup:
```bash
cd /path/to/web-net-manager

# Copy backup trở lại
cp data.json.backup.20260401_123456 data.json

# Xóa MongoDB (để migrate lại):
docker exec football-net-mongo mongosh football-net -u admin -p admin123 --eval "db.dropDatabase()"

# Migrate lại
node migrate-to-mongo.js
```

---

## 📦 Package.json thêm dependencies

Thêm vào `web-net-manager/package.json`:
```json
{
  "dependencies": {
    "mongodb": "^5.9.0"
  }
}
```

Rồi cài:
```bash
cd /path/to/web-net-manager
npm install mongodb
```

---

## ✅ Checklist

- [ ] Docker Compose chạy MongoDB + Mongo Express
- [ ] `.env` cấu hình MONGODB_URI đúng
- [ ] Backup data.json an toàn
- [ ] DRY RUN thành công (con số match)
- [ ] Migration script chạy thành công (verify ok)
- [ ] Data hiểu thị đúng trên Mongo Express
- [ ] Update server.js để support MongoDB
- [ ] `.env` set `USE_MONGODB=true`
- [ ] Restart server + test hoạt động bình thường
- [ ] Xóa file `data.json` nếu production stable (hoặc giữ làm backup)

---

## 🆘 Troubleshooting

### MongoDB connection refused
```bash
# Check if MongoDB running
docker ps | grep mongo

# Restart MongoDB
docker-compose restart mongodb
```

### Migration script hangs
```bash
# Check MONGODB_URI syntax, example:
# mongodb://admin:password@hostname:27017/database_name

# Test connection:
docker exec football-net-mongo mongosh -u admin -p admin123 --eval "db.adminCommand('ping')"
```

### Ports conflict (27017 hoặc 8081 already in use)
```bash
# Thay port trong docker-compose.yml:
# ports:
#   - "27018:27017"   # Use 27018 instead of 27017
#   - "8082:8081"     # Use 8082 instead of 8081

docker-compose up -d
```

---

## 📞 References
- Docker Compose docs: https://docs.docker.com/compose/
- MongoDB Node.js driver: https://www.mongodb.com/docs/drivers/node/
- Mongo Express: https://github.com/mongo-express/mongo-express
