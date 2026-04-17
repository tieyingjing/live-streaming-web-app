# 视频流服务器 - 阶段 2：简单视频点播

一个简单的 Node.js 视频流服务器，演示流媒体的核心技术。

## 核心技术原理

### 1. HTTP Range Requests（范围请求）

这是视频流的核心技术。当你拖动 YouTube 视频进度条时，浏览器并不需要重新下载整个视频，而是通过 Range 请求获取特定的字节范围。

**请求示例：**
```http
GET /video/sample.mp4 HTTP/1.1
Range: bytes=0-1024
```

**响应示例：**
```http
HTTP/1.1 206 Partial Content
Content-Range: bytes 0-1024/1048576
Content-Length: 1025
Content-Type: video/mp4
```

### 2. 为什么需要 Range Requests？

- **快速启动播放**：只下载开头的几 MB，立即开始播放
- **拖拽进度条**：跳转到任意位置，只下载那个位置的数据
- **节省带宽**：用户可能不会看完整个视频
- **断点续传**：网络中断后，可以从上次位置继续下载

### 3. 关键代码解析

**video-server.js:18-40** - Range 请求处理：

```javascript
if (range) {
    // 解析 Range 头：bytes=0-1024
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    // 计算实际读取的长度
    const chunkSize = (end - start) + 1;

    // 创建可读流（只读取指定范围）
    const file = fs.createReadStream(videoPath, { start, end });

    // 返回 206 Partial Content
    res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'video/mp4',
    });
}
```

## 项目结构

```
video-streaming/
├── video-server.js       # 服务器代码（支持 Range Requests）
├── package.json          # 依赖配置
├── public/
│   └── index.html        # 前端播放器
└── videos/               # 视频文件目录（需要手动添加视频）
    └── (放置 .mp4 文件)
```

## 快速开始

### 1. 安装依赖

```bash
cd video-streaming
npm install
```

### 2. 添加测试视频

将你的 `.mp4` 视频文件放入 `videos/` 文件夹中。

如果没有测试视频，可以使用以下方法获取：

**方法 1：使用在线测试视频（推荐）**
```bash
# 下载小尺寸测试视频（约 1MB）
curl -o videos/sample.mp4 https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4
```

**方法 2：自己创建测试视频（需要 FFmpeg）**
```bash
# macOS 安装 FFmpeg
brew install ffmpeg

# 创建一个 10 秒的测试视频
ffmpeg -f lavfi -i testsrc=duration=10:size=1280x720:rate=30 \
       -f lavfi -i sine=frequency=1000:duration=10 \
       -pix_fmt yuv420p videos/test.mp4
```

### 3. 启动服务器

```bash
npm start
```

或使用开发模式（自动重启）：
```bash
npm run dev
```

### 4. 访问播放器

在浏览器中打开：
```
http://localhost:3000
```

## 功能特性

- ✅ **Range Requests 支持**：断点续传和进度条拖拽
- ✅ **206 Partial Content**：分块加载视频
- ✅ **流式传输**：边下载边播放
- ✅ **视频列表**：自动扫描 videos 目录
- ✅ **播放统计**：实时显示缓冲、分辨率等信息
- ✅ **响应式界面**：适配各种屏幕尺寸

## 如何验证 Range Requests？

### 1. 打开浏览器开发者工具

Chrome/Edge：按 `F12` → Network 标签

### 2. 播放视频并观察

你会看到多个请求：

```
[Request] GET /video/sample.mp4
  Request Headers:
    Range: bytes=0-65535
  Response:
    Status: 206 Partial Content
    Content-Range: bytes 0-65535/1048576

[Request] GET /video/sample.mp4
  Request Headers:
    Range: bytes=65536-131071
  Response:
    Status: 206 Partial Content
    Content-Range: bytes 65536-131071/1048576
```

### 3. 拖动进度条

拖动到 50% 位置，会看到：

```
[Request] GET /video/sample.mp4
  Request Headers:
    Range: bytes=524288-589823
  Response:
    Status: 206 Partial Content
    Content-Range: bytes 524288-589823/1048576
```

浏览器直接跳到文件中间位置，只下载需要的部分！

## 学习要点

### 1. HTTP 状态码

- **200 OK**：返回完整文件（不支持 Range）
- **206 Partial Content**：返回部分内容
- **416 Range Not Satisfiable**：请求的范围无效

### 2. 关键 HTTP 头

- **Accept-Ranges: bytes**：告诉客户端支持范围请求
- **Range: bytes=start-end**：客户端请求的字节范围
- **Content-Range: bytes start-end/total**：服务器返回的实际范围

### 3. Node.js 流（Stream）

```javascript
// 创建指定范围的可读流
fs.createReadStream(path, { start: 0, end: 1024 })
```

这比读取整个文件到内存再发送高效得多！

### 4. HTML5 Video API

- `videoPlayer.currentTime` - 当前播放位置
- `videoPlayer.buffered` - 已缓冲的时间范围
- `videoPlayer.seeking` - 用户是否在拖拽进度条

## 与 YouTube 的对比

| 功能 | 本项目 | YouTube |
|------|--------|---------|
| Range Requests | ✅ | ✅ |
| 自适应码率 | ❌ | ✅ (HLS/DASH) |
| 多分辨率 | ❌ | ✅ (360p/720p/1080p) |
| CDN 分发 | ❌ | ✅ |
| 视频转码 | ❌ | ✅ |

下一阶段（阶段 3）我们将实现 **HLS 流媒体**，支持多码率和自适应切换，更接近 YouTube 的实现。

## 常见问题

### Q: 视频无法播放？

1. 确保视频是 `.mp4` 格式
2. 检查视频编码是否为 H.264（浏览器支持）
3. 检查文件路径是否正确

### Q: 如何支持其他格式？

修改 `video-server.js` 中的 MIME 类型：

```javascript
const ext = path.extname(filename);
const mimeTypes = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg'
};
```

### Q: 如何部署到生产环境？

**不建议直接部署！** 这只是学习项目。生产环境需要：

- Nginx 反向代理
- CDN 加速
- 视频转码
- 访问控制
- 监控和日志

## 下一步学习

完成这个项目后，你已经理解了：

1. ✅ 流媒体的基本原理
2. ✅ HTTP Range Requests
3. ✅ Node.js 流处理
4. ✅ HTML5 Video API

准备好进入**阶段 3：HLS 流媒体**了吗？我们将实现：

- 视频分片（.ts 文件）
- m3u8 播放列表
- 多码率自适应（360p/720p/1080p）
- 使用 FFmpeg 转码

## 参考资料

- [MDN - HTTP Range Requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Range_requests)
- [MDN - HTML5 Video](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/video)
- [RFC 7233 - Range Requests](https://tools.ietf.org/html/rfc7233)
