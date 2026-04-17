# 🎬 阶段4: 实时直播系统

完整的直播流媒体服务器,支持 RTMP 推流、HLS 播放、实时弹幕和自动录制。

---

## ✨ 核心功能

### 1. 📡 RTMP 推流服务器
- 基于 `node-media-server`
- 支持 Desktop 应用推流 (OBS、FFmpeg 等)
- 支持移动端 App 推流 (Larix、Streamlabs Mobile)
- ❌ 暂不支持浏览器推流 (详见 [MOBILE-STREAMING.md](./MOBILE-STREAMING.md))
- 自动转码为 HLS 多码率流
- 实时流状态监控

### 2. 🎥 HLS 自适应播放
- 多码率自动切换 (360p/720p/1080p)
- 低延迟播放 (2-5秒)
- 基于 hls.js 的播放器
- 实时统计信息

### 3. 💬 实时弹幕系统
- WebSocket 双向通信
- 弹幕飘屏动画
- 聊天室功能
- 弹幕历史记录

### 4. 📹 自动录制
- 推流自动录制为 MP4
- 录制文件保存到本地
- 支持回放

---

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────────────────┐
│                     推流端 (Broadcaster)                 │
│  OBS Studio / FFmpeg / StreamLabs / XSplit              │
└─────────────────┬───────────────────────────────────────┘
                  │ RTMP Stream
                  │ rtmp://localhost:1935/live/stream_key
                  ▼
┌─────────────────────────────────────────────────────────┐
│               RTMP 服务器 (Node Media Server)            │
│  - 接收 RTMP 推流 (端口 1935)                            │
│  - 流状态管理                                            │
│  - 事件通知                                              │
└─────┬───────────────────┬───────────────────┬───────────┘
      │                   │                   │
      │ HLS 转码          │ MP4 录制          │ 事件推送
      ▼                   ▼                   ▼
┌──────────┐      ┌──────────────┐    ┌──────────────┐
│ HLS 流   │      │  recordings/ │    │  WebSocket   │
│ (8000)   │      │  live-xxx.mp4│    │  服务器      │
│          │      │              │    │  (5001)      │
│ master   │      │ 自动录制文件  │    │              │
│ 360p     │      │              │    │ - 弹幕推送    │
│ 720p     │      │              │    │ - 流状态通知  │
│ 1080p    │      │              │    │ - 聊天消息    │
└────┬─────┘      └──────────────┘    └──────┬───────┘
     │                                        │
     └────────────────┬───────────────────────┘
                      ▼
            ┌─────────────────────┐
            │   Express 服务器     │
            │   (端口 5000)        │
            │  - 静态文件服务      │
            │  - REST API         │
            │  - 播放器页面        │
            └──────────┬──────────┘
                       │ HTTP
                       ▼
            ┌─────────────────────┐
            │    网页播放器        │
            │  - HLS 播放         │
            │  - 弹幕显示         │
            │  - 实时聊天         │
            │  - 统计信息         │
            └─────────────────────┘
                       │
                       ▼
                [ 观众浏览器 ]
```

---

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 启动服务器

```bash
npm start
```

### 使用 OBS 推流

1. **设置 → 推流**
2. 服务: **自定义**
3. 服务器: `rtmp://localhost:1935/live`
4. 串流密钥: `stream_key`
5. **开始推流**

### 观看直播

浏览器访问: http://localhost:5000

---

## 📁 项目结构

```
live-streaming/
├── server.js                # 主服务器 (RTMP + WebSocket + HTTP)
├── package.json             # 依赖配置
├── QUICKSTART.md            # 快速开始指南 👈 新手从这里开始
├── README.md                # 本文件
├── public/                  # 前端文件
│   ├── index.html           # 播放器页面
│   ├── app.js               # 播放器逻辑 + 弹幕系统
│   └── broadcast.html       # 推流指南页面
├── recordings/              # 录制文件目录 (自动创建)
│   └── live-stream_key-*.mp4
└── media/                   # HLS 文件目录 (自动创建)
    └── live/
        └── stream_key/
            ├── index.m3u8   # HLS 主播放列表
            ├── 360p.m3u8
            ├── 720p.m3u8
            ├── 1080p.m3u8
            └── *.ts         # 视频分片
```

