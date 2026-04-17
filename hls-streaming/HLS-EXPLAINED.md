# HLS 流媒体详解

## 什么是 HLS？

**HLS (HTTP Live Streaming)** 是 Apple 开发的流媒体协议，也是 YouTube、Netflix、Twitch 等主流视频平台使用的核心技术之一。

### 核心概念

```
原始视频 (sample.mp4, 1080p, 10MB)
         ↓
    FFmpeg 转码
         ↓
┌────────────────────────────────────┐
│  HLS 输出 (sample/)                │
├────────────────────────────────────┤
│  master.m3u8  ← 主播放列表          │
│                                    │
│  360p.m3u8    ← 360p 播放列表      │
│  ├─ 360p_000.ts  (0-6秒)          │
│  ├─ 360p_001.ts  (6-12秒)         │
│  └─ 360p_002.ts  (12-18秒)        │
│                                    │
│  720p.m3u8    ← 720p 播放列表      │
│  ├─ 720p_000.ts                   │
│  ├─ 720p_001.ts                   │
│  └─ 720p_002.ts                   │
│                                    │
│  1080p.m3u8   ← 1080p 播放列表     │
│  ├─ 1080p_000.ts                  │
│  ├─ 1080p_001.ts                  │
│  └─ 1080p_002.ts                  │
└────────────────────────────────────┘
```

---

## HLS 工作流程

### 1. 视频准备阶段

#### 原始视频
```
sample.mp4
- 分辨率: 1920x1080
- 编码: H.264
- 大小: 100MB
- 时长: 60 秒
```

#### FFmpeg 转码
```bash
# 360p 低画质
ffmpeg -i sample.mp4 \
  -vf scale=640:360 \
  -c:v libx264 -b:v 800k \
  -c:a aac -b:a 96k \
  -f hls -hls_time 6 \
  360p.m3u8

# 720p 中画质
ffmpeg -i sample.mp4 \
  -vf scale=1280:720 \
  -c:v libx264 -b:v 2500k \
  -c:a aac -b:a 128k \
  -f hls -hls_time 6 \
  720p.m3u8

# 1080p 高画质
ffmpeg -i sample.mp4 \
  -vf scale=1920:1080 \
  -c:v libx264 -b:v 5000k \
  -c:a aac -b:a 192k \
  -f hls -hls_time 6 \
  1080p.m3u8
```

**转码参数说明:**
- `-vf scale=640:360` - 调整分辨率
- `-b:v 800k` - 视频码率 (800 kbps)
- `-hls_time 6` - 每段 6 秒
- `-f hls` - 输出 HLS 格式

---

### 2. 播放列表文件 (.m3u8)

#### master.m3u8 (主播放列表)

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

**说明:**
- `BANDWIDTH` - 码率 (bps)
- `RESOLUTION` - 分辨率
- 浏览器根据网速选择合适的播放列表

#### 360p.m3u8 (单个码率播放列表)

```m3u8
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:0

#EXTINF:6.000000,
360p_000.ts
#EXTINF:6.000000,
360p_001.ts
#EXTINF:6.000000,
360p_002.ts
#EXTINF:6.000000,
360p_003.ts
#EXT-X-ENDLIST
```

**说明:**
- `#EXTINF:6.000000` - 这个分片时长 6 秒
- `360p_000.ts` - 视频分片文件
- `#EXT-X-ENDLIST` - 播放列表结束

---

### 3. 播放过程

#### 步骤 1: 浏览器请求主播放列表

```http
GET /hls/sample/master.m3u8 HTTP/1.1
```

**响应:**
```
#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
360p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720
720p.m3u8
...
```

#### 步骤 2: 浏览器选择码率

浏览器检测网速：
- 慢速网络 (< 1 Mbps) → 选择 360p
- 中速网络 (1-3 Mbps) → 选择 720p
- 快速网络 (> 3 Mbps) → 选择 1080p

假设选择 720p:

