const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// Bộ nhớ tạm lưu 50 trận gần nhất
let historyCache = [];

// Trang chủ
app.get('/', (req, res) => {
    res.send('✅ Server alive - six8gamebai-history-hdxpro');
});

// Endpoint kiểm tra server sống
app.get('/server-alive', (req, res) => {
    res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

// Lấy 1 trận gần nhất từ Firebase
app.get('/history', async (req, res) => {
    try {
        const response = await axios.get(
            'https://app-tai-xiu-default-rtdb.firebaseio.com/taixiu_sessions/current.json'
        );
        const data = response.data;

        const endSessions = Object.keys(data)
            .filter(key => key.endsWith('_end'))
            .sort((a, b) => {
                const numA = parseInt(a.split('_')[0]);
                const numB = parseInt(b.split('_')[0]);
                return numB - numA;
            });

        const latestKey = endSessions[0];
        const latestSession = data[latestKey];

        // 🔥 FIX: tạo object result đúng từ latestSession
        const result = {
            ket_qua: latestSession.ket_qua,
            Phien: parseInt(latestSession.Phien),
            tong: latestSession.tong,
            xuc_xac_1: latestSession.xuc_xac_1,
            xuc_xac_2: latestSession.xuc_xac_2,
            xuc_xac_3: latestSession.xuc_xac_3,
            id: "truongdong1920"
        };

        // Lưu vào cache nếu chưa có
        if (!historyCache.some(entry => entry.Phien === result.Phien)) {
            historyCache.unshift(result);
            if (historyCache.length > 50) {
                historyCache.pop();
            }
        }

        res.json(result);

    } catch (error) {
        console.error("Lỗi khi gọi API:", error.message);
        res.status(500).json({ error: "Lỗi khi lấy dữ liệu" });
    }
});

// Trả về 50 trận gần nhất
app.get('/api/history', (req, res) => {
    res.json(historyCache);
});

// Self ping Render
const SELF_URL = "https://six8gamebai-history-hdxpro.onrender.com/";
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
