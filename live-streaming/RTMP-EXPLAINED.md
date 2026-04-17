# 📡 RTMP 协议详解

## 什么是 RTMP？

**RTMP (Real-Time Messaging Protocol)** 是由 Adobe 开发的一种专门用于**音视频实时传输**的网络协议。

### 核心特点

- 🎬 **实时性强**: 专为低延迟流媒体设计
- 📡 **推流协议**: 主要用于从客户端向服务器推送流
- 🔄 **双向通信**: 支持服务器和客户端双向数据传输
- 🎥 **直播首选**: YouTube、Twitch、Bilibili 等平台的推流标准

---

## RTMP vs HTTP 对比

| 特性 | RTMP | HTTP (HLS/DASH) |
|------|------|-----------------|
| **用途** | 推流 (上传) | 拉流 (下载/播放) |
| **延迟** | 低 (1-3秒) | 较高 (5-30秒) |
| **协议** | TCP | TCP/HTTP |
| **端口** | 1935 | 80/443 |
| **浏览器支持** | ❌ 需插件 | ✅ 原生支持 |
| **CDN 友好** | ⚠️ 一般 | ✅ 优秀 |
| **主要场景** | 直播推流 | 视频播放 |

---

## RTMP 工作原理

### 1. 推流工作流程

```
┌─────────────┐                    ┌──────────────┐
│  主播电脑    │                    │  RTMP 服务器  │
│             │                    │              │
│  摄像头+麦克  │  ① 采集音视频      │              │
│      ↓      │                    │              │
│  编码器      │  ② H.264 + AAC    │              │
│   (OBS)     │     编码           │              │
│      ↓      │                    │              │
│  RTMP 推流   │ ─────────────────→ │  接收流      │
│             │  ③ TCP 1935端口    │      ↓       │
└─────────────┘                    │  处理/转码    │
                                   │      ↓       │
                                   │  分发给观众   │
                                   └──────────────┘
```

### 2. 详细步骤

#### 第 1 步: 握手 (Handshake)
```
客户端 ──→ C0 + C1 ──→ 服务器
       ←── S0 + S1 ←──
       ──→    C2    ──→
       ←──    S2    ←──
```
建立 TCP 连接后，RTMP 需要完成三次握手来同步时间戳。

#### 第 2 步: 连接 (Connect)
```javascript
// OBS 发送连接命令
{
  "command": "connect",
  "app": "live",  // 应用名称
  "flashVer": "FMLE/3.0",
  "tcUrl": "rtmp://localhost:1935/live"
}
```

#### 第 3 步: 推流 (Publish)
```javascript
// 开始发布流
{
  "command": "publish",
  "streamName": "stream_key",  // 流密钥
  "type": "live"  // 直播模式
}
```

#### 第 4 步: 传输数据
```
┌──────────────────────────────────┐
│  RTMP Chunk (分块)                │
├──────────────────────────────────┤
│ 音频包 (AAC)  →  每 64ms 发送     │
│ 视频包 (H.264) →  每帧发送        │
│ 元数据包       →  定期发送        │
└──────────────────────────────────┘
```

---

## RTMP URL 格式

### 标准格式
```
rtmp://服务器地址:端口/应用名/流密钥
```

### 实际例子
```bash
# 本地测试
rtmp://localhost:1935/live/stream_key

# 生产环境
rtmp://live.example.com:1935/live/user123_stream

# YouTube 推流
rtmp://a.rtmp.youtube.com/live2/你的串流密钥

# Bilibili 推流
rtmp://live-push.bilivideo.com/live-bvc/你的串流密钥
```

### URL 组成部分

```
rtmp://localhost:1935/live/stream_key
│      │         │    │    │
│      │         │    │    └─ 流密钥 (Stream Key)
│      │         │    └────── 应用名 (App Name)
│      │         └─────────── 端口 (Port, 默认1935)
│      └───────────────────── 服务器地址 (Host)
└──────────────────────────── 协议 (Protocol)
```

---

## RTMP 数据格式

### 1. Chunk 分块结构

