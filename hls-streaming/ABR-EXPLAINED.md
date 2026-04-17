# 自适应码率 (ABR) 工作原理详解

## 什么是自适应码率？

**Adaptive Bitrate Streaming (ABR)** - 根据用户的网络速度自动选择合适的视频画质。

---

## 工作流程（完整版）

### 第 1 步：浏览器请求主播放列表

```javascript
// 用户点击播放
hls.loadSource('/hls/知否/master.m3u8');
```

**浏览器发送请求：**
```http
GET /hls/知否/master.m3u8 HTTP/1.1
```

**服务器返回：**
```m3u8
#EXTM3U
#EXT-X-VERSION:3

#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
360p.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720
720p.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
1080p.m3u8
```

**hls.js 解析：**
```javascript
{
  levels: [
    { width: 640,  height: 360,  bitrate: 800000 },   // 索引 0
    { width: 1280, height: 720,  bitrate: 2500000 },  // 索引 1
    { width: 1920, height: 1080, bitrate: 5000000 }   // 索引 2
  ]
}
```

---

### 第 2 步：初始码率选择

hls.js 会根据以下因素选择初始码率：

```javascript
// hls.js 内部逻辑（简化版）
function selectInitialLevel() {
    // 因素 1: 估算的网络速度
    const estimatedBandwidth = getEstimatedBandwidth(); // 例如: 3 Mbps

    // 因素 2: 屏幕分辨率
    const screenWidth = window.screen.width;  // 例如: 1920
    const screenHeight = window.screen.height; // 例如: 1080

    // 因素 3: 选择合适的码率
    // 规则：选择码率 <= 估算带宽的最高质量

    if (estimatedBandwidth >= 5000000 && screenWidth >= 1920) {
        return 2; // 1080p
    } else if (estimatedBandwidth >= 2500000) {
        return 1; // 720p
    } else {
        return 0; // 360p
    }
}
```

假设选择了 720p (索引 1)：

```http
GET /hls/知否/720p.m3u8 HTTP/1.1
```

**返回播放列表：**
```m3u8
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6

#EXTINF:6.0,
720p_000.ts
#EXTINF:6.0,
720p_001.ts
#EXTINF:6.0,
720p_002.ts
...
```

---

### 第 3 步：下载视频分片并测量速度

```javascript
// hls.js 下载第一个分片
const startTime = performance.now();
const response = await fetch('/hls/知否/720p_000.ts');
const blob = await response.blob();
const endTime = performance.now();

// 计算下载速度
const downloadTime = (endTime - startTime) / 1000; // 秒
const fileSize = blob.size; // 字节
const downloadSpeed = (fileSize * 8) / downloadTime; // bps

console.log(`下载速度: ${(downloadSpeed / 1000000).toFixed(2)} Mbps`);
```

**示例：**
```
分片大小: 2 MB (2,097,152 字节)
下载时间: 0.5 秒
下载速度: (2,097,152 * 8) / 0.5 = 33,554,432 bps ≈ 33.5 Mbps
```

---

### 第 4 步：持续监控和调整

hls.js 会在每次下载分片后重新评估：

```javascript
// hls.js 内部逻辑（简化版）
class ABRController {
    constructor() {
        this.bandwidthHistory = []; // 带宽历史记录
        this.currentLevel = 1;      // 当前码率索引
    }

    // 每下载完一个分片，就调用这个函数
    onFragmentLoaded(fragment, downloadStats) {
        // 1. 计算下载速度
        const bandwidth = this.calculateBandwidth(downloadStats);

        // 2. 记录到历史
        this.bandwidthHistory.push(bandwidth);

        // 3. 计算平均带宽（使用最近 5 个分片）
        const avgBandwidth = this.getAverageBandwidth(5);

        // 4. 决定是否需要切换码率
        const newLevel = this.selectLevel(avgBandwidth);

        // 5. 如果需要切换，立即切换
        if (newLevel !== this.currentLevel) {
            this.switchLevel(newLevel);
        }
    }

    calculateBandwidth(stats) {
        const bytes = stats.total;
        const duration = stats.loading.end - stats.loading.start;
        return (bytes * 8 * 1000) / duration; // bps
    }

    getAverageBandwidth(count) {
        const recent = this.bandwidthHistory.slice(-count);
        const sum = recent.reduce((a, b) => a + b, 0);
        return sum / recent.length;
    }

    selectLevel(bandwidth) {
        const levels = hls.levels;

        // 策略：选择 <= 70% 带宽的最高码率
        // 留 30% 余量，防止缓冲
        const safeBandwidth = bandwidth * 0.7;

        for (let i = levels.length - 1; i >= 0; i--) {
            if (levels[i].bitrate <= safeBandwidth) {
                return i;
            }
        }

        return 0; // 最低码率
    }

    switchLevel(newLevel) {
        console.log(`切换码率: ${this.currentLevel} → ${newLevel}`);
        hls.currentLevel = newLevel;
        this.currentLevel = newLevel;
    }
}
```

