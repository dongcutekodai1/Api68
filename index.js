const WebSocket = require("ws");
const express = require("express");
const cors = require("cors");

const PORT = 3000;
const API_ID = "@truongdong1920";
const MAX_HISTORY = 50;

class Son789 {
    constructor(url) {
        this.url = url;
        this.ws = null;
        this.sessionId = null;
        this.isAuth = false;

        this.tables = {
            tx: this.initTable("tai_xiu"),
            md5: this.initTable("md5")
        };
    }

    initTable(name) {
        return {
            name,
            htr: [],
            lastSidHandled: null,
            lastPrediction: null,

            win_correct: 0,
            lose: 0,
            total_predict: 0,

            history: []
        };
    }

    connect() {
        this.ws = new WebSocket(this.url, {
            headers: {
                Origin: "https://play.son789.site",
                "User-Agent": "Mozilla/5.0"
            }
        });

        this.ws.on("open", () => {
            console.log("✅ WS Connected");
        });

        this.ws.on("message", msg => this.onMessage(msg));

        this.ws.on("close", () => {
            console.log("❌ WS Closed → reconnect 5s");
            this.isAuth = false;
            this.sessionId = null;
            setTimeout(() => this.connect(), 5000);
        });
    }

    sendAuth() {
        if (!this.sessionId || this.isAuth) return;
        this.ws.send(JSON.stringify([1, "MiniGame", "son789api", this.sessionId, {}]));
    }

    subscribe() {
        this.ws.send(JSON.stringify([6, "MiniGame", "taixiuPlugin", { cmd: 1005 }]));
        this.ws.send(JSON.stringify([6, "MiniGame", "taixiuMd5Plugin", { cmd: 1105 }]));
    }

    onMessage(raw) {
        try {
            const m = JSON.parse(raw);

            // Nhận session
            if (m[0] === 1 && m[4] === "MiniGame") {
                this.sessionId = m[3];
                console.log("🆔 Session:", this.sessionId);
                this.sendAuth();
                return;
            }

            // Auth OK
            if (m[0] === 5 && m[1]?.cmd === 100) {
                this.isAuth = true;
                console.log("🔐 Auth OK");
                this.subscribe();
                return;
            }

            // TX
            if (m[0] === 5 && m[1]?.cmd === 1005 && m[1].htr) {
                this.tables.tx.htr = m[1].htr;
            }

            // MD5
            if (m[0] === 5 && m[1]?.cmd === 1105 && m[1].htr) {
                this.tables.md5.htr = m[1].htr;
            }
        } catch (e) {}
    }

    duDoan(htr) {
        if (!htr || htr.length < 5) return null;

        let tai = 0, xiu = 0;
        htr.slice(-5).forEach(v => {
            (v.d1 + v.d2 + v.d3 >= 11) ? tai++ : xiu++;
        });

        return {
            du_doan: tai > xiu ? "tai" : "xiu",
            do_tin_cay: Math.min(95, 50 + Math.abs(tai - xiu) * 10)
        };
    }

    buildResult(table) {
        if (!table.htr || table.htr.length === 0) {
            return { error: "Chưa có dữ liệu" };
        }

        const last = table.htr.at(-1);
        const sid = last.sid;

        const tong = last.d1 + last.d2 + last.d3;
        const ket_qua = tong >= 11 ? "tai" : "xiu";

        // CHỈ xử lý khi có phiên mới
        if (table.lastSidHandled !== sid && table.lastPrediction) {
            const isWin = table.lastPrediction.du_doan === ket_qua;

            table.total_predict++;
            isWin ? table.win_correct++ : table.lose++;

            table.history.unshift({
                ban: table.name,
                phien: table.lastPrediction.phien,
                du_doan: table.lastPrediction.du_doan,
                ket_qua_thuc_te: ket_qua,
                result: isWin ? "WIN" : "LOSE",
                time: new Date().toISOString()
            });

            table.history = table.history.slice(0, MAX_HISTORY);
            table.lastSidHandled = sid;
        }

        const du_doan = this.duDoan(table.htr);
        table.lastPrediction = {
            phien: sid,
            du_doan: du_doan?.du_doan
        };

        return {
            id: API_ID,
            ban: table.name,
            id_phien: sid,
            xuc_xac: [last.d1, last.d2, last.d3],
            tong,
            ket_qua,
            du_doan_phien_tiep_theo: du_doan,
            thong_ke: {
                win_dung: table.win_correct,
                lose: table.lose,
                tong_du_doan: table.total_predict,
                win_rate: table.total_predict
                    ? ((table.win_correct / table.total_predict) * 100).toFixed(2) + "%"
                    : "0%"
            }
        };
    }
}

