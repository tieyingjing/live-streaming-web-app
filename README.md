# 流媒体 Web App 学习项目

从零开始学习视频流媒体技术，逐步实现类似 YouTube 的视频播放系统。

---

## 项目结构

```
live-streaming/
├── video-streaming/          # 阶段 2: 简单视频服务器
│   ├── videos/               # 源视频文件
│   │   ├── 知否.mov (72.6 MB)
│   │   └── 社火.mov (102.7 MB)
│   ├── video-server.js       # Range Requests 服务器
│   ├── public/
│   │   ├── index.html        # 视频播放器
│   │   └── test-range.html   # Range 测试页面
│   └── README.md
│
├── hls-streaming/            # 阶段 3: HLS 自适应流媒体
│   ├── hls-output/           # 转码后的 HLS 文件
│   ├── transcode.js          # 视频转码脚本
│   ├── transcode-videos.sh   # 批量转码脚本
│   ├── hls-server.js         # HLS 服务器
│   ├── public/
│   │   └── index.html        # HLS 播放器
│   ├── QUICKSTART.md         # 快速开始
│   └── README.md
│
├── live-streaming/           # 阶段 4: RTMP 实时直播
│   ├── server.js             # RTMP + WebSocket + HTTP 服务器
│   ├── package.json
│   ├── public/
│   │   ├── index.html        # 直播播放器
│   │   ├── app.js            # 播放器逻辑 + 弹幕
│   │   └── broadcast.html    # 推流指南
│   ├── recordings/           # 录制文件 (自动创建)
│   ├── media/                # HLS 文件 (自动创建)
│   ├── QUICKSTART.md         # 快速开始
│   └── README.md
│
└── webrtc-streaming/         # 阶段 5: WebRTC 网页推流 ⭐ 当前
    ├── server.js             # Mediasoup + RTMP + WebSocket 服务器
    ├── package.json
    ├── public/
    │   ├── stream.html       # 网页推流界面 (类似 YouTube Studio)
    │   ├── streaming-client.js # WebRTC 推流逻辑
    │   └── index.html        # 统一播放器
    ├── certs/                # HTTPS 证书目录
    ├── media/                # HLS 文件 (自动创建)
    ├── QUICKSTART.md         # 快速开始 👈 从这里开始
    └── README.md             # 完整技术文档
```

---

## 学习路线

### ✅ 阶段 1: 基础概念

理解流媒体的核心概念：
- HTTP Range Requests
- 视频编码格式 (H.264, AAC)
- 容器格式 (MP4, MOV)
- 自适应比特率 (ABR)

### ✅ 阶段 2: 简单视频服务器

**目录**: `video-streaming/`

**核心技术**:
- HTTP Range Requests (206 Partial Content)
- 断点续传
- 进度条拖拽
- 边下载边播放

**启动方式**:
```bash
cd video-streaming
npm install
npm start
# 访问 http://localhost:3000
```

**学到的知识**:
- Range 请求头的解析
- 206 状态码的返回
- 视频流式传输原理
- HTML5 Video API

---

### ✅ 阶段 3: HLS 自适应流媒体

**目录**: `hls-streaming/`

**核心技术**:
- HLS (HTTP Live Streaming) 协议
- 多码率转码 (360p / 720p / 1080p)
- 自适应比特率 (ABR)
- 视频分片 (.ts 文件)
- FFmpeg 视频处理

**快速开始**:

```bash
cd hls-streaming

# 1. 安装依赖
npm install

# 2. 转码视频（使用 video-streaming/videos/ 中的视频）
npm run transcode-all

# 3. 启动服务器
npm start

# 4. 访问 http://localhost:4000
```

**详细教程**: 查看 [hls-streaming/QUICKSTART.md](./hls-streaming/QUICKSTART.md)

**学到的知识**:
- HLS 协议工作原理
- FFmpeg 视频转码
- m3u8 播放列表格式
- 自适应码率切换
- hls.js 库的使用

**效果演示**:

```
用户网速变化:
  快速 WiFi (5 Mbps) → 3G (1 Mbps) → 4G (3 Mbps)
          ↓                ↓               ↓
播放器自动切换:
    1080p          →    360p     →     720p
          ↓                ↓               ↓
用户体验:
  高清流畅        →  降低画质   →   提升画质
                   保持流畅       继续流畅
```

---

## 技术对比

