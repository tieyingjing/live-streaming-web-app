# 📱 移动端推流方案详解

## 现状说明

### ❌ 当前项目不支持移动 Web 推流

**原因**：
1. **RTMP 协议限制**：浏览器（包括移动端）无法直接使用 RTMP 协议
2. **端口限制**：浏览器无法访问 TCP 1935 端口
3. **Flash 已淘汰**：RTMP 原本依赖 Flash 插件

### ✅ 当前项目支持的推流方式

```
┌─────────────────────────────────────┐
│        支持的推流端                  │
├─────────────────────────────────────┤
│ ✅ Desktop 应用                      │
│    - OBS Studio                     │
│    - StreamLabs OBS                 │
│    - XSplit                         │
│    - vMix                           │
│                                     │
│ ✅ 命令行工具                        │
│    - FFmpeg                         │
│                                     │
│ ✅ 移动端原生 App                    │
│    - Larix Broadcaster (iOS/安卓)   │
│    - Streamlabs Mobile              │
│    - Prism Live Studio              │
│                                     │
│ ❌ Desktop Web (浏览器)              │
│    - 不支持 RTMP                     │
│                                     │
│ ❌ Mobile Web (手机浏览器)           │
│    - 不支持 RTMP                     │
└─────────────────────────────────────┘
```

---

## 移动端推流的三种方案

### 方案 1: 原生 App (推荐) ⭐

**优势**：
- ✅ 完全支持 RTMP
- ✅ 性能最好
- ✅ 功能最完整
- ✅ 稳定可靠

**推荐 App**：

#### iOS
```
1. Larix Broadcaster (免费)
   - 支持 RTMP/RTMPS
   - 支持多码率
   - 专业级功能

2. Streamlabs Mobile (免费)
   - 界面友好
   - 适合新手
   - 集成聊天功能

3. Prism Live Studio (免费)
   - 华为出品
   - 功能强大
```

#### Android
```
1. Larix Broadcaster (免费)
   - 功能同 iOS 版本

2. CameraFi Live (免费)
   - 简单易用
   - 支持多平台

3. Streamlabs Mobile (免费)
   - 功能同 iOS 版本
```

**配置方法**（以 Larix 为例）：

```
1. 下载安装 Larix Broadcaster
2. 打开 App → Settings → Connections
3. 添加新连接:
   ┌─────────────────────────────┐
   │ Name:     我的直播服务器      │
   │ URL:      rtmp://你的服务器IP:1935/live  │
   │ Stream:   stream_key        │
   │ Mode:     Video + Audio     │
   └─────────────────────────────┘
4. 返回主界面，点击 Go Live
```

---

### 方案 2: WebRTC 推流 (需要额外开发)

**原理**：
```
手机浏览器 → WebRTC → 中转服务器 → 转换 RTMP → 你的服务器
```

**优势**：
- ✅ 浏览器原生支持
- ✅ 无需安装 App
- ✅ 延迟更低 (< 1秒)

**劣势**：
- ❌ 需要额外的 WebRTC 服务器
- ❌ 开发复杂度高
- ❌ 服务器成本高

**技术架构**：

```
┌──────────────┐
│ 手机浏览器    │
│ (Chrome/Safari)
└──────┬───────┘
       │ getUserMedia() → 获取摄像头
       │ RTCPeerConnection → WebRTC 连接
       ↓
┌─────────────────────┐
│ WebRTC 信令服务器    │
│ (WebSocket)         │
└──────┬──────────────┘
       │ 建立 P2P 连接
       ↓
┌─────────────────────┐
│ WebRTC 媒体服务器    │
│ (Janus/Kurento/    │
│  Mediasoup)         │
└──────┬──────────────┘
       │ 转换协议
       ↓
┌─────────────────────┐
│ FFmpeg 转换器        │
│ WebRTC → RTMP       │
└──────┬──────────────┘
       │ rtmp://localhost:1935/live/key
       ↓
┌─────────────────────┐
│ 你的 RTMP 服务器     │
│ (node-media-server) │
└─────────────────────┘
```

**需要的额外组件**：

1. **WebRTC 媒体服务器**（选一个）：
   - Janus Gateway
   - Kurento Media Server
   - Mediasoup
   - Ant Media Server

2. **信令服务器**：
   - WebSocket 服务器 (已有)

