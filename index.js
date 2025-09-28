// HUYDAIXU.SITE
const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

const API_URL = 'https://his50-68gamebai.onrender.com/history';

let lastPhien = 0;
let cachedResult = null;

let modelPredictions = {}; 

// ====== Dán toàn bộ khối thuật toán AI vào đây ======
// (bắt đầu từ `detectStreakAndBreak(...)` cho đến `generatePrediction(...)`)
//
// 👇👇👇👇👇👇👇👇👇👇👇👇👇👇
// ✂️ DÁN Ở ĐÂY ✂️
// Helper function: Detect streak and break probability
function detectStreakAndBreak(history) {
  if (!history || history.length === 0) return { streak: 0, currentResult: null, breakProb: 0.0 };
  let streak = 1;
  const currentResult = history[history.length - 1].result;
  for (let i = history.length - 2; i >= 0; i--) {
    if (history[i].result === currentResult) {
      streak++;
    } else {
      break;
    }
  }
  const last15 = history.slice(-15).map(h => h.result);
  if (!last15.length) return { streak, currentResult, breakProb: 0.0 };
  const switches = last15.slice(1).reduce((count, curr, idx) => count + (curr !== last15[idx] ? 1 : 0), 0);
  const taiCount = last15.filter(r => r === 'Tài').length;
  const xiuCount = last15.filter(r => r === 'Xỉu').length;
  const imbalance = Math.abs(taiCount - xiuCount) / last15.length;
  let breakProb = 0.0;

  if (streak >= 8) {
    breakProb = Math.min(0.6 + (switches / 15) + imbalance * 0.15, 0.9); // Giảm breakProb
  } else if (streak >= 5) {
    breakProb = Math.min(0.35 + (switches / 10) + imbalance * 0.25, 0.85); // Giảm breakProb
  } else if (streak >= 3 && switches >= 7) { // Tăng ngưỡng switches
    breakProb = 0.3;
  }

  return { streak, currentResult, breakProb };
}

// Helper function: Evaluate model performance
function evaluateModelPerformance(history, modelName, lookback = 10) {
  if (!modelPredictions[modelName] || history.length < 2) return 1.0;
  lookback = Math.min(lookback, history.length - 1);
  let correctCount = 0;
  for (let i = 0; i < lookback; i++) {
    const pred = modelPredictions[modelName][history[history.length - (i + 2)].session] || 0;
    const actual = history[history.length - (i + 1)].result;
    if ((pred === 1 && actual === 'Tài') || (pred === 2 && actual === 'Xỉu')) {
      correctCount++;
    }
  }
  const performanceScore = lookback > 0 ? 1.0 + (correctCount - lookback / 2) / (lookback / 2) : 1.0;
  return Math.max(0.5, Math.min(1.5, performanceScore)); // Giới hạn score để tránh lệch
}

// Helper function: Smart bridge break model
function smartBridgeBreak(history) {
  if (!history || history.length < 3) return { prediction: 0, breakProb: 0.0, reason: 'Không đủ dữ liệu để bẻ cầu' };

  const { streak, currentResult, breakProb } = detectStreakAndBreak(history);
  const last20 = history.slice(-20).map(h => h.result);
  const lastScores = history.slice(-20).map(h => h.totalScore || 0);
  let breakProbability = breakProb;
  let reason = '';

  // Analyze score trends
  const avgScore = lastScores.reduce((sum, score) => sum + score, 0) / (lastScores.length || 1);
  const scoreDeviation = lastScores.reduce((sum, score) => sum + Math.abs(score - avgScore), 0) / (lastScores.length || 1);

  // Detect specific bridge patterns
  const last5 = last20.slice(-5);
  const patternCounts = {};
  for (let i = 0; i <= last20.length - 3; i++) {
    const pattern = last20.slice(i, i + 3).join(',');
    patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
  }
  const mostCommonPattern = Object.entries(patternCounts).sort((a, b) => b[1] - a[1])[0];
  const isStablePattern = mostCommonPattern && mostCommonPattern[1] >= 3;

  // Adjust break probability based on streak length and patterns
  if (streak >= 6) {
    breakProbability = Math.min(breakProbability + 0.15, 0.9); // Giảm ảnh hưởng
    reason = `[Bẻ Cầu] Chuỗi ${streak} ${currentResult} dài, khả năng bẻ cầu cao`;
  } else if (streak >= 4 && scoreDeviation > 3) {
    breakProbability = Math.min(breakProbability + 0.1, 0.85); // Giảm ảnh hưởng
    reason = `[Bẻ Cầu] Biến động điểm số lớn (${scoreDeviation.toFixed(1)}), khả năng bẻ cầu tăng`;
  } else if (isStablePattern && last5.every(r => r === currentResult)) {
    breakProbability = Math.min(breakProbability + 0.05, 0.8); // Giảm ảnh hưởng
    reason = `[Bẻ Cầu] Phát hiện mẫu lặp ${mostCommonPattern[0]}, có khả năng bẻ cầu`;
  } else {
    breakProbability = Math.max(breakProbability - 0.15, 0.15); // Giảm xác suất bẻ cầu
    reason = `[Bẻ Cầu] Không phát hiện mẫu bẻ cầu mạnh, tiếp tục theo cầu`;
  }

  // Decide prediction based on break probability
  let prediction = breakProbability > 0.65 ? (currentResult === 'Tài' ? 2 : 1) : (currentResult === 'Tài' ? 1 : 2); // Tăng ngưỡng breakProb
  return { prediction, breakProb: breakProbability, reason };
}

