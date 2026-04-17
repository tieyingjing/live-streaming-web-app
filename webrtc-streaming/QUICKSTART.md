# 🚀 快速开始 - 阶段5: WebRTC + RTMP 双推流系统

10分钟内体验网页端直播推流！

---

## 📋 前置要求

### 必需安装

1. **Node.js** (v14 或更高)
2. **FFmpeg** (用于 WebRTC → RTMP 转换)
3. **Mediasoup** 依赖的系统库

```bash
# macOS
brew install ffmpeg
xcode-select --install

# Ubuntu/Debian
sudo apt install ffmpeg build-essential python3 python3-pip

# 验证
ffmpeg -version
node --version
```

---

## ⚡ 3步快速启动

### 第1步: 安装依赖

```bash
cd webrtc-streaming
npm install
```

**注意**: Mediasoup 需要编译原生模块，首次安装可能需要 5-10 分钟。

### 第2步: 生成 HTTPS 证书 (可选)

WebRTC 需要 HTTPS，但 localhost 可以使用 HTTP。

```bash
# 创建证书目录
mkdir certs

# 生成自签名证书
openssl req -nodes -new -x509 -keyout certs/key.pem \
  -out certs/cert.pem -days 365

# 提示信息可以全部回车跳过
```

### 第3步: 启动服务器

```bash
npm start
```

你会看到:
```
╔════════════════════════════════════════════════════════════════╗
║          🎬 阶段5: WebRTC + RTMP 直播服务器已启动              ║
╚════════════════════════════════════════════════════════════════╝

📡 推流方式:

方式 1: 网页 WebRTC 推流 (新!) ⭐
   └─ 访问: https://localhost:6443/stream.html

方式 2: OBS/FFmpeg RTMP 推流
   └─ rtmp://localhost:1935/live/stream_key
```

---

## 🎯 测试功能

### 方式 1: 网页 WebRTC 推流 ⭐

**步骤**:

1. 浏览器访问:
   ```
   https://localhost:6443/stream.html
   或
   http://localhost:6000/stream.html
   ```

2. 输入流密钥 (例如: `webrtc_test`)

3. 选择视频源:
   - 摄像头
   - 屏幕共享

4. 点击 "开启预览"

5. 允许浏览器访问摄像头/屏幕权限

6. 点击 "开始推流"

7. 等待几秒，推流成功！

**观看直播**:

打开新标签访问:
```
http://localhost:6000
```

输入相同的流密钥 `webrtc_test`，点击播放。

---

### 方式 2: OBS RTMP 推流

**步骤**:

1. 打开 OBS Studio

2. **设置** → **推流**
   ```
   服务: 自定义
   服务器: rtmp://localhost:1935/live
   串流密钥: stream_key
   ```

3. 点击 **开始推流**

4. 浏览器访问: http://localhost:6000

5. 流密钥输入 `stream_key`，点击播放

---

## 🎨 完整演示场景

### 场景: 两种推流方式同时使用

**推流端 1 (网页)**:
```
https://localhost:6443/stream.html
流密钥: room1
```

**推流端 2 (OBS)**:
```
rtmp://localhost:1935/live/room2
```

**观看端**:
```
http://localhost:6000
切换流密钥 room1/room2 观看不同直播
```

---

## 🔧 配置说明

### 修改端口

编辑 `server.js`:

```javascript
const HTTP_PORT = 6000;   // HTTP 端口
const HTTPS_PORT = 6443;  // HTTPS 端口
const WS_PORT = 6001;     // WebSocket 端口
```

### 修改 FFmpeg 路径

```javascript
const rtmpConfig = {
  trans: {
    ffmpeg: '/opt/homebrew/bin/ffmpeg',  // macOS Homebrew
    // ffmpeg: '/usr/bin/ffmpeg',        // Linux
    // ffmpeg: 'C:/ffmpeg/bin/ffmpeg.exe', // Windows
  }
};
```

### 修改 Mediasoup 端口范围