3. **转码桥接**：
   - FFmpeg 将 WebRTC 流转成 RTMP

**实现难度**: ⭐⭐⭐⭐☆ (较高)

---

### 方案 3: MediaRecorder API (录制后上传)

**原理**：
```
手机浏览器 → 录制视频 → 上传文件 → 服务器处理 → 模拟直播
```

**特点**：
- ✅ 浏览器原生支持
- ✅ 实现简单
- ❌ 不是真正的实时直播（伪直播）
- ❌ 延迟高（需上传完成）

**适用场景**：
- 录播视频
- 短视频上传
- 延迟要求不高的场景

**实现难度**: ⭐⭐☆☆☆ (简单)

---

## 移动端观看直播 ✅ 完全支持

### 手机浏览器观看

**支持情况**：
```
✅ iOS Safari       - 原生支持 HLS
✅ Android Chrome   - hls.js 支持
✅ iOS Chrome       - 原生支持 HLS
✅ Android Firefox  - hls.js 支持
✅ 微信内置浏览器    - 支持
```

**访问方式**：
```
直接在手机浏览器访问:
http://你的服务器IP:5000
```

**响应式设计**：

当前项目的播放器已支持移动端：

```css
/* 自动适配移动端 */
@media (max-width: 768px) {
  .main-content {
    grid-template-columns: 1fr;  /* 单列布局 */
  }

  .video-container {
    width: 100%;  /* 全宽 */
  }
}
```

---

## 各平台对比

### Desktop 推流

| 工具 | 平台 | RTMP | 难度 | 推荐度 |
|------|------|------|------|--------|
| OBS Studio | Win/Mac/Linux | ✅ | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| StreamLabs | Win/Mac | ✅ | ⭐⭐ | ⭐⭐⭐⭐ |
| XSplit | Win | ✅ | ⭐⭐ | ⭐⭐⭐⭐ |
| FFmpeg | 命令行 | ✅ | ⭐⭐⭐⭐ | ⭐⭐⭐ |

### 移动端推流

| 方案 | 平台 | 实时性 | 开发难度 | 推荐度 |
|------|------|--------|---------|--------|
| 原生 App | iOS/Android | ✅ 高 | ⭐ (无需开发) | ⭐⭐⭐⭐⭐ |
| WebRTC | 浏览器 | ✅ 极高 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| MediaRecorder | 浏览器 | ❌ 低 | ⭐⭐ | ⭐⭐ |

### 移动端观看

| 平台 | HLS 支持 | 弹幕 | 难度 | 体验 |
|------|---------|------|------|------|
| iOS Safari | ✅ 原生 | ✅ | ⭐ | ⭐⭐⭐⭐⭐ |
| Android Chrome | ✅ hls.js | ✅ | ⭐ | ⭐⭐⭐⭐ |
| 微信浏览器 | ✅ | ✅ | ⭐ | ⭐⭐⭐⭐ |

---

## 移动端 App 推流教程

### Larix Broadcaster (iOS/Android)

#### 1. 下载安装

**iOS**:
```
App Store 搜索 "Larix Broadcaster"
或访问: https://apps.apple.com/app/larix-broadcaster/id1042474385
```

**Android**:
```
Google Play 搜索 "Larix Broadcaster"
或访问: https://play.google.com/store/apps/details?id=com.wmspanel.larix_broadcaster
```

#### 2. 配置推流

**步骤**:

```
1. 打开 Larix Broadcaster

2. 点击右上角 ⚙️ Settings

3. Connections → 点击 + 新建

4. 填写配置:
   ┌────────────────────────────────┐
   │ Name:    我的直播服务器          │
   │ URL:     rtmp://192.168.1.100:1935/live  │
   │          (替换为你的服务器 IP)   │
   │ Stream:  stream_key             │
   │ Mode:    Video + Audio          │
   └────────────────────────────────┘

5. 点击 Done 保存

6. 返回主界面

7. 视频设置 (可选):
   Settings → Video
   ├─ Resolution:  1280x720
   ├─ Bitrate:     2500 kbps
   ├─ FPS:         30
   └─ Codec:       H.264

8. 音频设置 (可选):
   Settings → Audio
   ├─ Bitrate:     128 kbps
   └─ Codec:       AAC

9. 开始推流:
   主界面 → 点击红色 ⚫ 按钮 → Go Live
```

#### 3. 验证推流