// Helper function: Trend and probability model
function trendAndProb(history) {
  if (!history || history.length < 3) return 0;
  const { streak, currentResult, breakProb } = detectStreakAndBreak(history);
  if (streak >= 5) {
    if (breakProb > 0.75) { // Tăng ngưỡng breakProb
      return currentResult === 'Tài' ? 2 : 1; // 2: Xỉu, 1: Tài
    }
    return currentResult === 'Tài' ? 1 : 2;
  }
  const last15 = history.slice(-15).map(h => h.result);
  if (!last15.length) return 0;
  const weights = last15.map((_, i) => Math.pow(1.2, i)); // Giảm trọng số lịch sử gần
  const taiWeighted = weights.reduce((sum, w, i) => sum + (last15[i] === 'Tài' ? w : 0), 0);
  const xiuWeighted = weights.reduce((sum, w, i) => sum + (last15[i] === 'Xỉu' ? w : 0), 0);
  const totalWeight = taiWeighted + xiuWeighted;
  const last10 = last15.slice(-10);
  const patterns = [];
  if (last10.length >= 4) {
    for (let i = 0; i <= last10.length - 4; i++) {
      patterns.push(last10.slice(i, i + 4).join(','));
    }
  }
  const patternCounts = patterns.reduce((acc, p) => { acc[p] = (acc[p] || 0) + 1; return acc; }, {});
  const mostCommon = Object.entries(patternCounts).sort((a, b) => b[1] - a[1])[0];
  if (mostCommon && mostCommon[1] >= 3) {
    const pattern = mostCommon[0].split(',');
    return pattern[pattern.length - 1] !== last10[last10.length - 1] ? 1 : 2;
  } else if (totalWeight > 0 && Math.abs(taiWeighted - xiuWeighted) / totalWeight >= 0.25) { // Tăng ngưỡng
    return taiWeighted > xiuWeighted ? 2 : 1; // Dự đoán ngược lại để cân bằng
  }
  return last15[last15.length - 1] === 'Xỉu' ? 1 : 2;
}

// Helper function: Short pattern model
function shortPattern(history) {
  if (!history || history.length < 3) return 0;
  const { streak, currentResult, breakProb } = detectStreakAndBreak(history);
  if (streak >= 4) {
    if (breakProb > 0.75) { // Tăng ngưỡng
      return currentResult === 'Tài' ? 2 : 1;
    }
    return currentResult === 'Tài' ? 1 : 2;
  }
  const last8 = history.slice(-8).map(h => h.result);
  if (!last8.length) return 0;
  const patterns = [];
  if (last8.length >= 3) {
    for (let i = 0; i <= last8.length - 3; i++) {
      patterns.push(last8.slice(i, i + 3).join(','));
    }
  }
  const patternCounts = patterns.reduce((acc, p) => { acc[p] = (acc[p] || 0) + 1; return acc; }, {});
  const mostCommon = Object.entries(patternCounts).sort((a, b) => b[1] - a[1])[0];
  if (mostCommon && mostCommon[1] >= 2) {
    const pattern = mostCommon[0].split(',');
    return pattern[pattern.length - 1] !== last8[last8.length - 1] ? 1 : 2;
  }
  return last8[last8.length - 1] === 'Xỉu' ? 1 : 2;
}