---

## 🔌 端口说明

| 端口 | 协议 | 用途 | 访问方式 |
|------|------|------|----------|
| 1935 | RTMP | 推流服务器 | `rtmp://localhost:1935/live/{key}` |
| 5000 | HTTP | 播放器页面 | http://localhost:5000 |
| 5001 | WebSocket | 弹幕服务器 | `ws://localhost:5001` |
| 8000 | HTTP | HLS 流服务 | http://localhost:8000/live/{key}/index.m3u8 |

---

## 🎯 核心技术详解

### 1. RTMP 推流服务器

**库**: `node-media-server`

**配置**:
```javascript
{
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,        // 缓存关键帧
    ping: 30,
    ping_timeout: 60
  },
  trans: {
    ffmpeg: '/opt/homebrew/bin/ffmpeg',
    tasks: [
      {
        app: 'live',
        hls: true,            // 转码为 HLS
        hlsFlags: '[hls_time=2:hls_list_size=3:hls_flags=delete_segments]',
        rec: true,            // 自动录制
        recPath: './recordings'
      }
    ]
  }
}
```

**事件监听**:
```javascript
nms.on('prePublish', (id, StreamPath, args) => {
  console.log('推流开始:', StreamPath);
  // 通知所有客户端直播开始
});

nms.on('donePublish', (id, StreamPath, args) => {
  console.log('推流结束:', StreamPath);
  // 通知所有客户端直播结束
});
```

### 2. WebSocket 弹幕系统

**消息格式**:
```javascript
// 客户端发送弹幕
{
  type: 'danmaku',
  username: '观众1',
  text: '666',
  color: '#FFFFFF'
}

// 服务器广播给所有客户端
{
  type: 'danmaku',
  id: 1234567890,
  username: '观众1',
  text: '666',
  color: '#FFFFFF',
  timestamp: '2024-01-01T12:00:00.000Z'
}
```

**服务端实现**:
```javascript
const wss = new WebSocket.Server({ port: 5001 });
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);

  ws.on('message', (message) => {
    const data = JSON.parse(message);
    // 广播给所有客户端
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  });
});
```

### 3. HLS 播放器

**使用 hls.js**:
```javascript
const hls = new Hls({
  enableWorker: true,
  lowLatencyMode: true,     // 低延迟模式
  backBufferLength: 90
});

hls.loadSource('http://localhost:8000/live/stream_key/index.m3u8');
hls.attachMedia(video);

hls.on(Hls.Events.MANIFEST_PARSED, () => {
  video.play();
});
```

### 4. 弹幕动画

**CSS 动画**:
```css
.danmaku-item {
  position: absolute;
  animation: danmaku-scroll 8s linear;
}

@keyframes danmaku-scroll {
  from { transform: translateX(100%); }
  to { transform: translateX(-100%); }
}
```

**JavaScript 控制**:
```javascript
function showDanmaku(text, color) {
  const danmaku = document.createElement('div');
  danmaku.className = 'danmaku-item';
  danmaku.textContent = text;
  danmaku.style.color = color;
  danmaku.style.top = Math.random() * 80 + '%';

  danmakuCanvas.appendChild(danmaku);

  setTimeout(() => {
    danmakuCanvas.removeChild(danmaku);
  }, 8000);
}
```

---

## 📊 实时统计

播放器显示以下统计信息:

- **当前画质**: 360p / 720p / 1080p
- **缓冲健康度**: 已缓冲的秒数
- **弹幕数**: 本次会话发送的弹幕总数
- **在线观众**: 当前在线人数 (简化版,实际应在服务端统计)

---

## 🎨 页面功能

### 播放器页面 (`index.html`)

- ✅ 视频播放器
- ✅ 流密钥输入
- ✅ 播放控制
- ✅ 弹幕飘屏显示
- ✅ 实时聊天列表
- ✅ 弹幕发送
- ✅ 统计信息

### 推流指南页面 (`broadcast.html`)