```http
GET /hls/sample/720p.m3u8 HTTP/1.1
```

#### 步骤 3: 下载视频分片

```http
GET /hls/sample/720p_000.ts HTTP/1.1
GET /hls/sample/720p_001.ts HTTP/1.1
GET /hls/sample/720p_002.ts HTTP/1.1
...
```

**关键点:**
- 浏览器持续下载分片
- 边下载边播放
- 如果网速变慢，自动切换到 360p
- 如果网速变快，自动切换到 1080p

---

## 自适应比特率 (ABR) 原理

### 场景演示

```
时间轴: 0s ──────────> 60s

网速:   [快]────[慢]────[快]────>
         3Mbps  1Mbps  3Mbps

画质:   [1080p]─[360p]─[1080p]─>
         ↓       ↓       ↓
下载:    ████    ██      ████
```

### 切换逻辑

```javascript
// 浏览器的内部逻辑 (简化版)
function selectQuality() {
    const downloadSpeed = measureDownloadSpeed(); // Mbps

    if (downloadSpeed < 1) {
        return '360p';  // 慢速网络
    } else if (downloadSpeed < 3) {
        return '720p';  // 中速网络
    } else {
        return '1080p'; // 快速网络
    }
}

// 每下载完一个分片，重新评估
onSegmentDownloaded(() => {
    const newQuality = selectQuality();
    if (newQuality !== currentQuality) {
        switchQuality(newQuality);
    }
});
```

---

## HLS vs 传统视频流 (Range Requests)

### 阶段 2: Range Requests

```
[=========== 完整视频文件 (100MB) ===========]
 ↑          ↑           ↑            ↑
 0%        25%         50%          100%

- 单个文件
- 使用 HTTP Range 请求不同位置
- 不能切换画质
```

### 阶段 3: HLS

```
360p: [2MB] [2MB] [2MB] [2MB] ... (10个分片)
720p: [5MB] [5MB] [5MB] [5MB] ... (10个分片)
1080p:[10MB][10MB][10MB][10MB] ... (10个分片)
        ↓     ↓     ↓     ↓
       根据网速动态选择

- 多个码率
- 每个码率有多个小文件
- 可以在播放中切换画质
```

---

## 对比表

| 特性 | 阶段 2 (Range Requests) | 阶段 3 (HLS) |
|------|------------------------|--------------|
| **文件结构** | 单个 MP4 文件 | 多个 .ts 分片 + .m3u8 播放列表 |
| **画质切换** | ❌ 不支持 | ✅ 自动切换 360p/720p/1080p |
| **网络适应** | ❌ 固定码率 | ✅ 根据网速自动调整 |
| **启动速度** | 快 (只需请求一次) | 稍慢 (需要解析播放列表) |
| **带宽效率** | 一般 | 优秀 (慢速网络省流量) |
| **实现复杂度** | 简单 | 中等 |
| **CDN 友好** | 一般 | 优秀 (小文件易缓存) |
| **实时直播** | ❌ 不支持 | ✅ 支持 |

---

## 实际网络场景

### 场景 1: 用户在地铁上看视频

```
地铁启动 → 网速从 4G 降到 3G
         ↓
HLS 自动切换: 1080p → 720p
         ↓
用户无感知，继续流畅播放
```

### 场景 2: 用户在家 WiFi 看视频

```
WiFi 环境 → 快速网络
         ↓
HLS 选择: 1080p
         ↓
高清播放体验
```

### 场景 3: 用户拖动进度条

```
用户拖到 50%
         ↓
HLS 计算: 需要第 5 个分片
         ↓
直接下载: 720p_005.ts
         ↓
立即播放 (不需要下载前面的分片)
```

---

## 关键文件详解

### .ts 文件 (Transport Stream)

```
720p_000.ts
- 格式: MPEG-TS
- 时长: 6 秒
- 大小: ~2.5MB (根据码率)
- 编码: H.264 + AAC
- 可以独立播放
```