/* ================= SERVER ================= */

const app = express();
app.use(cors());

const son789 = new Son789("wss://api.jiusyss.me/websocket");
son789.connect();

app.get("/", (_, res) => res.send("SON789 API RUNNING"));

app.get("/api/tx", (_, res) => {
    res.json(son789.buildResult(son789.tables.tx));
});

app.get("/api/md5", (_, res) => {
    res.json(son789.buildResult(son789.tables.md5));
});

app.get("/api/all", (_, res) => {
    res.json({
        tai_xiu: son789.buildResult(son789.tables.tx),
        md5: son789.buildResult(son789.tables.md5)
    });
});

app.get("/lichsududoan", (_, res) => {
    res.json({
        id: API_ID,
        tx: son789.tables.tx.history,
        md5: son789.tables.md5.history
    });
});

app.get("/api/status", (_, res) => {
    res.json({
        ws_connected: son789.ws?.readyState === 1,
        authenticated: son789.isAuth,
        tx_sessions: son789.tables.tx.htr.length,
        md5_sessions: son789.tables.md5.htr.length
    });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 API running http://IP:${PORT}`);
});                du_doan: table.lastPrediction.du_doan,
                ket_qua_thuc_te: ket_qua,
                result: isWin ? "WIN" : "LOSE"
            };

            table.history.unshift({
                ...ket_qua_truoc,
                ban: table.name,
                timestamp: new Date().toISOString()
            });

            table.history = table.history.slice(0, MAX_HISTORY);
        }

        const du_doan = this.duDoan(table.htr);
        table.lastPrediction = {
            phien: last.sid,
            du_doan: du_doan?.du_doan
        };

        return {
            id: API_ID,
            ban: table.name,
            id_phien: last.sid,
            xuc_xac: [last.d1, last.d2, last.d3],
            tong,
            ket_qua,
            du_doan_phien_tiep_theo: du_doan,
            thong_ke: {
                win_dung: table.win_correct,
                lose: table.lose,
                tong_du_doan: table.total_predict,
                win_rate: table.total_predict
                    ? ((table.win_correct / table.total_predict) * 100).toFixed(2) + "%"
                    : "0%"
            }
        };
    }
}

/* ================= SERVER ================= */

const app = express();
app.use(cors());

const son789 = new Son789("wss://api.jiusyss.me/websocket");
son789.connect();

app.get("/", (_, res) => res.send("SON789 API RUNNING"));

app.get("/api/tx", (_, res) => {
    res.json(son789.buildResult(son789.tables.tx));
});

app.get("/api/md5", (_, res) => {
    res.json(son789.buildResult(son789.tables.md5));
});

app.get("/api/all", (_, res) => {
    res.json({
        tai_xiu: son789.buildResult(son789.tables.tx),
        md5: son789.buildResult(son789.tables.md5)
    });
});

/* 🔥 LỊCH SỬ DỰ ĐOÁN */
app.get("/lichsududoan", (_, res) => {
    res.json({
        id: API_ID,
        tx: son789.tables.tx.history,
        md5: son789.tables.md5.history
    });
});

app.get("/api/status", (_, res) => {
    res.json({
        ws_connected: son789.ws?.readyState === 1,
        tx_sessions: son789.tables.tx.htr.length,
        md5_sessions: son789.tables.md5.htr.length
    });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 API running http://IP:${PORT}`);
});