RTMP 将数据分割成小块 (Chunk) 传输：

```
┌────────────────────────────────────────┐
│ Chunk Header (块头)                     │
│  - Message Type (消息类型)              │
│  - Timestamp (时间戳)                   │
│  - Message Length (消息长度)            │
├────────────────────────────────────────┤
│ Chunk Data (块数据)                     │
│  - 音频/视频/元数据                      │
└────────────────────────────────────────┘
```

### 2. 消息类型

| Type ID | 消息类型 | 说明 |
|---------|---------|------|
| 8 | Audio | 音频数据 (AAC) |
| 9 | Video | 视频数据 (H.264) |
| 18 | Data | 元数据 (分辨率、码率等) |
| 20 | Command | 控制命令 (connect, publish) |

### 3. 视频包结构

```
┌──────────────────────────────────┐
│ Frame Type (帧类型)               │
│  - 1: Keyframe (关键帧)          │
│  - 2: Inter frame (中间帧)       │
├──────────────────────────────────┤
│ Codec ID (编码格式)               │
│  - 7: H.264/AVC                  │
│  - 12: H.265/HEVC                │
├──────────────────────────────────┤
│ Video Data (视频数据)             │
│  - H.264 NAL Units               │
└──────────────────────────────────┘
```

---

## 本项目中的 RTMP 实现

### 使用 node-media-server

```javascript
// server.js
const NodeMediaServer = require('node-media-server');

const config = {
  rtmp: {
    port: 1935,           // RTMP 端口
    chunk_size: 60000,    // 块大小
    gop_cache: true,      // 缓存 GOP (关键帧组)
    ping: 30,             // 心跳间隔
    ping_timeout: 60      // 心跳超时
  },
  trans: {
    ffmpeg: '/path/to/ffmpeg',
    tasks: [
      {
        app: 'live',
        hls: true,        // 转码为 HLS
        rec: true         // 录制
      }
    ]
  }
};

const nms = new NodeMediaServer(config);
nms.run();
```

### 事件监听

```javascript
// 推流开始
nms.on('prePublish', (id, StreamPath, args) => {
  console.log('推流开始:', StreamPath);
  // StreamPath: /live/stream_key
});

// 推流进行中
nms.on('postPublish', (id, StreamPath, args) => {
  console.log('正在推流:', StreamPath);
});

// 推流结束
nms.on('donePublish', (id, StreamPath, args) => {
  console.log('推流结束:', StreamPath);
});
```

---

## RTMP 推流工具

### 1. OBS Studio (最推荐)

**优点**:
- ✅ 免费开源
- ✅ 功能强大
- ✅ 跨平台 (Windows/macOS/Linux)
- ✅ 支持场景切换、滤镜、插件

**配置**:
```
设置 → 推流
├─ 服务: 自定义
├─ 服务器: rtmp://localhost:1935/live
└─ 串流密钥: stream_key
```

**推流参数**:
```
输出 → 串流
├─ 编码器: x264
├─ 码率控制: CBR
├─ 视频比特率: 2500 Kbps
├─ 关键帧间隔: 2秒
└─ 预设: veryfast
```

### 2. FFmpeg 命令行

**推流本地视频**:
```bash
ffmpeg -re -i input.mp4 \
  -c:v libx264 -preset veryfast -tune zerolatency \
  -c:a aac -b:a 128k \
  -f flv rtmp://localhost:1935/live/stream_key
```

**推流摄像头 (macOS)**:
```bash
ffmpeg -f avfoundation -i "0:0" \
  -c:v libx264 -preset ultrafast -tune zerolatency \
  -c:a aac -b:a 128k \
  -f flv rtmp://localhost:1935/live/stream_key
```

**推流摄像头 (Linux)**:
```bash
ffmpeg -f v4l2 -i /dev/video0 \
  -f alsa -i default \
  -c:v libx264 -preset ultrafast -tune zerolatency \
  -c:a aac -b:a 128k \
  -f flv rtmp://localhost:1935/live/stream_key
```