### .m3u8 文件 (播放列表)

```
文本文件，类似于：

#EXTM3U
#EXTINF:6.0,
segment_000.ts
#EXTINF:6.0,
segment_001.ts
```

---

## 浏览器支持

### Safari / iOS

原生支持 HLS ✅

```html
<video src="master.m3u8" controls></video>
<!-- 直接播放，不需要任何库 -->
```

### Chrome / Firefox / Edge

需要 hls.js 库 ✅

```html
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
<script>
const hls = new Hls();
hls.loadSource('master.m3u8');
hls.attachMedia(video);
</script>
```

---

## YouTube 的实现

YouTube 使用的是 **DASH (Dynamic Adaptive Streaming over HTTP)**，原理类似 HLS：

```
YouTube DASH:
- 使用 .mpd (MPEG-DASH) 而不是 .m3u8
- 使用 .webm 或 .mp4 分片
- 支持更多编码格式 (VP9, AV1)

HLS:
- 使用 .m3u8
- 使用 .ts 分片
- 主要支持 H.264

核心思想相同: 自适应比特率 + 视频分片
```

---

## 优化技巧

### 1. 调整分片大小

```bash
# 小分片 (2-4 秒) - 快速切换画质
-hls_time 2

# 大分片 (10 秒) - 减少请求数量
-hls_time 10

# 推荐: 6 秒 (平衡)
-hls_time 6
```

### 2. 添加更多码率

```javascript
const PROFILES = [
    { name: '240p', width: 426, height: 240, bitrate: '400k' },
    { name: '360p', width: 640, height: 360, bitrate: '800k' },
    { name: '480p', width: 854, height: 480, bitrate: '1400k' },
    { name: '720p', width: 1280, height: 720, bitrate: '2500k' },
    { name: '1080p', width: 1920, height: 1080, bitrate: '5000k' },
    { name: '1440p', width: 2560, height: 1440, bitrate: '9000k' }
];
```

### 3. CDN 部署

```
用户请求 → CDN (就近节点) → 快速返回 .ts 分片
                           ↓
                    减少延迟和带宽成本
```

---

## 常见问题

### Q1: 为什么要分片？

**答:**
- 边下载边播放
- 快速切换画质（不需要重新下载整个视频）
- CDN 友好（小文件容易缓存）

### Q2: 分片越小越好吗？

**答:** 不是
- 太小 (< 2秒): 请求过多，服务器压力大
- 太大 (> 10秒): 切换画质延迟高
- 推荐 4-6 秒

### Q3: HLS 延迟高吗？

**答:**
- 标准 HLS: 20-30 秒延迟（不适合实时互动）
- Low-Latency HLS: 2-5 秒延迟
- 实时互动用 WebRTC (< 1 秒延迟)

### Q4: HLS 文件很多，存储成本高？

**答:**
- 是的，比单文件多 2-3 倍
- 但可以只保留常用码率（如 360p, 720p）
- 冷门视频可以删除高码率版本

---

## 下一步学习

完成 HLS 后，你已经掌握了：

✅ 视频转码和分片
✅ 多码率自适应播放
✅ HLS 协议原理
✅ FFmpeg 使用

**进阶方向:**

1. **阶段 4: 实时直播**
   - RTMP 推流
   - WebRTC 低延迟直播
   - 弹幕系统

2. **阶段 5: 生产级优化**
   - 视频上传和自动转码
   - 转码队列 (Bull + Redis)
   - CDN 集成
   - DRM 加密

3. **替代技术**
   - DASH (YouTube 使用)
   - WebRTC (实时通信)
   - CMAF (通用格式)

---

## 总结

**HLS 的核心思想:**

1. **分片** - 将视频切成小段
2. **多码率** - 提供不同画质选项
3. **自适应** - 根据网速自动切换
4. **HTTP** - 使用标准 HTTP 协议

这就是 YouTube、Netflix 等视频网站能提供流畅观看体验的秘密！