---

## 实际场景演示

### 场景 1: 网速下降

```
时间线:
0s ───> 6s ───> 12s ───> 18s ───> 24s

下载情况:
720p_000.ts   720p_001.ts   720p_002.ts   360p_003.ts
    ↓             ↓             ↓             ↓
  1秒下完      1秒下完       3秒下完！      1秒下完
   (快)         (快)          (慢)          (快)

测量带宽:
 16 Mbps      16 Mbps       5 Mbps        8 Mbps

平均带宽:
    -         16 Mbps    13.5 Mbps      11 Mbps

决策:
保持720p     保持720p      切换到360p    保持360p
            (16 > 2.5)    (5 < 2.5)    (8 < 2.5 但不切回)
```

**详细说明：**

**第 1 个分片** (720p_000.ts):
```javascript
下载: 2 MB / 1 秒 = 16 Mbps
决策: 16 Mbps > 2.5 Mbps (720p 需要的带宽)
      → 保持 720p
```

**第 2 个分片** (720p_001.ts):
```javascript
下载: 2 MB / 1 秒 = 16 Mbps
平均: (16 + 16) / 2 = 16 Mbps
决策: 16 Mbps > 2.5 Mbps
      → 保持 720p
```

**第 3 个分片** (720p_002.ts):
```javascript
下载: 2 MB / 3 秒 = 5.3 Mbps  ← 网速突然下降！
平均: (16 + 16 + 5.3) / 3 = 12.4 Mbps
决策: 虽然平均还行，但最新速度 5.3 Mbps 已接近 720p (2.5 Mbps)
      考虑安全余量 (70%)，5.3 * 0.7 = 3.7 Mbps
      3.7 Mbps > 2.5 Mbps (720p) 但接近极限
      → 切换到 360p (0.8 Mbps) 更安全
```

**第 4 个分片** (360p_003.ts):
```javascript
下载: 0.5 MB / 1 秒 = 4 Mbps
平均: (16 + 5.3 + 4) / 3 = 8.4 Mbps
决策: 8.4 Mbps 理论上可以播 720p
      但刚才下降过，保守起见，暂时保持 360p
      → 再观察几个分片
```

---

### 场景 2: 网速上升

```
时间线:
0s ───> 6s ───> 12s ───> 18s ───> 24s

下载情况:
360p_000.ts   360p_001.ts   360p_002.ts   720p_003.ts
    ↓             ↓             ↓             ↓
 0.2秒下完     0.2秒下完     0.2秒下完     0.8秒下完
   (超快)        (超快)        (超快)        (快)

测量带宽:
 20 Mbps       20 Mbps       20 Mbps       20 Mbps

平均带宽:
    -         20 Mbps       20 Mbps       20 Mbps

决策:
保持360p     切换到720p    (等待)        保持720p
          (20 > 2.5)                    (稳定)
```

**为什么不立即切到 1080p？**

```javascript
// hls.js 的保守策略
function shouldUpgrade(currentLevel, targetLevel, bandwidth) {
    const targetBitrate = levels[targetLevel].bitrate;

    // 向上切换需要更高的确定性
    // 要求带宽 >= 1.5 倍目标码率
    if (bandwidth >= targetBitrate * 1.5) {
        // 并且需要连续 3 个分片都满足条件
        if (consecutiveGoodSegments >= 3) {
            return true;
        }
    }

    return false;
}

// 向下切换则很快（避免卡顿）
function shouldDowngrade(currentLevel, bandwidth) {
    const currentBitrate = levels[currentLevel].bitrate;

    // 只要带宽 < 当前码率，立即降级
    if (bandwidth * 0.7 < currentBitrate) {
        return true;
    }

    return false;
}
```

---

## hls.js 的 ABR 算法

### 核心参数

```javascript
const config = {
    // ABR 相关配置
    abrEwmaDefaultEstimate: 500000,      // 初始估算带宽: 500 kbps
    abrEwmaFastLive: 3.0,                // 快速响应系数
    abrEwmaSlowLive: 9.0,                // 慢速平滑系数
    abrEwmaFastVoD: 3.0,                 // 点播快速系数
    abrEwmaSlowVoD: 9.0,                 // 点播慢速系数
    abrBandWidthFactor: 0.95,            // 带宽安全系数 (95%)
    abrBandWidthUpFactor: 0.7,           // 向上切换阈值 (70%)
    abrMaxWithRealBitrate: true,         // 使用真实码率
};
```

### EWMA 算法（指数加权移动平均）

