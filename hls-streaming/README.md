# HLS 流媒体服务器 - 阶段 3

一个完整的 HLS 自适应流媒体系统，演示了 YouTube/Netflix 级别的视频播放技术。

## 核心功能

- ✅ **多码率转码** - 自动生成 360p / 720p / 1080p
- ✅ **自适应比特率 (ABR)** - 根据网速自动切换画质
- ✅ **视频分片** - 每段 6 秒，边下载边播放
- ✅ **HLS 协议** - 工业标准流媒体协议
- ✅ **跨浏览器支持** - Safari 原生 + hls.js (Chrome/Firefox)
- ✅ **实时统计** - 当前画质、下载速度、缓冲进度

---

## 快速开始

### 1. 安装 FFmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Linux (Ubuntu):**
```bash
sudo apt update && sudo apt install ffmpeg
```

验证安装：
```bash
ffmpeg -version
```

### 2. 安装依赖

```bash
cd hls-streaming
npm install
```

### 3. 准备视频

将你的视频文件放入 `source-videos/` 文件夹：

```bash
# 示例：下载测试视频
curl -o source-videos/sample.mp4 \
  https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_10mb.mp4

# 或复制你自己的视频
cp ~/Downloads/my-video.mp4 source-videos/
```

### 4. 转码视频

```bash
npm run transcode source-videos/sample.mp4
```

**转码过程：**

```
🎬 开始转码: 360p (低画质 - 适合慢速网络)
   分辨率: 640x360
   视频码率: 800k
   进度: 100%
   ✅ 360p 转码完成

🎬 开始转码: 720p (中画质 - 适合一般网络)
   分辨率: 1280x720
   视频码率: 2500k
   进度: 100%
   ✅ 720p 转码完成

🎬 开始转码: 1080p (高画质 - 适合快速网络)
   分辨率: 1920x1080
   视频码率: 5000k
   进度: 100%
   ✅ 1080p 转码完成

📝 生成主播放列表: master.m3u8
✅ 转码完成！
```

转码后的文件结构：

```
hls-output/
└── sample/
    ├── master.m3u8          # 主播放列表
    ├── 360p.m3u8           # 360p 播放列表
    ├── 360p_000.ts         # 360p 分片
    ├── 360p_001.ts
    ├── ...
    ├── 720p.m3u8
    ├── 720p_000.ts
    ├── ...
    ├── 1080p.m3u8
    └── 1080p_000.ts
```

### 5. 启动服务器

```bash
npm start
```

输出：

```
============================================================
🎬 HLS 流媒体服务器
============================================================
🌐 服务器地址: http://localhost:4000
📁 HLS 输出目录: /path/to/hls-output
============================================================

✅ 找到 1 个 HLS 视频

============================================================
```

### 6. 在浏览器中播放

访问 http://localhost:4000

---

## 项目结构

```
hls-streaming/
├── source-videos/           # 原始视频文件
│   └── sample.mp4
├── hls-output/             # 转码后的 HLS 文件
│   └── sample/
│       ├── master.m3u8     # 主播放列表
│       ├── 360p.m3u8       # 各码率播放列表
│       ├── 720p.m3u8
│       ├── 1080p.m3u8
│       └── *.ts            # 视频分片
├── public/
│   └── index.html          # HLS 播放器界面
├── transcode.js            # 转码脚本
├── hls-server.js           # HLS 服务器
├── package.json
├── README.md               # 本文档
├── HLS-EXPLAINED.md        # HLS 技术详解
└── SETUP.md                # 安装指南
```

---

## 核心技术

### 1. HLS 协议

HLS (HTTP Live Streaming) 是 Apple 开发的流媒体协议，被广泛应用于：

- YouTube
- Netflix
- Twitch
- Apple TV+
- Vimeo

**工作原理：**

```
原始视频
    ↓
FFmpeg 转码 → 多个码率 (360p, 720p, 1080p)
    ↓
每个码率切成小片段 (6秒一片)
    ↓
生成播放列表 (.m3u8)
    ↓
浏览器根据网速选择合适的码率
    ↓
边下载边播放
```

### 2. 自适应比特率 (ABR)

```
用户网络状态变化:
快速 WiFi → 3G → 4G → WiFi

播放器自动切换:
1080p → 360p → 720p → 1080p

用户体验:
始终流畅，无需手动调整
```

### 3. 视频分片

```
60秒视频 → 10个分片 (每个6秒)

优点:
✅ 快速启动播放 (只需下载第一片)
✅ 拖动进度条快 (直接下载目标分片)
✅ 切换画质快 (无需重新下载整个视频)
✅ CDN 友好 (小文件易缓存)
```

---

## API 接口

### 获取视频列表

```http
GET /api/videos
```

**响应：**

```json
[
  {
    "name": "sample",
    "url": "/hls/sample/master.m3u8",
    "size": 15728640,
    "qualities": ["360p", "720p", "1080p"],
    "hasMasterPlaylist": true
  }
]
```

### 获取视频信息

```http
GET /api/video/:videoName/info
```

**响应：**

