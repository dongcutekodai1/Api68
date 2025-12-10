const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// Bộ nhớ tạm để lưu 50 trận gần nhất
let historyCache = [];

// ✅ Trang chủ - dùng để ping nhanh hoặc test
app.get('/', (req, res) => {
    res.send('✅ Server alive - six8gamebai-history-hdxpro');
});

// ✅ Endpoint kiểm tra server sống
app.get('/server-alive', (req, res) => {
    res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

// ✅ Endpoint lấy 1 trận gần nhất từ Firebase và lưu vào cache
app.get('/history', async (req, res) => {
    try {
        const response = await axios.get('https://app-tai-xiu-default-rtdb.firebaseio.com/taixiu_sessions/current.json');
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

        const payload = {
    ket_qua: result.ket_qua,
    Phien: result.Phien,
    tong: result.tong,
    xuc_xac_1: result.xuc_xac_1,
    xuc_xac_2: result.xuc_xac_2,
    xuc_xac_3: result.xuc_xac_3,
    id: "truongdong1920"
};

        // Kiểm tra nếu đã tồn tại trong historyCache, thì không thêm lại
        if (!historyCache.some(entry => entry.Phien === result.Phien)) {
            historyCache.unshift(result); // thêm vào đầu mảng
            if (historyCache.length > 50) {
                historyCache.pop(); // xóa phần tử cuối nếu quá 50
            }
        }

        res.json(result);
    } catch (error) {
        console.error("Lỗi khi gọi API:", error.message);
        res.status(500).json({ error: "Lỗi khi lấy dữ liệu" });
    }
});

// ✅ Endpoint trả về 50 trận gần nhất
app.get('/api/history', (req, res) => {
    res.json(historyCache);
});

// ✅ Self-ping để giữ server luôn hoạt động trên Render
const SELF_URL = "https://six8gamebai-history-hdxpro.onrender.com/"; // Gửi request tới chính server
const pingInterval = 60 * 1000; // 60 giây

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

// ✅ Khởi động server
app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
    startSelfPing();
});