**在电脑浏览器访问**:
```
http://你的服务器IP:5000
```

**或在手机浏览器访问**:
```
http://你的服务器IP:5000
```

---

## 内网/外网推流配置

### 场景 1: 内网推流 (同一 WiFi)

**服务器端**:
```bash
# 查看内网 IP
ifconfig  # macOS/Linux
ipconfig  # Windows

# 假设内网 IP 是: 192.168.1.100
```

**手机端配置**:
```
URL: rtmp://192.168.1.100:1935/live
Stream: stream_key
```

**测试观看**:
```
手机浏览器访问: http://192.168.1.100:5000
```

---

### 场景 2: 外网推流 (手机在外面)

**方法 A: 使用内网穿透 (推荐)**

使用 ngrok 或 frp:

```bash
# 1. 安装 ngrok
brew install ngrok  # macOS

# 2. 启动内网穿透
ngrok tcp 1935  # 穿透 RTMP 端口
ngrok http 5000  # 穿透 HTTP 端口 (新终端)

# 3. 获得公网地址
Forwarding: tcp://0.tcp.ngrok.io:12345 -> localhost:1935
Forwarding: http://abc123.ngrok.io -> localhost:5000
```

**手机端配置**:
```
URL: rtmp://0.tcp.ngrok.io:12345/live
Stream: stream_key
```

**观看地址**:
```
http://abc123.ngrok.io
```

**方法 B: 云服务器部署**

在阿里云/腾讯云/AWS 部署服务器:

```bash
# 1. 购买云服务器，获得公网 IP: 123.45.67.89

# 2. 开放端口
防火墙规则:
├─ 1935 (RTMP)
├─ 5000 (HTTP)
├─ 5001 (WebSocket)
└─ 8000 (HLS)

# 3. 部署项目
git clone 你的项目
cd live-streaming
npm install
npm start
```

**手机端配置**:
```
URL: rtmp://123.45.67.89:1935/live
Stream: stream_key
```

**观看地址**:
```
http://123.45.67.89:5000
```

---

## 移动端优化建议

### 1. 降低码率 (节省流量)

**推荐设置**:

```
4G/5G 网络:
├─ 分辨率: 1280x720
├─ 视频码率: 1500 kbps
├─ 音频码率: 96 kbps
└─ 帧率: 30 fps

3G 网络:
├─ 分辨率: 854x480
├─ 视频码率: 800 kbps
├─ 音频码率: 64 kbps
└─ 帧率: 24 fps

WiFi:
├─ 分辨率: 1920x1080
├─ 视频码率: 3000 kbps
├─ 音频码率: 128 kbps
└─ 帧率: 30 fps
```

### 2. 自适应码率

Larix 支持动态调整:

```
Settings → Video → Adaptive Bitrate
├─ Enable: ✅
├─ Max Bitrate: 3000 kbps
├─ Min Bitrate: 500 kbps
└─ 网络差时自动降低码率
```

### 3. 省电模式

```
Settings → Advanced
├─ Background mode: Disabled
├─ Keep screen on: Enabled
└─ 降低分辨率和帧率
```

---

## 流量消耗计算

### 推流端 (上传)

**计算公式**:
```
流量 = (视频码率 + 音频码率) × 时长

例子:
├─ 720p 直播 1 小时
├─ 视频: 2500 kbps = 2.5 Mbps
├─ 音频: 128 kbps = 0.128 Mbps
├─ 总计: 2.628 Mbps
└─ 1小时流量 = 2.628 × 3600 / 8 = 1.18 GB
```

**不同画质流量**:

| 画质 | 码率 | 1小时流量 | 10小时流量 |
|------|------|----------|-----------|
| 360p | 800 kbps | 350 MB | 3.5 GB |
| 480p | 1200 kbps | 530 MB | 5.3 GB |
| 720p | 2500 kbps | 1.1 GB | 11 GB |
| 1080p | 5000 kbps | 2.2 GB | 22 GB |

### 观看端 (下载)

**自适应播放**:
```
播放器会根据网速自动切换:
├─ WiFi: 自动选择 1080p
├─ 4G: 自动选择 720p
├─ 3G: 自动选择 360p
└─ 节省流量
```

---

## 常见问题

### Q1: 手机浏览器可以推流吗？

**答**: ❌ 不可以

**原因**:
1. 浏览器不支持 RTMP 协议
2. 无法访问 TCP 1935 端口
3. Flash 已淘汰