// Helper function: Mean deviation model
function meanDeviation(history) {
  if (!history || history.length < 3) return 0;
  const { streak, currentResult, breakProb } = detectStreakAndBreak(history);
  if (streak >= 4) {
    if (breakProb > 0.75) { // Tăng ngưỡng
      return currentResult === 'Tài' ? 2 : 1;
    }
    return currentResult === 'Tài' ? 1 : 2;
  }
  const last12 = history.slice(-12).map(h => h.result);
  if (!last12.length) return 0;
  const taiCount = last12.filter(r => r === 'Tài').length;
  const xiuCount = last12.length - taiCount;
  const deviation = Math.abs(taiCount - xiuCount) / last12.length;
  if (deviation < 0.35) { // Tăng ngưỡng
    return last12[last12.length - 1] === 'Xỉu' ? 1 : 2;
  }
  return xiuCount > taiCount ? 1 : 2;
}

// Helper function: Recent switch model
function recentSwitch(history) {
  if (!history || history.length < 3) return 0;
  const { streak, currentResult, breakProb } = detectStreakAndBreak(history);
  if (streak >= 4) {
    if (breakProb > 0.75) { // Tăng ngưỡng
      return currentResult === 'Tài' ? 2 : 1;
    }
    return currentResult === 'Tài' ? 1 : 2;
  }
  const last10 = history.slice(-10).map(h => h.result);
  if (!last10.length) return 0;
  const switches = last10.slice(1).reduce((count, curr, idx) => count + (curr !== last10[idx] ? 1 : 0), 0);
  return switches >= 6 ? (last10[last10.length - 1] === 'Xỉu' ? 1 : 2) : (last10[last10.length - 1] === 'Xỉu' ? 1 : 2); // Tăng ngưỡng switches
}

// Helper function: Check bad pattern
function isBadPattern(history) {
  if (!history || history.length < 3) return false;
  const last15 = history.slice(-15).map(h => h.result);
  if (!last15.length) return false;
  const switches = last15.slice(1).reduce((count, curr, idx) => count + (curr !== last15[idx] ? 1 : 0), 0);
  const { streak } = detectStreakAndBreak(history);
  return switches >= 9 || streak >= 10; // Tăng ngưỡng
}

// AI HTDD Logic
function aiHtddLogic(history) {
  if (!history || history.length < 3) {
    const randomResult = Math.random() < 0.5 ? 'Tài' : 'Xỉu';
    return { prediction: randomResult, reason: '[AI] Không đủ lịch sử, dự đoán ngẫu nhiên', source: 'AI HTDD' };
  }
  const recentHistory = history.slice(-5).map(h => h.result);
  const recentScores = history.slice(-5).map(h => h.totalScore || 0);
  const taiCount = recentHistory.filter(r => r === 'Tài').length;
  const xiuCount = recentHistory.filter(r => r === 'Xỉu').length;

  if (history.length >= 3) {
    const last3 = history.slice(-3).map(h => h.result);
    if (last3.join(',') === 'Tài,Xỉu,Tài') {
      return { prediction: 'Xỉu', reason: '[AI] Phát hiện mẫu 1T1X → tiếp theo nên đánh Xỉu', source: 'AI HTDD' };
    } else if (last3.join(',') === 'Xỉu,Tài,Xỉu') {
      return { prediction: 'Tài', reason: '[AI] Phát hiện mẫu 1X1T → tiếp theo nên đánh Tài', source: 'AI HTDD' };
    }
  }

  if (history.length >= 4) {
    const last4 = history.slice(-4).map(h => h.result);
    if (last4.join(',') === 'Tài,Tài,Xỉu,Xỉu') {
      return { prediction: 'Tài', reason: '[AI] Phát hiện mẫu 2T2X → tiếp theo nên đánh Tài', source: 'AI HTDD' };
    } else if (last4.join(',') === 'Xỉu,Xỉu,Tài,Tài') {
      return { prediction: 'Xỉu', reason: '[AI] Phát hiện mẫu 2X2T → tiếp theo nên đánh Xỉu', source: 'AI HTDD' };
    }
  }

  if (history.length >= 9 && history.slice(-6).every(h => h.result === 'Tài')) {
    return { prediction: 'Xỉu', reason: '[AI] Chuỗi Tài quá dài (6 lần) → dự đoán Xỉu', source: 'AI HTDD' }; // Giảm ngưỡng streak
  } else if (history.length >= 9 && history.slice(-6).every(h => h.result === 'Xỉu')) {
    return { prediction: 'Tài', reason: '[AI] Chuỗi Xỉu quá dài (6 lần) → dự đoán Tài', source: 'AI HTDD' }; // Giảm ngưỡng streak
  }

  const avgScore = recentScores.reduce((sum, score) => sum + score, 0) / (recentScores.length || 1);
  if (avgScore > 10) {
    return { prediction: 'Tài', reason: `[AI] Điểm trung bình cao (${avgScore.toFixed(1)}) → dự đoán Tài`, source: 'AI HTDD' };
  } else if (avgScore < 8) {
    return { prediction: 'Xỉu', reason: `[AI] Điểm trung bình thấp (${avgScore.toFixed(1)}) → dự đoán Xỉu`, source: 'AI HTDD' };
  }

  // Sửa lỗi logic và cân bằng
  if (taiCount > xiuCount + 1) {
    return { prediction: 'Xỉu', reason: `[AI] Tài chiếm đa số (${taiCount}/${recentHistory.length}) → dự đoán Xỉu`, source: 'AI HTDD' };
  } else if (xiuCount > taiCount + 1) {
    return { prediction: 'Tài', reason: `[AI] Xỉu chiếm đa số (${xiuCount}/${recentHistory.length}) → dự đoán Tài`, source: 'AI HTDD' };
  } else {
    const overallTai = history.filter(h => h.result === 'Tài').length;
    const overallXiu = history.filter(h => h.result === 'Xỉu').length;
    if (overallTai > overallXiu + 2) { // Thêm ngưỡng để cân bằng
      return { prediction: 'Xỉu', reason: '[AI] Tổng thể Tài nhiều hơn → dự đoán Xỉu', source: 'AI HTDD' };
    } else if (overallXiu > overallTai + 2) {
      return { prediction: 'Tài', reason: '[AI] Tổng thể Xỉu nhiều hơn → dự đoán Tài', source: 'AI HTDD' };
    } else {
      return { prediction: Math.random() < 0.5 ? 'Tài' : 'Xỉu', reason: '[AI] Cân bằng, dự đoán ngẫu nhiên', source: 'AI HTDD' };
    }
  }
}

