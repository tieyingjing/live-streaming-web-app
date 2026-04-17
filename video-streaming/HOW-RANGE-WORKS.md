# HTML5 Video 如何自动处理 Range Requests

## 核心机制

### 1. `<video>` 标签会自动发送 Range 请求

当你写这样的代码时：

```html
<video src="/video/sample.mp4" controls></video>
```

**浏览器会自动：**

1. 发送第一个请求（预加载）
2. 根据需要发送后续的 Range 请求
3. 当用户拖拽进度条时，发送新的 Range 请求

**你不需要写任何 JavaScript 代码！**

---

## 实际请求过程（详细分析）

### 场景 1: 页面加载视频

```html
<video src="/video/sample.mp4" controls></video>
```

**浏览器自动发送的请求：**

#### 请求 1: 初始请求（探测）

```http
GET /video/sample.mp4 HTTP/1.1
Host: localhost:3000
Range: bytes=0-
```

**服务器响应：**

```http
HTTP/1.1 206 Partial Content
Content-Range: bytes 0-65535/10485760
Content-Length: 65536
Content-Type: video/mp4
Accept-Ranges: bytes
```

**浏览器做了什么：**
- 只请求开头的一部分（通常 64KB）
- 解析视频元数据（时长、分辨率、编码等）
- 立即可以显示播放控件

#### 请求 2: 继续加载（如果用户点击播放）

```http
GET /video/sample.mp4 HTTP/1.1
Range: bytes=65536-131071
```

```http
GET /video/sample.mp4 HTTP/1.1
Range: bytes=131072-196607
```

**浏览器会：**
- 持续请求后续的数据块
- 边下载边播放
- 缓冲一定量的数据

---

### 场景 2: 用户拖拽进度条

假设视频总长度 10MB，用户拖到 50% 位置：

**浏览器自动发送：**

```http
GET /video/sample.mp4 HTTP/1.1
Range: bytes=5242880-5308415
```

**关键点：**
- 浏览器自动计算了 50% 对应的字节位置
- 跳过了中间的数据
- 直接请求需要的部分

---

### 场景 3: 网络中断后恢复

如果下载到 2MB 时网络中断：

**浏览器会：**

```http
GET /video/sample.mp4 HTTP/1.1
Range: bytes=2097152-
```

**从上次断开的地方继续！** 这就是断点续传。

---

## 验证浏览器行为

### 实验 1: 观察初始加载

1. 打开 Chrome DevTools (F12) → Network 标签
2. 勾选 "Preserve log"
3. 刷新页面 http://localhost:3000

**你会看到：**

```
Name: sample.mp4
Status: 206
Type: video/mp4
Size: 64.0 KB (初始请求)

[Request Headers]
Range: bytes=0-65535

[Response Headers]
HTTP/1.1 206 Partial Content
Content-Range: bytes 0-65535/10485760
```

### 实验 2: 观察进度条拖拽

1. 播放视频
2. 拖动进度条到 50%
3. 观察 Network 标签

**新的请求出现：**

```
[Request Headers]
Range: bytes=5242880-5308415
```

**注意：**
- 请求的起始位置变了
- 跳过了中间的数据
- 这完全是浏览器自动计算的！

### 实验 3: 禁用 Range 看会怎样

修改服务器代码（临时测试）：

```javascript
// 注释掉 Range 处理逻辑，总是返回完整文件
app.get('/video/:filename', (req, res) => {
    // ... 忽略 range 头
    res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
        // 注意：不返回 Accept-Ranges: bytes
    });
    fs.createReadStream(videoPath).pipe(res);
});
```

**结果：**
- 每次都下载整个文件
- 拖动进度条会重新下载整个文件
- 浪费带宽和时间

---

## 浏览器如何决定请求范围？

### 1. 初始加载

```javascript
// 浏览器的内部逻辑（伪代码）
if (video.preload === 'metadata') {
    request('Range: bytes=0-32768');  // 只请求 32KB
} else if (video.preload === 'auto') {
    request('Range: bytes=0-1048576'); // 请求 1MB
} else if (video.preload === 'none') {
    // 什么都不请求，直到用户点击播放
}
```

### 2. 播放时的连续请求

```javascript
// 浏览器的缓冲策略（简化版）
while (playing) {
    if (bufferedTime < currentTime + 30秒) {
        requestNextChunk();  // 自动请求下一块
    }
}
```

### 3. 拖拽进度条

```javascript
// 用户拖到 50%
seekTo(0.5);

// 浏览器计算字节位置
const bytePosition = totalFileSize * 0.5;
request(`Range: bytes=${bytePosition}-`);
```

---

## 关键 HTML 属性

### preload 属性