**参数说明**:
- `-re`: 按原始帧率读取 (实时模式)
- `-preset ultrafast`: 编码速度预设 (越快质量越低)
- `-tune zerolatency`: 零延迟优化
- `-f flv`: 输出 FLV 格式 (RTMP 使用)

### 3. 其他推流工具

- **StreamLabs OBS**: OBS 的增强版，带直播管理功能
- **XSplit**: 商业软件，界面更友好
- **vMix**: 专业级直播制作软件
- **手机 App**: Larix Broadcaster (iOS/Android)

---

## RTMP 转 HLS 流程

在我们的项目中，RTMP 推流后会自动转换为 HLS：

```
┌─────────────┐
│ OBS 推流     │ RTMP Stream
│ H.264 + AAC │
└──────┬──────┘
       │ rtmp://localhost:1935/live/stream_key
       ↓
┌─────────────────────┐
│ RTMP 服务器          │
│ (node-media-server) │
└──────┬──────────────┘
       │
       ├─→ 录制 → recordings/live-stream_key.mp4
       │
       └─→ 转码 (FFmpeg)
           │
           ↓
    ┌──────────────┐
    │ HLS 输出      │
    ├──────────────┤
    │ master.m3u8  │ (主播放列表)
    │ 360p.m3u8    │
    │ 720p.m3u8    │
    │ 1080p.m3u8   │
    │ *.ts 分片     │
    └──────┬───────┘
           │ http://localhost:8000/live/stream_key/index.m3u8
           ↓
    ┌──────────────┐
    │ 网页播放器    │
    │ (hls.js)     │
    └──────────────┘
```

### 转码命令 (自动执行)

```bash
ffmpeg -i rtmp://localhost:1935/live/stream_key \
  # 360p 低画质
  -c:v libx264 -b:v 800k -s 640x360 \
  -c:a aac -b:a 96k \
  -hls_time 2 -hls_list_size 3 \
  media/live/stream_key/360p.m3u8 \

  # 720p 中画质
  -c:v libx264 -b:v 2500k -s 1280x720 \
  -c:a aac -b:a 128k \
  -hls_time 2 -hls_list_size 3 \
  media/live/stream_key/720p.m3u8 \

  # 1080p 高画质
  -c:v libx264 -b:v 5000k -s 1920x1080 \
  -c:a aac -b:a 192k \
  -hls_time 2 -hls_list_size 3 \
  media/live/stream_key/1080p.m3u8
```

---

## RTMP 性能优化

### 1. 降低延迟

```javascript
// 服务器配置
rtmp: {
  chunk_size: 60000,    // 增大块大小
  gop_cache: true,      // 缓存关键帧 (快速启动)
  ping: 10,             // 减少心跳间隔
  ping_timeout: 30
}

// HLS 转码参数
hlsFlags: '[hls_time=1:hls_list_size=2]'  // 更短的分片
```

### 2. 提高画质

```bash
# OBS 设置
├─ 视频比特率: 4500 Kbps (1080p)
├─ 关键帧间隔: 2秒
├─ 预设: medium (更慢但更好)
└─ 配置文件: high
```

### 3. 节省带宽

```bash
# 降低码率
├─ 720p: 2500 Kbps → 1500 Kbps
├─ 音频: 128k → 96k
└─ 预设: veryfast (更快编码)
```

---

## RTMP 常见问题

### Q1: RTMP 推流失败

**可能原因**:
1. 端口 1935 被占用
2. FFmpeg 路径错误
3. 流密钥不匹配
4. 防火墙阻止

**检查方法**:
```bash
# 检查端口
lsof -i :1935  # macOS/Linux
netstat -ano | findstr :1935  # Windows

# 测试 RTMP 服务器
curl http://localhost:8000/api/streams
```

### Q2: 推流延迟高

**原因**:
- 网络带宽不足
- 编码预设太慢
- GOP (关键帧间隔) 太大

**解决**:
```bash
# OBS 设置
├─ 预设: ultrafast
├─ 关键帧间隔: 1秒
└─ 降低码率
```

### Q3: 推流卡顿

**原因**:
- CPU 占用过高
- 上传带宽不足
- 码率设置过高