// Main prediction function
function generatePrediction(history, modelPredictionsRef) {
  modelPredictions = modelPredictionsRef;
  if (!history || history.length === 0) {
    console.log('No history available, generating random prediction');
    const randomResult = Math.random() < 0.5 ? 'Tài' : 'Xỉu';
    console.log('Random Prediction:', randomResult);
    return randomResult;
  }

  if (!modelPredictions['trend']) {
    modelPredictions['trend'] = {};
    modelPredictions['short'] = {};
    modelPredictions['mean'] = {};
    modelPredictions['switch'] = {};
    modelPredictions['bridge'] = {};
  }

  const currentIndex = history[history.length - 1].session;

  // Run models
  const trendPred = history.length < 5 ? (history[history.length - 1].result === 'Tài' ? 2 : 1) : trendAndProb(history);
  const shortPred = history.length < 5 ? (history[history.length - 1].result === 'Tài' ? 2 : 1) : shortPattern(history);
  const meanPred = history.length < 5 ? (history[history.length - 1].result === 'Tài' ? 2 : 1) : meanDeviation(history);
  const switchPred = history.length < 5 ? (history[history.length - 1].result === 'Tài' ? 2 : 1) : recentSwitch(history);
  const bridgePred = history.length < 5 ? { prediction: (history[history.length - 1].result === 'Tài' ? 2 : 1), breakProb: 0.0, reason: 'Lịch sử ngắn, dự đoán ngược lại' } : smartBridgeBreak(history);
  const aiPred = aiHtddLogic(history);

  // Store predictions
  modelPredictions['trend'][currentIndex] = trendPred;
  modelPredictions['short'][currentIndex] = shortPred;
  modelPredictions['mean'][currentIndex] = meanPred;
  modelPredictions['switch'][currentIndex] = switchPred;
  modelPredictions['bridge'][currentIndex] = bridgePred.prediction;

  // Evaluate model performance
  const modelScores = {
    trend: evaluateModelPerformance(history, 'trend'),
    short: evaluateModelPerformance(history, 'short'),
    mean: evaluateModelPerformance(history, 'mean'),
    switch: evaluateModelPerformance(history, 'switch'),
    bridge: evaluateModelPerformance(history, 'bridge')
  };

  // Điều chỉnh trọng số
  const weights = {
    trend: 0.2 * modelScores.trend, // Giảm từ 0.25
    short: 0.2 * modelScores.short,
    mean: 0.25 * modelScores.mean, // Tăng từ 0.2
    switch: 0.2 * modelScores.switch, // Tăng từ 0.15
    bridge: 0.15 * modelScores.bridge, // Giảm từ 0.2
    aihtdd: 0.2
  };

  let taiScore = 0;
  let xiuScore = 0;

  if (trendPred === 1) taiScore += weights.trend; else if (trendPred === 2) xiuScore += weights.trend;
  if (shortPred === 1) taiScore += weights.short; else if (shortPred === 2) xiuScore += weights.short;
  if (meanPred === 1) taiScore += weights.mean; else if (meanPred === 2) xiuScore += weights.mean;
  if (switchPred === 1) taiScore += weights.switch; else if (switchPred === 2) xiuScore += weights.switch;
  if (bridgePred.prediction === 1) taiScore += weights.bridge; else if (bridgePred.prediction === 2) xiuScore += weights.bridge;
  if (aiPred.prediction === 'Tài') taiScore += weights.aihtdd; else xiuScore += weights.aihtdd;

  // Điều chỉnh khi phát hiện mẫu xấu
  if (isBadPattern(history)) {
    console.log('Bad pattern detected, reducing confidence');
    taiScore *= 0.8; // Giảm nhẹ hơn (từ 0.7)
    xiuScore *= 0.8;
  }

  // Cân bằng nếu dự đoán nghiêng quá nhiều
  const last10Preds = history.slice(-10).map(h => h.result);
  const taiPredCount = last10Preds.filter(r => r === 'Tài').length;
  if (taiPredCount >= 7) {
    xiuScore += 0.15; // Tăng xác suất Xỉu
    console.log('Adjusting for too many Tài predictions');
  } else if (taiPredCount <= 3) {
    taiScore += 0.15; // Tăng xác suất Tài
    console.log('Adjusting for too many Xỉu predictions');
  }

  // Điều chỉnh dựa trên xác suất bẻ cầu
  if (bridgePred.breakProb > 0.65) { // Tăng ngưỡng
    console.log('High bridge break probability:', bridgePred.breakProb, bridgePred.reason);
    if (bridgePred.prediction === 1) taiScore += 0.2; else xiuScore += 0.2; // Giảm ảnh hưởng
  }

  const finalPrediction = taiScore > xiuScore ? 'Tài' : 'Xỉu'; // Sửa lỗi finalPrediction
  console.log('Prediction:', { prediction: finalPrediction, reason: `${aiPred.reason} | ${bridgePred.reason}`, scores: { taiScore, xiuScore } });
  return finalPrediction;
}