```html
<!-- 默认：预加载元数据 -->
<video src="video.mp4" preload="metadata" controls></video>
<!-- Range: bytes=0-32768 -->

<!-- 自动预加载更多 -->
<video src="video.mp4" preload="auto" controls></video>
<!-- Range: bytes=0-1048576 -->

<!-- 不预加载 -->
<video src="video.mp4" preload="none" controls></video>
<!-- 直到用户点击播放才发送请求 -->
```

### 测试代码

```html
<!DOCTYPE html>
<html>
<head>
    <title>Range Requests 测试</title>
</head>
<body>
    <h2>测试 1: preload="metadata" (默认)</h2>
    <video src="/video/sample.mp4" preload="metadata" controls width="400"></video>
    <p>打开 DevTools → Network，你会看到小的初始请求（约 32KB）</p>

    <h2>测试 2: preload="auto"</h2>
    <video src="/video/sample.mp4" preload="auto" controls width="400"></video>
    <p>会预加载更多数据（1-3MB），以便流畅播放</p>

    <h2>测试 3: preload="none"</h2>
    <video src="/video/sample.mp4" preload="none" controls width="400"></video>
    <p>页面加载时不会发送任何请求，直到你点击播放</p>

    <script>
        // 监听视频事件
        document.querySelectorAll('video').forEach((video, index) => {
            video.addEventListener('loadstart', () => {
                console.log(`Video ${index + 1}: loadstart 事件`);
            });

            video.addEventListener('loadedmetadata', () => {
                console.log(`Video ${index + 1}: 元数据加载完成`);
                console.log(`  - 时长: ${video.duration}秒`);
                console.log(`  - 分辨率: ${video.videoWidth}x${video.videoHeight}`);
            });

            video.addEventListener('progress', () => {
                if (video.buffered.length > 0) {
                    const buffered = video.buffered.end(0);
                    const percent = (buffered / video.duration * 100).toFixed(1);
                    console.log(`Video ${index + 1}: 缓冲 ${percent}%`);
                }
            });

            video.addEventListener('seeking', () => {
                console.log(`Video ${index + 1}: 用户拖拽到 ${video.currentTime.toFixed(2)}秒`);
            });
        });
    </script>
</body>
</html>
```

---

## 服务器端的职责

### 服务器只需要：

1. **识别 Range 头**

```javascript
const range = req.headers.range;
if (range) {
    // 有 Range 头
} else {
    // 没有 Range 头（老旧浏览器或下载工具）
}
```

2. **解析范围**

```javascript
// Range: bytes=1024-2047
const parts = range.replace(/bytes=/, '').split('-');
const start = parseInt(parts[0], 10);  // 1024
const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;  // 2047
```

3. **返回正确的响应**

```javascript
res.writeHead(206, {
    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': chunkSize,
    'Content-Type': 'video/mp4',
});
```

**浏览器会处理其他所有事情！**

---

## 为什么需要 Range Requests？

### 对比测试

#### ❌ 不支持 Range（普通下载）

```
用户点击播放:
[========================================] 100MB
等待下载完整视频... ⏳ 需要 30 秒

用户拖到 50%:
[========================================] 100MB
重新下载整个视频... ⏳ 又需要 30 秒
```

#### ✅ 支持 Range（流式播放）

```
用户点击播放:
[====                                    ] 10MB
立即开始播放! ⚡ 只需 3 秒

用户拖到 50%:
         [====                           ] 10MB
直接跳转! ⚡ 只需 1 秒
```

---

## 总结

### 浏览器自动做的事情：

1. ✅ 发送 Range 请求
2. ✅ 计算需要的字节范围
3. ✅ 根据播放位置请求数据
4. ✅ 处理拖拽进度条
5. ✅ 管理缓冲
6. ✅ 断点续传

### 开发者需要做的事情：

1. 服务器识别 Range 头
2. 返回 206 状态码
3. 返回正确的 Content-Range 头
4. 使用 Stream 发送指定范围的数据

### 一句话总结：

**`<video>` 标签是一个智能客户端，它会自动管理所有的 Range 请求。服务器只需要正确响应这些请求即可。**

---

## 进阶：自定义 Range 请求

虽然 `<video>` 会自动处理，但你也可以手动控制：

```javascript
// 使用 Fetch API 手动请求视频片段
async function loadVideoSegment(start, end) {
    const response = await fetch('/video/sample.mp4', {
        headers: {
            'Range': `bytes=${start}-${end}`
        }
    });

    if (response.status === 206) {
        const blob = await response.blob();
        console.log('下载了', blob.size, '字节');
        return blob;
    }
}

// 下载前 1MB
loadVideoSegment(0, 1048575);

// 下载 50%-60% 的部分
const fileSize = 10485760;  // 10MB
loadVideoSegment(fileSize * 0.5, fileSize * 0.6 - 1);
```

这就是 HLS、DASH 等高级流媒体协议的基础！

（我们在阶段 3 会实现这个）