- ✅ 摄像头/屏幕预览
- ✅ 推流配置说明
- ✅ OBS 设置教程
- ✅ FFmpeg 命令示例

---

## 🛠️ 推流工具

### 1. OBS Studio (推荐)

**优点**:
- 免费开源
- 功能强大
- 支持场景切换
- 支持滤镜和插件

**配置**:
```
服务: 自定义
服务器: rtmp://localhost:1935/live
串流密钥: stream_key
```

### 2. FFmpeg

**推流本地视频**:
```bash
ffmpeg -re -i video.mp4 -c:v copy -c:a aac -f flv \
  rtmp://localhost:1935/live/stream_key
```

**推流摄像头 (macOS)**:
```bash
ffmpeg -f avfoundation -i "0:0" -c:v libx264 -preset ultrafast \
  -tune zerolatency -c:a aac -f flv \
  rtmp://localhost:1935/live/stream_key
```

**推流摄像头 (Linux)**:
```bash
ffmpeg -f v4l2 -i /dev/video0 -f alsa -i default -c:v libx264 \
  -preset ultrafast -tune zerolatency -c:a aac -f flv \
  rtmp://localhost:1935/live/stream_key
```

### 3. 其他工具

- **StreamLabs OBS**: OBS 的增强版
- **XSplit**: 商业软件,功能丰富
- **vMix**: 专业级直播软件

---

## 🧪 测试场景

### 场景1: 单人直播

1. 启动服务器
2. OBS 推流
3. 浏览器打开播放器
4. 发送弹幕测试

### 场景2: 多人观看

1. 启动服务器
2. OBS 推流
3. 打开多个浏览器标签 (模拟多个观众)
4. 互发弹幕,观察实时同步

### 场景3: 录制回放

1. 推流一段时间
2. 停止推流
3. 查看 `recordings/` 目录
4. 使用播放器播放录制文件

### 场景4: 多路流

```bash
# 推流到不同的流密钥
rtmp://localhost:1935/live/room1
rtmp://localhost:1935/live/room2

# 播放不同的流
http://localhost:5000?key=room1
http://localhost:5000?key=room2
```

---

## 🔧 配置说明

### FFmpeg 路径

不同系统的 FFmpeg 路径:

```javascript
// macOS (Homebrew)
ffmpeg: '/opt/homebrew/bin/ffmpeg'

// macOS (Intel)
ffmpeg: '/usr/local/bin/ffmpeg'

// Linux
ffmpeg: '/usr/bin/ffmpeg'

// Windows
ffmpeg: 'C:/ffmpeg/bin/ffmpeg.exe'
```

### 转码参数

```javascript
hlsFlags: '[hls_time=2:hls_list_size=3:hls_flags=delete_segments]'

// hls_time=2         每个分片 2 秒
// hls_list_size=3    播放列表保留 3 个分片
// delete_segments    自动删除旧分片
```

### 录制参数

```javascript
recFlags: '[movflags=frag_keyframe+empty_moov]'

// frag_keyframe  关键帧分片
// empty_moov     快速启动
```

---

## 📈 性能优化

### 1. 降低延迟

```javascript
// HLS 配置
hls: true,
hlsFlags: '[hls_time=1:hls_list_size=2]'  // 更短的分片

// 播放器配置
new Hls({
  lowLatencyMode: true,
  maxBufferLength: 3,
  maxMaxBufferLength: 5
})
```

### 2. 优化转码

```javascript
// 使用更快的 preset
trans: {
  tasks: [
    {
      app: 'live',
      hls: true,
      hlsFlags: '[hls_time=2:hls_list_size=3]',
      vcParams: [
        '-c:v', 'libx264',
        '-preset', 'veryfast',  // ultrafast / veryfast / faster
        '-tune', 'zerolatency'
      ]
    }
  ]
}
```

### 3. 限制码率

```javascript
vcParams: [
  '-c:v', 'libx264',
  '-b:v', '2000k',        // 视频码率 2 Mbps
  '-maxrate', '2500k',    // 最大码率
  '-bufsize', '5000k'     // 缓冲区大小
]
```

---

## 🚨 常见问题

### Q1: 推流后看不到画面