// Route kiểm tra server sống
app.get('/', (req, res) => {
  res.send('server alive');
});

// Route /api/hitpro
app.get('/api/hitpro', async (req, res) => {
  try {
    const response = await axios.get(API_URL);
    const data = response.data;

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(404).json({ error: 'Không có dữ liệu trả về từ API' });
    }

    const latest50 = data.slice(0, 50).reverse(); // Lấy 50 kết quả mới nhất (mới ở cuối)
    const pattern = latest50.map(item => item.Ket_qua === 'Tài' ? 'T' : 'X').join('');

    const latest = data[0];

    if (latest.Phien !== lastPhien) {
      lastPhien = latest.Phien;

      // ✳️ Tạo mảng lịch sử chuẩn cho AI
      const history = data
        .slice(0, 100) // Lấy tối đa 100 phiên gần nhất
        .reverse()     // Phiên cũ ở đầu
        .map(item => ({
          session: item.Phien,
          result: item.Ket_qua,
          totalScore: item.Tong
        }));

      // 🧠 Gọi AI để dự đoán
      const duDoan = generatePrediction(history, modelPredictions);

      cachedResult = {
        id: latest.id,
        Phien: latest.Phien,
        Ket_qua: latest.Ket_qua,
        Tong: latest.Tong,
        Xuc_xac_1: latest.Xuc_xac_1,
        Xuc_xac_2: latest.Xuc_xac_2,
        Xuc_xac_3: latest.Xuc_xac_3,
        Pattern: pattern,
        phien_tiep_theo: latest.Phien + 1,
        Du_doan: duDoan // ✅ Dự đoán từ AI
      };
    }

    if (cachedResult) {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(cachedResult));
    } else {
      res.status(503).json({ error: 'Chưa có dữ liệu mới' });
    }

  } catch (error) {
    res.status(500).json({ error: 'Lỗi khi gọi API', message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server đang chạy trên port ${PORT}`);
});