```json
{
  "name": "sample",
  "qualities": [
    {
      "bandwidth": 800000,
      "resolution": "640x360",
      "playlist": "360p.m3u8",
      "segments": 10
    },
    {
      "bandwidth": 2500000,
      "resolution": "1280x720",
      "playlist": "720p.m3u8",
      "segments": 10
    }
  ],
  "url": "/hls/sample/master.m3u8"
}
```

### 访问 HLS 文件

```http
GET /hls/:videoName/master.m3u8   # 主播放列表
GET /hls/:videoName/360p.m3u8     # 360p 播放列表
GET /hls/:videoName/360p_000.ts   # 360p 第一个分片
```

---

## 转码参数定制

修改 `transcode.js` 中的 `PROFILES` 数组：

```javascript
const PROFILES = [
    {
        name: '360p',
        width: 640,
        height: 360,
        videoBitrate: '800k',    // 视频码率
        audioBitrate: '96k',     // 音频码率
        description: '低画质'
    },
    {
        name: '720p',
        width: 1280,
        height: 720,
        videoBitrate: '2500k',
        audioBitrate: '128k',
        description: '中画质'
    },
    // 添加更多码率...
];
```

### 添加 4K 支持

```javascript
{
    name: '2160p',
    width: 3840,
    height: 2160,
    videoBitrate: '15000k',
    audioBitrate: '256k',
    description: '4K 超高清'
}
```

### 调整分片大小

```javascript
// 在 transcode.js 的 transcodeToProfile 函数中
.outputOptions([
    '-f hls',
    '-hls_time 6',  // 改为 4 或 8 等
    // ...
])
```

---

## 性能优化

### 1. 转码速度优化

```javascript
// 使用更快的编码预设
.outputOptions([
    '-preset fast',  // ultrafast, fast, medium, slow
    // ...
])
```

### 2. 文件大小优化

```javascript
// 降低码率
{
    name: '360p',
    videoBitrate: '600k',  // 原来 800k
    // ...
}
```

### 3. 并行转码

修改 `transcode.js`，使用 `Promise.all`:

```javascript
// 并行转码所有码率
await Promise.all(PROFILES.map(profile =>
    transcodeToProfile(inputPath, outputDir, profile)
));
```

---

## 浏览器支持

| 浏览器 | HLS 支持 | 实现方式 |
|--------|---------|---------|
| Safari (macOS/iOS) | ✅ 原生支持 | 直接使用 `<video src="master.m3u8">` |
| Chrome | ✅ 通过 hls.js | 使用 hls.js 库 |
| Firefox | ✅ 通过 hls.js | 使用 hls.js 库 |
| Edge | ✅ 通过 hls.js | 使用 hls.js 库 |

---

## 常见问题

### Q1: 转码很慢怎么办？

**答:**
- 使用更快的编码预设：`-preset fast`
- 减少码率数量（只保留 360p 和 720p）
- 使用 GPU 加速（需要特殊配置）

### Q2: 文件太大了

**答:**
- 降低视频码率
- 减少音频码率
- 删除不常用的高码率版本

### Q3: 播放卡顿

**答:**
- 检查网络速度
- 减小分片大小（`-hls_time 4`）
- 降低码率

### Q4: Safari 能播放，Chrome 不行

**答:**
- 检查 hls.js 是否加载成功
- 打开浏览器控制台查看错误
- 确保服务器返回正确的 MIME 类型

---

## 与阶段 2 对比

| 特性 | 阶段 2 (Range Requests) | 阶段 3 (HLS) |
|------|------------------------|--------------|
| 文件结构 | 单个 MP4 | 多个 .ts + .m3u8 |
| 画质切换 | ❌ | ✅ 自动 |
| 网络适应 | ❌ | ✅ 自适应 |
| 启动速度 | 快 | 稍慢 |
| 带宽效率 | 一般 | 优秀 |
| CDN 友好 | 一般 | 优秀 |
| 实时直播 | ❌ | ✅ |
| 实现复杂度 | 简单 | 中等 |

---

## 进阶学习

### 已完成 ✅

- HTTP Range Requests (阶段 2)
- HLS 多码率流媒体 (阶段 3)
- FFmpeg 视频转码
- 自适应比特率播放

### 下一步 🎯

**阶段 4: 实时直播**
- RTMP 推流服务器
- WebRTC 低延迟直播
- 弹幕系统

**阶段 5: 生产级优化**
- 视频上传和自动转码队列
- CDN 集成
- DRM 视频加密
- 监控和日志

---

## 学习资源

- [HLS-EXPLAINED.md](./HLS-EXPLAINED.md) - HLS 技术详解
- [SETUP.md](./SETUP.md) - 安装和配置指南
- [FFmpeg 官方文档](https://ffmpeg.org/documentation.html)
- [hls.js GitHub](https://github.com/video-dev/hls.js/)
- [Apple HLS 规范](https://developer.apple.com/streaming/)

---

## 总结

通过这个项目，你已经掌握了：

1. ✅ HLS 协议的工作原理
2. ✅ 使用 FFmpeg 转码视频
3. ✅ 生成多码率播放列表
4. ✅ 实现自适应比特率播放
5. ✅ 理解视频分片和流式传输

**这就是 YouTube、Netflix 等视频平台的核心技术！**

准备好进入阶段 4 了吗？🚀