| 特性 | 阶段 2 (Range) | 阶段 3 (HLS) | 阶段 4 (RTMP) | 阶段 5 (WebRTC) |
|------|---------------|-------------|--------------|----------------|
| **文件结构** | 单个 MP4/MOV | .ts 分片 + .m3u8 | RTMP → HLS | WebRTC/RTMP → HLS |
| **画质选择** | ❌ 固定 | ✅ 多码率 | ✅ 多码率 | ✅ 多码率 |
| **自适应** | ❌ | ✅ 自动切换 | ✅ 自动切换 | ✅ 自动切换 |
| **实时直播** | ❌ | ⚠️ 点播为主 | ✅ 专为直播 | ✅ 专为直播 |
| **弹幕系统** | ❌ | ❌ | ✅ WebSocket | ✅ WebSocket |
| **推流支持** | ❌ | ❌ | ✅ RTMP (OBS) | ✅ WebRTC + RTMP |
| **网页推流** | ❌ | ❌ | ❌ | ✅ 浏览器直接推 |
| **自动录制** | ❌ | ❌ | ✅ 支持 | ✅ 支持 |
| **延迟** | 无延迟 | 低延迟 | 2-5秒 | 1-3秒 (WebRTC < 1秒) |
| **复杂度** | 简单 | 中等 | 较高 | 高 |
| **适用场景** | 点播 | 点播/直播 | 直播/互动 | 直播/互动/在线会议 |

---

## 你的视频文件

### 源视频

位置: `video-streaming/videos/`

```
知否.mov  - 72.6 MB  (1920x1080, H.264)
社火.mov  - 102.7 MB (1920x1080, H.264)
```

### 转码后的 HLS 文件

位置: `hls-streaming/hls-output/`

```
知否/
├── master.m3u8      # 主播放列表
├── 360p.m3u8       # 低画质播放列表
├── 360p_*.ts       # 低画质分片
├── 720p.m3u8       # 中画质播放列表
├── 720p_*.ts
├── 1080p.m3u8      # 高画质播放列表
└── 1080p_*.ts

社火/
└── (同上)
```

---

## 快速命令参考

### 阶段 2 - 简单视频服务器

```bash
cd video-streaming
npm install
npm start                    # 启动服务器 (端口 3000)
```

访问:
- http://localhost:3000 - 主播放器
- http://localhost:3000/test-range.html - Range 请求测试

### 阶段 3 - HLS 流媒体

```bash
cd hls-streaming
npm install
npm run transcode-all        # 转码所有视频
npm start                    # 启动 HLS 服务器 (端口 4000)
```

访问:
- http://localhost:4000 - HLS 播放器

**单独转码某个视频**:
```bash
node transcode.js ../video-streaming/videos/知否.mov
node transcode.js ../video-streaming/videos/社火.mov
```

### 阶段 4 - RTMP 实时直播

```bash
cd live-streaming
npm install
npm start                    # 启动直播服务器
```

**使用 OBS 推流**:
1. 服务器: `rtmp://localhost:1935/live`
2. 串流密钥: `stream_key`
3. 开始推流

访问:
- http://localhost:5000 - 直播播放器
- http://localhost:5000/broadcast.html - 推流指南

### 阶段 5 - WebRTC 网页推流

```bash
cd webrtc-streaming
npm install
npm start                    # 启动 WebRTC + RTMP 服务器
```

**方式 1: 网页推流** (无需 OBS):
```
访问: https://localhost:6443/stream.html
或: http://localhost:6000/stream.html
选择摄像头/屏幕共享 → 输入流密钥 → 开始推流
```

**方式 2: OBS 推流** (依然支持):
```
服务器: rtmp://localhost:1935/live
串流密钥: stream_key
```

访问:
- http://localhost:6000 - 统一播放器
- https://localhost:6443/stream.html - 网页推流界面

---

## 学习资源

### 文档

**阶段 2 - 简单视频服务器**:
- [video-streaming/README.md](./video-streaming/README.md) - 详细说明
- [video-streaming/HOW-RANGE-WORKS.md](./video-streaming/HOW-RANGE-WORKS.md) - Range Requests 原理

**阶段 3 - HLS 流媒体**:
- [hls-streaming/QUICKSTART.md](./hls-streaming/QUICKSTART.md) - 快速开始
- [hls-streaming/HLS-EXPLAINED.md](./hls-streaming/HLS-EXPLAINED.md) - HLS 技术详解
- [hls-streaming/SETUP.md](./hls-streaming/SETUP.md) - 安装指南

