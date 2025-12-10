const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// Bộ nhớ tạm để lưu 50 trận gần nhất
let historyCache = [];

// Trang chủ
app.get('/', (req, res) => {
    res.send('✅ Server alive - api68');
});

// Endpoint kiểm tra server sống
app.get('/server-alive', (req, res) => {
    res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

// Lấy trận mới nhất từ Firebase (KHÔNG DÙNG _end nữa)
app.get('/history', async (req, res) => {
    try {
        const response = await axios.get(
            'https://app-tai-xiu-default-rtdb.firebaseio.com/taixiu_sessions/current.json'
        );

        const latestSession = response.data;

        // Nếu Firebase trả về null
        if (!latestSession || typeof latestSession !== 'object') {
            console.error("❌ Firebase không có dữ liệu hợp lệ:", latestSession);
            return res.status(500).json({ error: "Firebase trả về dữ liệu rỗng" });
        }

        // Chuẩn hoá dữ liệu trả về
        const result = {
            ket_qua: latestSession.ket_qua,
            Phien: latestSession.Phien,
            tong: latestSession.tong,
            xuc_xac_1: latestSession.xuc_xac_1,
            xuc_xac_2: latestSession.xuc_xac_2,
            xuc_xac_3: latestSession.xuc_xac_3,
            id: "truongdong1920"
        };

        // Lưu vào lịch sử nếu chưa có
        if (!historyCache.some(entry => entry.Phien === result.Phien)) {
            historyCache.unshift(result);
            if (historyCache.length > 50) {
                historyCache.pop();
            }
        }

        // Trả kết quả cho client
        res.json(result);

    } catch (error) {
        console.error("Lỗi khi gọi Firebase:", error.message);
        res.status(500).json({ error: "Lỗi khi lấy dữ liệu từ Firebase" });
    }
});

// Trả về 50 trận gần nhất
app.get('/api/history', (req, res) => {
    res.json(historyCache);
});

// Self-ping Render
const SELF_URL = "https://api68-6tko.onrender.com/";
const pingInterval = 60 * 1000;

function startSelfPing() {
    setInterval(async () => {
        try {
            const res = await axios.get(SELF_URL);
            console.log(`[Self-Ping] OK: ${res.status} at ${new Date().toISOString()}`);
        } catch (err) {
            console.error(`[Self-Ping] Lỗi: ${err.message}`);
        }
    }, pingInterval);
}

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
    startSelfPing();
});