**解决**:
```bash
# 降低分辨率和码率
720p @ 2500 Kbps → 480p @ 1000 Kbps

# 使用硬件编码器
OBS: 设置 → 输出 → 编码器 → NVENC (NVIDIA GPU)
```

### Q4: 看不到推流画面

**检查清单**:
```bash
# 1. RTMP 服务器是否收到流?
tail -f logs/rtmp.log

# 2. HLS 文件是否生成?
ls media/live/stream_key/

# 3. 播放器是否正确加载?
# 打开浏览器控制台查看错误
```

---

## RTMP 安全性

### 1. 推流鉴权

```javascript
// 验证流密钥
nms.on('prePublish', (id, StreamPath, args) => {
  const validKeys = ['stream_key', 'secret123'];
  const streamKey = StreamPath.split('/').pop();

  if (!validKeys.includes(streamKey)) {
    // 拒绝推流
    const session = nms.getSession(id);
    session.reject();
    console.log('无效的流密钥:', streamKey);
  }
});
```

### 2. IP 白名单

```javascript
nms.on('preConnect', (id, args) => {
  const allowedIPs = ['127.0.0.1', '192.168.1.100'];
  const clientIP = args.ip;

  if (!allowedIPs.includes(clientIP)) {
    // 拒绝连接
    const session = nms.getSession(id);
    session.reject();
  }
});
```

### 3. RTMPS (加密)

```javascript
// 使用 RTMPS (RTMP over TLS)
rtmp: {
  port: 1935,
  ssl: {
    port: 443,
    key: '/path/to/privkey.pem',
    cert: '/path/to/fullchain.pem'
  }
}

// 推流地址
rtmps://your-domain.com/live/stream_key
```

---

## RTMP 监控和日志

### 1. 实时监控

```javascript
// 获取当前所有推流
nms.on('postPublish', () => {
  const sessions = nms.getSession();
  for (let id in sessions) {
    console.log('流ID:', id);
    console.log('流路径:', sessions[id].publishStreamPath);
    console.log('IP:', sessions[id].ip);
  }
});
```

### 2. 统计信息

```javascript
// REST API 获取流信息
app.get('/api/streams', (req, res) => {
  const sessions = nms.getSession();
  const streams = [];

  for (let id in sessions) {
    if (sessions[id].isStarting) {
      streams.push({
        id: id,
        path: sessions[id].publishStreamPath,
        ip: sessions[id].ip,
        startTime: sessions[id].connectTime
      });
    }
  }

  res.json({ streams });
});
```

---

## 总结

### RTMP 的优势
- ✅ **低延迟**: 1-3秒，适合互动直播
- ✅ **成熟稳定**: 广泛应用于各大直播平台
- ✅ **工具丰富**: OBS、FFmpeg 等工具完善
- ✅ **编码灵活**: 支持 H.264、AAC 等主流编码

### RTMP 的局限
- ❌ **浏览器不支持**: 需要转换为 HLS/DASH
- ❌ **防火墙问题**: 1935 端口可能被封
- ❌ **CDN 不友好**: 需要专门的 RTMP CDN
- ❌ **Flash 依赖**: 原本需要 Flash (已淘汰)

### 现代直播架构

```
推流: RTMP (低延迟上传)
    ↓
服务器: 转码
    ↓
分发: HLS/DASH (浏览器友好)
```

这就是为什么我们的项目使用 **RTMP 推流 + HLS 播放** 的组合！

---

## 扩展阅读

- [RTMP 协议规范](https://rtmp.veriskope.com/docs/spec/)
- [Adobe RTMP 官方文档](https://www.adobe.com/devnet/rtmp.html)
- [Node Media Server GitHub](https://github.com/illuspas/Node-Media-Server)
- [FFmpeg RTMP 文档](https://trac.ffmpeg.org/wiki/StreamingGuide)
- [OBS Studio 推流指南](https://obsproject.com/wiki/Streaming-Guide)

---

**🎬 现在你已经完全理解 RTMP 协议了！快去试试推流吧！**
