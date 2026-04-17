# 🎬 阶段5: WebRTC + RTMP 双推流直播系统

完整的双推流模式直播系统，支持**网页 WebRTC 推流**和**OBS RTMP 推流**。

---

## ✨ 核心功能

### 1. 📡 双推流模式

**方式 1: 网页 WebRTC 推流** (新!) ⭐
- 浏览器直接推流，无需安装软件
- 支持摄像头 + 屏幕共享
- 超低延迟 (< 1秒)
- 自适应码率
- 类似 YouTube Studio 体验

**方式 2: OBS/FFmpeg RTMP 推流**
- 传统专业推流方式
- 功能强大，场景丰富
- 稳定可靠
- 与阶段4完全兼容

### 2. 🔄 协议转换桥接

- WebRTC → RTMP 自动转换
- FFmpeg 实时转码
- 统一的 HLS 输出
- 观众无感知差异

### 3. 🎥 统一播放体验

- HLS 自适应播放
- 多码率自动切换
- 两种推流源统一播放
- 低延迟模式

---

## 🏗️ 技术架构

### 完整流程图

```
┌──────────────────────────────────────────────────────────────┐
│                      推流端 (两种方式)                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  方式 1: 网页 WebRTC 推流 ⭐                                  │
│  ┌────────────────────────────────┐                         │
│  │  浏览器 (Chrome/Firefox/Edge)  │                         │
│  │                                │                         │
│  │  1. getUserMedia()             │                         │
│  │     ├─ 摄像头                  │                         │
│  │     └─ 屏幕共享                │                         │
│  │                                │                         │
│  │  2. MediaStream API            │                         │
│  │     ├─ 视频轨道                │                         │
│  │     └─ 音频轨道                │                         │
│  │                                │                         │
│  │  3. Mediasoup Client           │                         │
│  │     └─ WebRTC 编码             │                         │
│  └────────────┬───────────────────┘                         │
│               │ WebRTC (UDP)                                │
│               │ ws://server/signaling                       │
│               ↓                                             │
│  ┌────────────────────────────────┐                         │
│  │  Mediasoup 媒体服务器           │                         │
│  │  ├─ 接收 WebRTC 流              │                         │
│  │  ├─ Router + Transport         │                         │
│  │  └─ Producer/Consumer          │                         │
│  └────────────┬───────────────────┘                         │
│               │ RTP                                         │
│               ↓                                             │
│  ┌────────────────────────────────┐                         │
│  │  FFmpeg 转换桥接                │                         │
│  │  WebRTC (VP8/Opus)             │                         │
│  │       ↓                        │                         │
│  │  RTMP (H.264/AAC)              │                         │
│  └────────────┬───────────────────┘                         │
│               │                                             │
│               │ rtmp://localhost:1935/live/key              │
│               ↓                                             │
│                                                              │
│  方式 2: OBS/FFmpeg RTMP 推流                                │
│  ┌────────────────────────────────┐                         │
│  │  OBS Studio / FFmpeg            │                         │
│  │  ├─ 场景管理                    │                         │
│  │  ├─ 多路源合成                  │                         │
│  │  ├─ 滤镜效果                    │                         │
│  │  └─ RTMP 编码                   │                         │
│  └────────────┬───────────────────┘                         │
│               │ RTMP (TCP 1935)                             │
│               ↓                                             │
└──────────────────────────────────────────────────────────────┘
                │
                │ 两种推流方式汇聚
                ↓
┌──────────────────────────────────────────────────────────────┐
│              RTMP 服务器 (Node Media Server)                  │
│  ├─ 接收 RTMP 流 (端口 1935)                                 │
│  ├─ 实时转码 HLS (3档码率)                                   │
│  └─ 自动录制 MP4                                             │
└────────────┬─────────────────────────────────────────────────┘
             │ HLS (HTTP)
             │ http://localhost:8000/live/key/index.m3u8
             ↓
┌──────────────────────────────────────────────────────────────┐
│                    HLS 播放器                                 │
│  ├─ hls.js 自适应播放                                        │
│  ├─ 多码率自动切换                                            │
│  └─ 统一的观看体验                                            │
└──────────────────────────────────────────────────────────────┘
             │
             ↓
         [ 观众浏览器 ]
```

---

## 🚀 快速开始

### 安装依赖

```bash
cd webrtc-streaming
npm install
```

**注意**: 首次安装需要编译 Mediasoup 原生模块，可能需要 5-10 分钟。

### 启动服务器

```bash
npm start
```

### 推流测试

**方式 1: 网页推流**
```
访问: https://localhost:6443/stream.html
或:   http://localhost:6000/stream.html (仅localhost)
```

**方式 2: OBS 推流**
```
服务器: rtmp://localhost:1935/live
串流密钥: stream_key
```

### 观看直播