```javascript
const MEDIASOUP_PORT_START = 10000;
const MEDIASOUP_PORT_END = 10100;
```

---

## 📊 架构说明

```
┌─────────────────┐
│  网页推流端      │ getUserMedia()
│  (浏览器)        │
└────────┬────────┘
         │ WebRTC
         ↓
┌─────────────────┐
│ Mediasoup       │ 接收 WebRTC 流
│ 媒体服务器       │
└────────┬────────┘
         │ RTP
         ↓
┌─────────────────┐
│ FFmpeg 转换器    │ WebRTC → RTMP
└────────┬────────┘
         │ RTMP
         ↓
┌─────────────────┐       ┌─────────────────┐
│ OBS 推流端       │ RTMP  │ RTMP 服务器      │
└────────┬────────┘───────│ (node-media-    │
         ↓                │  server)        │
                          └────────┬────────┘
                                   │ HLS 转码
                                   ↓
                          ┌─────────────────┐
                          │ 观众播放器       │
                          │ (HLS)           │
                          └─────────────────┘
```

---

## 🔧 常见问题

### Q1: Mediasoup 安装失败

**错误**: `npm install` 时 mediasoup 编译失败

**解决**:

```bash
# macOS
xcode-select --install

# Ubuntu
sudo apt install build-essential python3

# 清理重装
rm -rf node_modules package-lock.json
npm install
```

### Q2: WebRTC 连接失败

**错误**: 浏览器无法建立 WebRTC 连接

**检查**:
1. 是否使用 HTTPS 或 localhost?
2. 防火墙是否开放端口 10000-10100?
3. 浏览器控制台有什么错误?

**解决**:
```bash
# 检查端口
lsof -i :10000-10100

# 生成 HTTPS 证书
mkdir certs
openssl req -x509 -newkey rsa:4096 -keyout certs/key.pem \
  -out certs/cert.pem -days 365 -nodes
```

### Q3: FFmpeg 找不到

**错误**: `spawn /opt/homebrew/bin/ffmpeg ENOENT`

**解决**:
```bash
# 查找 FFmpeg 位置
which ffmpeg

# 修改 server.js 中的路径
trans: {
  ffmpeg: '/你的/ffmpeg/路径',
}
```

### Q4: 推流成功但看不到画面

**检查清单**:
1. RTMP 服务器是否正常启动?
2. HLS 文件是否生成? (`ls media/live/`)
3. 播放器中流密钥是否正确?
4. 浏览器控制台有错误吗?

**调试**:
```bash
# 检查 RTMP 流
curl http://localhost:8000/api/streams

# 检查 HLS 文件
ls -la media/live/webrtc_test/

# 查看服务器日志
# 服务器会实时输出日志
```

---

## 🎓 学习目标

完成本阶段后，你将掌握:

✅ WebRTC 推流原理
✅ Mediasoup 媒体服务器
✅ WebRTC ↔ RTMP 协议转换
✅ 浏览器媒体 API (getUserMedia/getDisplayMedia)
✅ 双推流模式架构
✅ 信令服务器设计

---

## 🚀 下一步

### 进阶实验

1. **画面合成**: 在网页端实现画中画
2. **美颜滤镜**: 添加 CSS/WebGL 滤镜
3. **多人连麦**: 多路 WebRTC 流合并
4. **屏幕+摄像头**: 同时推送两路流

### 性能优化

1. **降低延迟**: 调整 HLS 分片时长
2. **编码优化**: 调整 Mediasoup 编码参数
3. **带宽自适应**: 动态调整码率

---

## 💡 提示

- **HTTPS 要求**: WebRTC 必须使用 HTTPS (localhost 除外)
- **CPU 占用**: WebRTC → RTMP 转换会占用 CPU
- **端口范围**: Mediasoup 需要连续的端口范围 (默认 10000-10100)
- **浏览器支持**: 推荐 Chrome/Edge，Safari 部分功能受限

---

准备好了吗? 运行 `npm start` 开始你的 WebRTC 直播之旅! 🎬