**解决方案**:
- 使用原生 App (Larix Broadcaster)
- 或等待阶段 5 实现 WebRTC 推流

---

### Q2: 手机浏览器可以观看直播吗？

**答**: ✅ 完全可以

**支持情况**:
- iOS Safari: ✅ 原生支持 HLS
- Android Chrome: ✅ hls.js 支持
- 微信浏览器: ✅ 支持

**访问方式**:
```
http://你的服务器IP:5000
```

---

### Q3: 移动端推流延迟高怎么办？

**原因**:
1. 网络上传带宽不足
2. 码率设置过高
3. 关键帧间隔太大

**解决**:

```
Larix 设置优化:

1. 降低码率
   Video Bitrate: 2500 → 1500 kbps

2. 减小关键帧间隔
   Keyframe Interval: 2s → 1s

3. 启用自适应码率
   Adaptive Bitrate: ✅

4. 使用硬件编码
   Hardware Encoder: ✅
```

---

### Q4: 推流时手机很烫怎么办？

**原因**:
- 视频编码消耗 CPU/GPU
- 长时间推流发热正常

**解决**:

```
1. 降低分辨率
   1080p → 720p

2. 降低帧率
   30fps → 24fps

3. 使用硬件编码
   减少 CPU 负载

4. 物理降温
   ├─ 取下手机壳
   ├─ 避免阳光直射
   └─ 使用散热夹
```

---

### Q5: 能同时推多个平台吗？

**答**: ✅ 可以

**方法**:

```
Larix Broadcaster 支持多目标推流:

Settings → Connections
├─ 添加连接 1: 你的服务器
│  rtmp://192.168.1.100:1935/live/key1
│
├─ 添加连接 2: YouTube
│  rtmp://a.rtmp.youtube.com/live2/你的密钥
│
└─ 添加连接 3: Bilibili
   rtmp://live-push.bilivideo.com/live-bvc/你的密钥

开始推流时:
勾选所有要推的平台 → Go Live
```

**注意**:
- 多平台推流流量翻倍
- 上传带宽需求更高
- 手机发热更严重

---

## 未来计划: WebRTC 推流

### 阶段 5 可能实现的功能

```
手机浏览器 → WebRTC → 服务器
```

**优势**:
- ✅ 无需安装 App
- ✅ 打开网页即可推流
- ✅ 超低延迟 (< 1秒)
- ✅ 支持屏幕共享

**技术栈**:
```
前端:
├─ getUserMedia() - 获取摄像头
├─ RTCPeerConnection - WebRTC 连接
└─ WebSocket - 信令通道

后端:
├─ WebRTC 媒体服务器 (Janus/Mediasoup)
├─ FFmpeg - 协议转换
└─ RTMP 服务器 (已有)
```

**敬请期待!** 🚀

---

## 总结

### 当前推流方案

```
✅ Desktop 应用推流
   - OBS Studio (推荐)
   - StreamLabs OBS
   - XSplit
   - FFmpeg

✅ 移动端 App 推流
   - Larix Broadcaster (推荐)
   - Streamlabs Mobile
   - Prism Live Studio

❌ Desktop Web 推流
   - 不支持 (浏览器限制)

❌ Mobile Web 推流
   - 不支持 (浏览器限制)
```

### 当前观看方案

```
✅ Desktop 浏览器
   - Chrome/Firefox/Safari/Edge
   - 完美支持 HLS

✅ Mobile 浏览器
   - iOS Safari (原生支持)
   - Android Chrome (hls.js)
   - 微信浏览器 (支持)
```

### 推荐配置

**手机推流 (Larix)**:
```
分辨率: 1280x720
视频码率: 1500-2500 kbps
音频码率: 128 kbps
帧率: 30 fps
编码器: H.264 (Hardware)
```

**观看体验**:
```
手机浏览器访问:
http://你的服务器IP:5000

自动适配:
├─ 响应式布局
├─ 触摸优化
├─ 自适应码率
└─ 流畅播放
```

---

**📱 开始你的移动端直播之旅吧！**

有问题查看其他文档:
- [QUICKSTART.md](./QUICKSTART.md) - 快速开始
- [RTMP-EXPLAINED.md](./RTMP-EXPLAINED.md) - RTMP 详解
- [README.md](./README.md) - 完整文档