**检查**:
1. FFmpeg 是否正确安装?
2. FFmpeg 路径是否正确?
3. OBS 是否显示 "正在推流"?
4. 浏览器控制台有报错吗?

**调试**:
```bash
# 检查 RTMP 流
curl http://localhost:8000/api/streams

# 查看 HLS 文件
ls -la media/live/stream_key/
```

### Q2: 弹幕不同步

**原因**: WebSocket 连接断开

**解决**:
- 检查端口 5001 是否被占用
- 查看浏览器控制台的 WebSocket 连接状态

### Q3: 录制文件损坏

**原因**: 推流异常中断

**解决**:
```javascript
recFlags: '[movflags=frag_keyframe+empty_moov]'
```

### Q4: CPU 占用过高

**原因**: 转码多个码率消耗 CPU

**解决**:
- 减少转码码率数量
- 使用更快的 preset
- 使用硬件加速 (GPU)

---

## 🎓 学习成果

完成本阶段后,你已经掌握:

✅ **RTMP 推流协议**
- RTMP 服务器搭建
- 推流工具使用
- 流状态管理

✅ **实时转码**
- FFmpeg 命令行
- RTMP 转 HLS
- 多码率转码

✅ **WebSocket 通信**
- WebSocket 服务器
- 双向实时通信
- 消息广播

✅ **弹幕系统**
- 弹幕动画实现
- 聊天室功能
- 历史记录

✅ **直播录制**
- 自动录制配置
- MP4 格式输出
- 文件管理

---

## 🚀 下一步方向

### 阶段 5: 生产级优化

- [ ] 用户认证系统
- [ ] 推流鉴权
- [ ] 观众在线统计
- [ ] 数据库集成 (Redis, MongoDB)
- [ ] CDN 集成
- [ ] 负载均衡
- [ ] DRM 加密
- [ ] 监控和日志

### 进阶功能

- [ ] 多主播连麦
- [ ] 礼物打赏系统
- [ ] 弹幕审核
- [ ] 美颜滤镜
- [ ] 智能封面提取
- [ ] 视频剪辑
- [ ] 回放时移

---

## 📚 学习资源

### 本项目文档

**快速开始**:
- [QUICKSTART.md](./QUICKSTART.md) - 10分钟快速上手 ⭐

**技术深入**:
- [RTMP-EXPLAINED.md](./RTMP-EXPLAINED.md) - RTMP 协议深度解析 📡
- [RTMP-QUICKREF.md](./RTMP-QUICKREF.md) - RTMP 快速参考 📋

**移动端**:
- [MOBILE-STREAMING.md](./MOBILE-STREAMING.md) - 移动端推流/观看方案 📱

**总结**:
- [SUMMARY.md](./SUMMARY.md) - 实现总结

### 官方文档

- [Node Media Server](https://github.com/illuspas/Node-Media-Server)
- [hls.js](https://github.com/video-dev/hls.js/)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [OBS Studio](https://obsproject.com/)

### 协议规范

- [RTMP Specification](https://rtmp.veriskope.com/docs/spec/)
- [HLS RFC 8216](https://datatracker.ietf.org/doc/html/rfc8216)
- [WebSocket RFC 6455](https://datatracker.ietf.org/doc/html/rfc6455)

### 教程推荐

- [FFmpeg 官方文档](https://ffmpeg.org/documentation.html)
- [直播技术原理](https://github.com/ossrs/srs/wiki)
- [WebRTC vs RTMP](https://bloggeek.me/webrtc-vs-rtmp/)

---

## 🙏 致谢

本项目使用了以下开源项目:

- [node-media-server](https://github.com/illuspas/Node-Media-Server) - RTMP 服务器
- [hls.js](https://github.com/video-dev/hls.js/) - HLS 播放器
- [ws](https://github.com/websockets/ws) - WebSocket 库
- [Express](https://expressjs.com/) - Web 框架
- [FFmpeg](https://ffmpeg.org/) - 多媒体处理

---

**🎉 恭喜你完成了阶段4的学习！你已经掌握了直播系统的核心技术！**

有问题? 查看 [QUICKSTART.md](./QUICKSTART.md) 或提交 Issue