**阶段 4 - RTMP 实时直播**:
- [live-streaming/QUICKSTART.md](./live-streaming/QUICKSTART.md) - 快速开始
- [live-streaming/README.md](./live-streaming/README.md) - 详细说明
- [live-streaming/RTMP-EXPLAINED.md](./live-streaming/RTMP-EXPLAINED.md) - RTMP 协议深度解析 📡
- [live-streaming/RTMP-QUICKREF.md](./live-streaming/RTMP-QUICKREF.md) - RTMP 快速参考 📋
- [live-streaming/MOBILE-STREAMING.md](./live-streaming/MOBILE-STREAMING.md) - 移动端推流/观看方案 📱

**阶段 5 - WebRTC 网页推流** ⭐:
- [webrtc-streaming/QUICKSTART.md](./webrtc-streaming/QUICKSTART.md) - 快速开始 👈 10分钟上手
- [webrtc-streaming/README.md](./webrtc-streaming/README.md) - 完整技术文档 📖
- [live-streaming/WEB-OBS-FEASIBILITY.md](./live-streaming/WEB-OBS-FEASIBILITY.md) - 网页版 OBS 可行性分析 💡
- [live-streaming/YOUTUBE-TECH-STACK.md](./live-streaming/YOUTUBE-TECH-STACK.md) - YouTube 技术栈详解 🎬

### 在线资源