```
访问: http://localhost:6000
输入对应的流密钥
```

---

## 📁 项目结构

```
webrtc-streaming/
├── server.js              # 主服务器
│   ├─ Mediasoup 媒体服务器
│   ├─ WebSocket 信令服务器
│   ├─ RTMP 服务器
│   └─ FFmpeg 转换桥接
│
├── package.json           # 依赖配置
├── QUICKSTART.md          # 快速开始指南 👈 从这里开始
├── README.md              # 本文件
│
├── public/
│   ├── stream.html        # 网页推流界面
│   ├── streaming-client.js # WebRTC 推流逻辑
│   └── index.html         # 播放器页面
│
├── certs/                 # HTTPS 证书 (需自行生成)
│   ├── key.pem
│   └── cert.pem
│
├── media/                 # HLS 文件 (自动创建)
│   └── live/
│       └── {stream_key}/
│           ├── index.m3u8
│           └── *.ts
│
└── recordings/            # 录制文件 (自动创建)
    └── *.mp4
```

---

## 🔌 端口说明

| 端口 | 协议 | 用途 | 访问方式 |
|------|------|------|----------|
| 6000 | HTTP | 网页服务器 | http://localhost:6000 |
| 6443 | HTTPS | 网页服务器 (SSL) | https://localhost:6443 |
| 6001 | WebSocket | 信令服务器 | ws://localhost:6000/signaling |
| 1935 | RTMP | 推流服务器 | rtmp://localhost:1935/live/{key} |
| 8000 | HTTP | HLS 流服务 | http://localhost:8000/live/{key}/index.m3u8 |
| 10000-10100 | UDP/TCP | Mediasoup RTC | 自动分配 |

---

## 🎯 核心技术详解

### 1. Mediasoup 媒体服务器

**什么是 Mediasoup?**

Mediasoup 是一个高性能的 WebRTC 媒体服务器框架，专为实时音视频通信设计。

**核心概念**:

```javascript
// Worker: 工作进程
const worker = await mediasoup.createWorker({
  rtcMinPort: 10000,
  rtcMaxPort: 10100
});

// Router: 路由器 (每个直播间一个)
const router = await worker.createRouter({
  mediaCodecs: [
    { kind: 'audio', mimeType: 'audio/opus' },
    { kind: 'video', mimeType: 'video/VP8' },
    { kind: 'video', mimeType: 'video/H264' }
  ]
});

// Transport: 传输通道
const transport = await router.createWebRtcTransport({
  listenIps: [{ ip: '0.0.0.0', announcedIp: '127.0.0.1' }],
  enableUdp: true,
  enableTcp: true
});

// Producer: 生产者 (推流端)
const producer = await transport.produce({
  kind: 'video',
  rtpParameters: {...}
});

// Consumer: 消费者 (拉流端)
const consumer = await transport.consume({
  producerId: producer.id,
  rtpCapabilities: router.rtpCapabilities
});
```

**为什么选择 Mediasoup?**

```
✅ 高性能 (C++ 核心)
✅ 低延迟 (< 100ms)
✅ 支持多种编码 (VP8/VP9/H.264)
✅ 灵活的 API
✅ 活跃的社区
✅ 开源免费
```

---

### 2. WebRTC 信令流程

**完整信令交换**:

```
客户端                        服务器
  │                              │
  ├─ getRouterRtpCapabilities ──→│
  │←── rtpCapabilities ──────────┤
  │                              │
  ├─ createTransport ────────────→│
  │←── transportOptions ─────────┤
  │                              │
  ├─ connectTransport ───────────→│
  │  (dtlsParameters)             │
  │←── connected ────────────────┤
  │                              │
  ├─ produce ────────────────────→│
  │  (kind, rtpParameters)        │
  │←── producerId ────────────────┤
  │                              │
```

**客户端代码示例**:

```javascript
// 1. 初始化 Device
const device = new mediasoupClient.Device();

const { rtpCapabilities } = await sendMessage({
  type: 'getRouterRtpCapabilities',
  streamKey: 'my_stream'
});

await device.load({ routerRtpCapabilities: rtpCapabilities });

// 2. 创建发送 Transport
const { transportOptions } = await sendMessage({
  type: 'createTransport',
  streamKey: 'my_stream',
  direction: 'send'
});

const sendTransport = device.createSendTransport(transportOptions);

// 3. 连接事件
sendTransport.on('connect', async ({ dtlsParameters }, callback) => {
  await sendMessage({
    type: 'connectTransport',
    transportId: sendTransport.id,
    dtlsParameters
  });
  callback();
});

// 4. 生产事件
sendTransport.on('produce', async ({ kind, rtpParameters }, callback) => {
  const { id } = await sendMessage({
    type: 'produce',
    transportId: sendTransport.id,
    kind,
    rtpParameters,
    streamKey: 'my_stream'
  });
  callback({ id });
});

// 5. 开始推流
const videoTrack = stream.getVideoTracks()[0];
const producer = await sendTransport.produce({ track: videoTrack });
```