```javascript
class EwmaBandWidthEstimator {
    constructor(slow, fast, defaultEstimate) {
        this.slow = slow;           // 慢速系数 (9.0)
        this.fast = fast;           // 快速系数 (3.0)
        this.estimate = defaultEstimate; // 当前估算值
        this.fastEstimate = 0;
        this.slowEstimate = 0;
    }

    sample(bandwidth) {
        // 快速估算（响应快，用于检测下降）
        this.fastEstimate = this.ewma(
            this.fastEstimate,
            bandwidth,
            this.fast
        );

        // 慢速估算（平滑，用于检测上升）
        this.slowEstimate = this.ewma(
            this.slowEstimate,
            bandwidth,
            this.slow
        );

        // 取两者最小值（保守策略）
        this.estimate = Math.min(this.fastEstimate, this.slowEstimate);

        return this.estimate;
    }

    ewma(old, newValue, alpha) {
        if (old === 0) return newValue;
        return old * (alpha / (alpha + 1)) + newValue * (1 / (alpha + 1));
    }
}
```

**示例计算：**

```javascript
const estimator = new EwmaBandWidthEstimator(9, 3, 500000);

// 第 1 个分片: 10 Mbps
estimator.sample(10000000);
// fast: 0 * 0.75 + 10M * 0.25 = 2.5 Mbps
// slow: 0 * 0.9  + 10M * 0.1  = 1.0 Mbps
// 估算: min(2.5, 1.0) = 1.0 Mbps  ← 保守

// 第 2 个分片: 10 Mbps
estimator.sample(10000000);
// fast: 2.5M * 0.75 + 10M * 0.25 = 4.375 Mbps
// slow: 1.0M * 0.9  + 10M * 0.1  = 1.9 Mbps
// 估算: min(4.375, 1.9) = 1.9 Mbps  ← 逐渐上升

// 第 3 个分片: 10 Mbps
estimator.sample(10000000);
// 估算: ~3.5 Mbps

// 第 4 个分片: 10 Mbps
estimator.sample(10000000);
// 估算: ~5.2 Mbps

// 需要 5-6 个分片才能接近真实速度
// 这就是为什么切换不会太激进
```

---

## 缓冲区管理

hls.js 还会考虑缓冲区状态：

```javascript
class BufferController {
    getBufferLevel() {
        const buffered = video.buffered;
        if (buffered.length === 0) return 0;

        const currentTime = video.currentTime;
        const bufferedEnd = buffered.end(buffered.length - 1);

        // 缓冲区剩余秒数
        return bufferedEnd - currentTime;
    }

    shouldSwitch(newLevel) {
        const bufferLevel = this.getBufferLevel();

        // 如果缓冲区 < 5 秒，立即降级
        if (newLevel < currentLevel && bufferLevel < 5) {
            return true;
        }

        // 如果缓冲区 > 20 秒，可以尝试升级
        if (newLevel > currentLevel && bufferLevel > 20) {
            return true;
        }

        return false;
    }
}
```

---

## 实际监控

你可以在浏览器中监控这个过程：

```javascript
// 在 hls-streaming/public/index.html 中添加

hls.on(Hls.Events.LEVEL_SWITCHING, (event, data) => {
    console.log(`准备切换: → Level ${data.level}`);
});

hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
    const level = hls.levels[data.level];
    console.log(`已切换到: ${level.height}p (${(level.bitrate / 1000000).toFixed(2)} Mbps)`);
});

hls.on(Hls.Events.FRAG_LOADED, (event, data) => {
    const stats = data.frag.stats;
    const bandwidth = (stats.total / stats.loading.end * 8 / 1000000).toFixed(2);
    console.log(`分片下载完成: ${data.frag.sn}, 速度: ${bandwidth} Mbps`);
    console.log(`缓冲区: ${video.buffered.end(0) - video.currentTime} 秒`);
});

// 实时显示估算带宽
setInterval(() => {
    if (hls.bandwidthEstimate) {
        console.log(`估算带宽: ${(hls.bandwidthEstimate / 1000000).toFixed(2)} Mbps`);
    }
}, 2000);
```

---

## 总结

### 自适应码率的关键要素

1. **测量下载速度**
   - 每个分片下载后计算速度
   - 使用 EWMA 算法平滑波动

2. **选择合适码率**
   - 带宽 * 0.7 ≥ 目标码率（安全余量）
   - 向下快，向上慢（避免频繁切换）

3. **考虑缓冲区**
   - 缓冲区低 → 快速降级
   - 缓冲区高 → 可以尝试升级

4. **平滑切换**
   - 在分片边界切换（无缝）
   - 不会中断播放

### 为什么这么设计？

**向下快，向上慢：**
- 网速下降 → 立即降级 → 避免卡顿
- 网速上升 → 观察几秒 → 避免频繁切换（影响体验）

**70% 安全系数：**
- 实际下载速度会波动
- 留 30% 余量确保流畅

**EWMA 算法：**
- 既能快速响应突然变化
- 又能过滤短期波动

这就是为什么你在 YouTube 或 Netflix 看视频时，画质能自动调整却不会频繁切换的原因！