- [MDN - HTTP Range Requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Range_requests)
- [Apple HLS 规范](https://developer.apple.com/streaming/)
- [FFmpeg 文档](https://ffmpeg.org/documentation.html)
- [hls.js GitHub](https://github.com/video-dev/hls.js/)
- [RTMP 规范](https://rtmp.veriskope.com/docs/spec/)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)

---

## 下一步学习方向

### ✅ 阶段 4: 实时直播

**目录**: `live-streaming/`

**核心技术**:
- RTMP 推流服务器 (node-media-server)
- HLS 低延迟播放
- WebSocket 实时弹幕
- 自动录制和回放

**快速开始**:

```bash
cd live-streaming

# 1. 安装依赖
npm install

# 2. 启动服务器
npm start

# 3. 使用 OBS 推流
服务器: rtmp://localhost:1935/live
串流密钥: stream_key

# 4. 访问 http://localhost:5000
```

**详细教程**: 查看 [live-streaming/QUICKSTART.md](./live-streaming/QUICKSTART.md)

**学到的知识**:
- RTMP 推流协议
- 实时转码 (RTMP → HLS)
- WebSocket 双向通信
- 弹幕系统实现
- 直播录制

### ✅ 阶段 5: WebRTC 网页推流

**目录**: `webrtc-streaming/`

**核心技术**:
- WebRTC (浏览器实时通信)
- Mediasoup 媒体服务器 (WebRTC SFU)
- WebSocket 信令服务器
- WebRTC ↔ RTMP 协议转换
- 双推流模式 (WebRTC + RTMP)

**快速开始**:

```bash
cd webrtc-streaming

# 1. 安装依赖 (首次需要编译 Mediasoup)
npm install

# 2. 启动服务器
npm start

# 3. 网页推流
访问: https://localhost:6443/stream.html
或: http://localhost:6000/stream.html (仅 localhost)

# 4. OBS 推流 (依然支持)
服务器: rtmp://localhost:1935/live
串流密钥: stream_key

# 5. 访问播放器
http://localhost:6000
```

**详细教程**: 查看 [webrtc-streaming/QUICKSTART.md](./webrtc-streaming/QUICKSTART.md)

**学到的知识**:
- WebRTC 推流原理
- Mediasoup SFU 架构
- WebRTC 信令流程
- getUserMedia/getDisplayMedia API
- 协议转换技术 (WebRTC → RTMP)
- 双推流系统设计

**功能特性**:
- ✅ 浏览器直接推流 (无需 OBS)
- ✅ 摄像头推流
- ✅ 屏幕共享推流
- ✅ 兼容 OBS RTMP 推流
- ✅ 超低延迟 (< 1秒)
- ✅ HTTPS 安全连接

### 🎯 阶段 6: 生产级优化 (计划中)

- 视频上传和自动转码
- 转码队列 (Bull + Redis)
- CDN 集成 (CloudFlare, AWS)
- DRM 视频加密
- 监控和日志系统
- 多人连麦
- 虚拟背景

---

## 已掌握的技术

### 后端技术

✅ Node.js + Express
✅ HTTP Range Requests
✅ 文件流处理 (Streams)
✅ FFmpeg 视频转码
✅ HLS 协议实现
✅ RTMP 推流服务器
✅ WebSocket 实时通信
✅ Mediasoup 媒体服务器
✅ WebRTC 信令服务器
✅ 多服务器架构

### 前端技术

✅ HTML5 Video API
✅ JavaScript 事件处理
✅ hls.js 库
✅ 自适应播放器
✅ 实时统计显示
✅ WebSocket 客户端
✅ 弹幕动画系统
✅ 实时聊天 UI
✅ WebRTC API (getUserMedia/getDisplayMedia)
✅ Mediasoup Client
✅ 实时视频预览

### 视频技术

✅ H.264 视频编码
✅ AAC 音频编码
✅ MP4/MOV 容器格式
✅ HLS m3u8 播放列表
✅ MPEG-TS 视频分片
✅ 多码率自适应
✅ RTMP 协议
✅ WebRTC 协议
✅ Mediasoup SFU
✅ 实时转码
✅ 协议转换 (WebRTC ↔ RTMP)
✅ 直播录制

---

## 常见问题

### Q1: 三个阶段有什么区别？

**阶段 2 (video-streaming)**:
- 学习 HTTP Range Requests 基础
- 单个视频文件，固定画质
- 适合理解流媒体基本原理

**阶段 3 (hls-streaming)**:
- 生产级 HLS 流媒体
- 多码率自适应
- 接近 YouTube 点播实现

**阶段 4 (live-streaming)**:
- 完整的 RTMP 直播系统
- OBS 推流 + HLS 播放
- 实时弹幕和互动
- 接近 Bilibili/Twitch 实现

**阶段 5 (webrtc-streaming)**:
- WebRTC + RTMP 双推流系统
- 浏览器直接推流 (无需 OBS)
- 超低延迟 (< 1秒)
- 接近 YouTube Live 实现

### Q2: 需要安装什么？

**阶段 2**: 只需要 Node.js

**阶段 3**: 需要 Node.js + FFmpeg

**阶段 4**: 需要 Node.js + FFmpeg + OBS Studio

**阶段 5**: 需要 Node.js + FFmpeg (可选 OBS)

```bash
# macOS 安装 FFmpeg
brew install ffmpeg

# 下载 OBS Studio
# https://obsproject.com/

# 验证
ffmpeg -version
```

### Q3: 转码需要多久？

取决于：
- 视频长度
- 源视频分辨率
- 转码码率数量
- 电脑性能

**参考时间** (M1 Mac):
- 1 分钟 1080p 视频 → 约 30-60 秒
- 3 个码率 (360p/720p/1080p)

### Q4: HLS 文件很大吗？

是的，因为有 3 个码率版本：

```
原始视频: 100 MB
  ↓
转码后:
  360p:  20 MB
  720p:  40 MB
  1080p: 70 MB
  ------
  总计: 130 MB (1.3x)
```

但用户只下载需要的码率，慢速网络用户只用 20 MB！

---

## 总结

通过这五个阶段的学习，你已经：

1. ✅ 理解了视频流媒体的基本原理
2. ✅ 实现了 HTTP Range Requests
3. ✅ 掌握了 HLS 协议
4. ✅ 学会了 FFmpeg 视频转码
5. ✅ 实现了自适应比特率播放
6. ✅ 掌握了 RTMP 推流技术
7. ✅ 实现了 WebSocket 实时通信
8. ✅ 掌握了 WebRTC 实时通信
9. ✅ 学会了 Mediasoup 媒体服务器
10. ✅ 实现了协议转换 (WebRTC ↔ RTMP)
11. ✅ 构建了双推流直播系统

**这就是 YouTube、Netflix、Bilibili、Twitch、Zoom 等平台的核心技术！**

---

## 推荐学习路径

### 新手开始

1. 先运行**阶段 2** (`video-streaming/`)
   - 理解 Range Requests 原理
   - 观察浏览器的请求行为

2. 再运行**阶段 3** (`hls-streaming/`)
   - 转码视频
   - 体验自适应播放
   - 测试网络切换

### 进阶实验

1. 打开 Chrome DevTools → Network
2. 测试不同网络速度 (Throttling)
3. 观察画质自动切换
4. 查看 HLS 文件结构

### 深入学习

1. 阅读各阶段的技术文档
2. 修改转码和推流参数
3. 实验不同的网络条件
4. 探索更多进阶功能

准备好了吗？

- **新手**: 从 [video-streaming/](./video-streaming/) 开始
- **进阶**: 前往 [hls-streaming/QUICKSTART.md](./hls-streaming/QUICKSTART.md)
- **RTMP 直播**: 开启 [live-streaming/QUICKSTART.md](./live-streaming/QUICKSTART.md)
- **WebRTC 直播**: 体验 [webrtc-streaming/QUICKSTART.md](./webrtc-streaming/QUICKSTART.md) 🚀
