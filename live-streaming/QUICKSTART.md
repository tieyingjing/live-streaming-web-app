# 🚀 快速开始 - 阶段4: 实时直播系统

10分钟内启动你的第一个直播流媒体服务器!

---

## 📋 前置要求

### 必需安装

1. **Node.js** (v14 或更高)
   ```bash
   node --version  # 检查版本
   ```

2. **FFmpeg** (用于 RTMP 转 HLS)
   ```bash
   # macOS
   brew install ffmpeg

   # Ubuntu/Debian
   sudo apt install ffmpeg

   # Windows
   # 从 https://ffmpeg.org/download.html 下载
   ```

3. **OBS Studio** (推流工具，推荐)
   - 下载: https://obsproject.com/

---

## ⚡ 3步快速启动

### 第1步: 安装依赖

```bash
cd live-streaming
npm install
```

### 第2步: 启动服务器

```bash
npm start
```

你会看到:
```
╔════════════════════════════════════════════════════════════════╗
║                   🎬 直播服务器已启动                          ║
╚════════════════════════════════════════════════════════════════╝

📡 RTMP 推流地址:
   rtmp://localhost:1935/live/stream_key

📺 播放器访问:
   http://localhost:5000

💬 弹幕服务器:
   ws://localhost:5001
```

### 第3步: 开始推流

#### 选项A: 使用 OBS Studio (推荐)

1. 打开 OBS Studio
2. **设置** → **推流**
3. 配置如下:
   - 服务: **自定义**
   - 服务器: `rtmp://localhost:1935/live`
   - 串流密钥: `stream_key`
4. 点击 **开始推流**

#### 选项B: 使用 FFmpeg 推流本地视频

```bash
# 推流 MP4 文件
ffmpeg -re -i your-video.mp4 -c:v copy -c:a aac -f flv \
  rtmp://localhost:1935/live/stream_key

# 推流摄像头 (macOS)
ffmpeg -f avfoundation -i "0:0" -c:v libx264 -preset ultrafast \
  -tune zerolatency -c:a aac -f flv \
  rtmp://localhost:1935/live/stream_key
```

---

## 🎯 测试功能

### 1. 播放直播流

打开浏览器访问:
```
http://localhost:5000
```

- 输入流密钥: `stream_key`
- 点击 **开始播放**
- 你应该能看到直播画面!

### 2. 发送弹幕

在播放页面:
1. 输入昵称 (可选)
2. 输入弹幕内容
3. 点击 **发送**
4. 弹幕会飘过视频画面!

### 3. 查看录制

直播会自动录制到 `recordings/` 目录:
```bash
ls recordings/
# 输出: live-stream_key-2024-xxx.mp4
```

---

## 🎨 完整功能演示

### 多人观看 + 实时弹幕

1. **推流端**: 使用 OBS 推流
2. **观众1**: 打开 http://localhost:5000
3. **观众2**: 再打开一个浏览器标签 http://localhost:5000
4. **互动**: 两个观众都可以发送弹幕,实时同步!

### 测试自适应码率

直播会自动转码为多码率:
- 1080p (高画质)
- 720p (中画质)
- 360p (低画质)

播放器会根据网速自动切换!

---

## 🛠️ 自定义配置

### 修改端口

编辑 `server.js`:

```javascript
const HTTP_PORT = 5000;  // 修改这里
const WS_PORT = 5001;    // 修改这里
```

### 修改 FFmpeg 路径

编辑 `server.js` 中的 `config.trans.ffmpeg`:

```javascript
trans: {
  ffmpeg: '/opt/homebrew/bin/ffmpeg',  // macOS Homebrew
  // ffmpeg: '/usr/bin/ffmpeg',        // Linux
  // ffmpeg: 'C:/ffmpeg/bin/ffmpeg.exe', // Windows
  // ...
}
```

### 修改录制路径

```javascript
rec: true,
recPath: './recordings',  // 修改这里
```

---

## 📊 架构说明

```
┌─────────────┐
│  OBS Studio │ 推流 RTMP
│   (推流端)   │────────────┐
└─────────────┘            │
                           ▼
                    ┌──────────────┐
                    │ RTMP 服务器   │ (端口 1935)
                    │ node-media-   │
                    │   server      │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
         转码 HLS      录制 MP4    事件通知
              │            │            │
              ▼            ▼            ▼
        ┌─────────┐  ┌──────────┐  ┌──────────┐
        │ HLS 流  │  │recordings│  │WebSocket │
        │ (8000)  │  │   目录   │  │  (5001)  │
        └────┬────┘  └──────────┘  └────┬─────┘
             │                           │
             └───────────┐     ┐─────────┘
                         ▼     ▼
                    ┌──────────────┐
                    │  网页播放器   │ (端口 5000)
                    │  + 弹幕系统  │
                    └──────────────┘
                           │
                           ▼
                    [ 观众浏览器 ]
```

---

## 🔧 常见问题

### Q1: FFmpeg 路径错误

**错误**: `spawn /opt/homebrew/bin/ffmpeg ENOENT`

**解决**:
```bash
# 查找 FFmpeg 位置
which ffmpeg

# 修改 server.js 中的路径
trans: {
  ffmpeg: '/你的/ffmpeg/路径',
  // ...
}
```

### Q2: 推流后看不到画面

**检查清单**:
1. 服务器是否正常启动?
2. OBS 显示 "正在推流" ?
3. 播放器中流密钥是否正确?
4. 浏览器控制台有错误吗?

**调试命令**:
```bash
# 检查 RTMP 流
curl http://localhost:8000/api/streams

# 检查 HLS 文件
ls media/live/stream_key/
```

### Q3: 弹幕服务器连接失败

**检查**: WebSocket 端口 5001 是否被占用

```bash
# macOS/Linux
lsof -i :5001

# 如果被占用,修改 server.js 中的 WS_PORT
```

### Q4: 录制文件在哪里?

录制文件保存在 `recordings/` 目录:
```bash
ls -lh recordings/
```

文件名格式: `live-{流密钥}-{时间戳}.mp4`

---

## 🎓 学习目标

完成本阶段后,你将掌握:

✅ RTMP 推流服务器搭建
✅ FFmpeg 实时转码 (RTMP → HLS)
✅ WebSocket 实时通信
✅ 弹幕系统实现
✅ 直播录制和回放
✅ HLS 低延迟播放

---

## 🚀 下一步

### 进阶实验

1. **多路推流**: 使用不同的流密钥推多路流
   ```
   rtmp://localhost:1935/live/room1
   rtmp://localhost:1935/live/room2
   ```

2. **美颜滤镜**: 在 OBS 中添加滤镜效果

3. **弹幕样式**: 修改 `public/app.js` 自定义弹幕动画

4. **鉴权系统**: 添加推流密钥验证

### 学习资源

- [OBS 使用教程](https://obsproject.com/wiki/)
- [RTMP 协议详解](https://rtmp.veriskope.com/docs/spec/)
- [HLS 规范](https://datatracker.ietf.org/doc/html/rfc8216)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)

---

## 💡 提示

- **低延迟**: RTMP 推流延迟约 2-5 秒
- **带宽**: 1080p 推流约需 3-6 Mbps 上传带宽
- **性能**: 转码会占用 CPU,建议 4 核以上
- **生产环境**: 建议使用 Nginx-RTMP 模块

---

准备好了吗? 运行 `npm start` 开始你的直播之旅! 🎬