---

### 3. WebRTC → RTMP 转换

**转换流程**:

```
WebRTC (VP8 + Opus)
    ↓ Mediasoup Consumer
RTP 包
    ↓ PlainTransport
UDP Socket (127.0.0.1:xxxxx)
    ↓ FFmpeg 读取
解码 VP8 → Raw Video
解码 Opus → Raw Audio
    ↓ FFmpeg 编码
编码 H.264 (libx264)
编码 AAC
    ↓ FFmpeg 封装
RTMP (FLV)
    ↓ 推送
rtmp://localhost:1935/live/key
```

**FFmpeg 命令**:

```bash
ffmpeg \
  # 输入视频 (RTP)
  -protocol_whitelist file,rtp,udp \
  -i rtp://127.0.0.1:${videoPort} \
  \
  # 输入音频 (RTP)
  -protocol_whitelist file,rtp,udp \
  -i rtp://127.0.0.1:${audioPort} \
  \
  # 映射流
  -map 0:v -map 1:a \
  \
  # 视频编码
  -c:v libx264 \
  -preset ultrafast \
  -tune zerolatency \
  \
  # 音频编码
  -c:a aac -b:a 128k \
  \
  # 输出 RTMP
  -f flv rtmp://localhost:1935/live/${streamKey}
```

---

### 4. 浏览器媒体 API

#### getUserMedia (摄像头/麦克风)

```javascript
const stream = await navigator.mediaDevices.getUserMedia({
  video: {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30 },
    facingMode: 'user' // 'user' 或 'environment'
  },
  audio: {
    echoCancellation: true,  // 回声消除
    noiseSuppression: true,  // 降噪
    autoGainControl: true    // 自动增益
  }
});
```

#### getDisplayMedia (屏幕共享)

```javascript
const stream = await navigator.mediaDevices.getDisplayMedia({
  video: {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30 }
  },
  audio: true  // 系统音频
});

// 屏幕共享停止监听
stream.getVideoTracks()[0].addEventListener('ended', () => {
  console.log('用户停止了屏幕共享');
});
```

---

## 📊 性能对比

### WebRTC vs RTMP 推流

| 特性 | WebRTC 推流 | RTMP 推流 |
|------|------------|----------|
| **启动方式** | 浏览器访问网页 | 需要 OBS 软件 |
| **延迟** | < 1秒 (超低) | 2-5秒 (低) |
| **安装** | 无需安装 | 需要安装 OBS |
| **功能** | 基础 | 专业级 |
| **场景管理** | 简单 | 复杂 |
| **滤镜效果** | 有限 (CSS/WebGL) | 丰富 |
| **稳定性** | 较好 | 优秀 |
| **CPU 占用** | 中等 | 较低 |
| **带宽自适应** | ✅ 原生支持 | ⚠️ 需配置 |
| **适用场景** | 临时/快速直播 | 专业直播 |

---

## 🛠️ 配置说明

### Mediasoup Worker 配置

```javascript
const worker = await mediasoup.createWorker({
  logLevel: 'warn',          // 日志级别
  rtcMinPort: 10000,         // RTC 最小端口
  rtcMaxPort: 10100,         // RTC 最大端口
  dtlsCertificateFile: '',   // DTLS 证书 (可选)
  dtlsPrivateKeyFile: ''     // DTLS 私钥 (可选)
});
```

### Router MediaCodecs

```javascript
const mediaCodecs = [
  // Opus 音频 (推荐)
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2
  },

  // VP8 视频 (兼容性好)
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000
    }
  },

  // H.264 视频 (更通用)
  {
    kind: 'video',
    mimeType: 'video/H264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '42e01f',
      'level-asymmetry-allowed': 1
    }
  }
];
```

### WebRTC Transport 配置

```javascript
const transport = await router.createWebRtcTransport({
  // 监听 IP
  listenIps: [
    {
      ip: '0.0.0.0',
      announcedIp: '127.0.0.1'  // 公网 IP (生产环境)
    }
  ],

  // 启用协议
  enableUdp: true,      // UDP (推荐)
  enableTcp: true,      // TCP (备用)
  preferUdp: true,      // 优先 UDP

  // 初始带宽
  initialAvailableOutgoingBitrate: 1000000,

  // 最大带宽
  maxIncomingBitrate: 3000000
});
```

---

## 🔧 故障排查

### 问题 1: Mediasoup 安装失败

**现象**:
```
gyp ERR! build error
```

**原因**: 缺少编译工具链

**解决**:

```bash
# macOS
xcode-select --install
brew install python3

# Ubuntu/Debian
sudo apt install build-essential python3 python3-pip

# Windows
# 安装 Visual Studio Build Tools
npm install --global windows-build-tools
```

---

### 问题 2: WebRTC 连接超时

**现象**: 浏览器推流卡在 "连接中..."

**原因**:
1. 防火墙阻止 UDP 端口
2. 未使用 HTTPS (非 localhost)
3. announcedIp 配置错误

**解决**:

```bash
# 1. 检查防火墙
sudo ufw allow 10000:10100/udp  # Linux
sudo ufw allow 10000:10100/tcp

# 2. 使用 HTTPS 或 localhost
# 访问: https://localhost:6443 或 http://localhost:6000

# 3. 检查 announcedIp
# server.js 中:
listenIps: [
  {
    ip: '0.0.0.0',
    announcedIp: '你的公网IP'  // 或 '127.0.0.1' (本地测试)
  }
]
```

---

### 问题 3: FFmpeg 转换失败

**现象**: 推流成功但看不到画面

**原因**: FFmpeg 进程启动失败或崩溃

**调试**:

```bash
# 查看 FFmpeg 进程
ps aux | grep ffmpeg

# 手动测试 FFmpeg
ffmpeg -protocol_whitelist file,rtp,udp \
  -i rtp://127.0.0.1:10050 \
  -f flv rtmp://localhost:1935/live/test
```

**常见错误**:

```
1. FFmpeg 路径错误
   → 修改 server.js 中的 ffmpeg 路径

2. 端口被占用
   → 修改 MEDIASOUP_PORT_START/END

3. RTMP 服务器未启动
   → 检查 node-media-server 是否正常运行
```

---

## 🎓 学习成果

完成本阶段后，你已经掌握:

### WebRTC 技术
- ✅ WebRTC 工作原理
- ✅ SDP 协商流程
- ✅ ICE 候选交换
- ✅ DTLS/SRTP 加密

### Mediasoup 框架
- ✅ Worker/Router 架构
- ✅ Transport 管理
- ✅ Producer/Consumer 模式
- ✅ 信令服务器设计

### 协议转换
- ✅ WebRTC ↔ RTMP 转换
- ✅ FFmpeg 实时转码
- ✅ RTP 协议处理
- ✅ 多协议集成

### 浏览器 API
- ✅ getUserMedia
- ✅ getDisplayMedia
- ✅ MediaStream API
- ✅ RTCPeerConnection

---

## 🚀 进阶方向

### 功能扩展

```
✅ 已实现:
├─ WebRTC 推流
├─ RTMP 推流
├─ HLS 播放
└─ 协议转换

📅 可扩展:
├─ 画面合成 (Canvas)
├─ 美颜滤镜 (WebGL)
├─ 多人连麦 (多 Producer)
├─ 录制下载
├─ 实时字幕
└─ 虚拟背景
```

### 性能优化

```
1. 降低延迟
   ├─ 调整 HLS 分片 (2秒 → 1秒)
   ├─ 优化 FFmpeg 预设 (ultrafast)
   └─ 启用 HTTP/2 推送

2. 提升画质
   ├─ 增加码率上限
   ├─ 使用 VP9/H.265
   └─ 硬件编码 (NVENC/QSV)

3. 节省带宽
   ├─ 启用 simulcast
   ├─ 动态码率调整
   └─ VP9/AV1 编码
```

---

## 📚 学习资源

### 官方文档

- [Mediasoup](https://mediasoup.org/) - WebRTC 媒体服务器
- [mediasoup-client](https://mediasoup.org/documentation/v3/mediasoup-client/) - 客户端库
- [WebRTC](https://webrtc.org/) - WebRTC 官网
- [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)

### 技术文章

- [WebRTC 原理详解](https://webrtc.org/getting-started/overview)
- [Mediasoup 架构设计](https://mediasoup.org/documentation/v3/mediasoup/design/)
- [SDP 协议解析](https://tools.ietf.org/html/rfc4566)
- [ICE 协议详解](https://tools.ietf.org/html/rfc8445)

---

## 🙏 致谢

本项目使用了以下开源项目:

- [mediasoup](https://mediasoup.org/) - WebRTC SFU
- [mediasoup-client](https://www.npmjs.com/package/mediasoup-client) - WebRTC 客户端
- [node-media-server](https://github.com/illuspas/Node-Media-Server) - RTMP 服务器
- [hls.js](https://github.com/video-dev/hls.js/) - HLS 播放器
- [Express](https://expressjs.com/) - Web 框架
- [FFmpeg](https://ffmpeg.org/) - 多媒体处理

---

**🎉 恭喜你完成了阶段5的学习！你已经掌握了 WebRTC 直播推流技术！**

有问题? 查看 [QUICKSTART.md](./QUICKSTART.md) 或提交 Issue
