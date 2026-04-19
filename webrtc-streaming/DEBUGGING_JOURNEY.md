# WebRTC 浏览器推流实现 - 调试之旅

## 项目概述

实现一个完整的 WebRTC 浏览器推流系统，允许用户直接从浏览器推送摄像头或屏幕共享到 RTMP 服务器，并通过 HLS 播放。

**技术栈**：
- mediasoup (WebRTC SFU)
- mediasoup-client (浏览器端 WebRTC)
- FFmpeg (转码和协议转换)
- node-media-server (RTMP/HLS 服务器)

**最终架构**：
```
浏览器 (WebRTC: VP8 + Opus)
  ↓
mediasoup (SFU)
  ↓ RTP over UDP
FFmpeg (转码: VP8→H.264, Opus→AAC)
  ↓ RTMP
node-media-server
  ↓ HLS 切片
播放器
```

---

## 问题 1: RTP Header Extension ID 冲突

### 错误信息
```
Failed to execute 'setRemoteDescription' on 'RTCPeerConnection':
Failed to set remote answer sdp: Failed to update RTP header extensions
for m-section with mid='0'. RTP extension ID reassignment from
urn:3gpp:video-orientation to
http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01
for ID 3.
```

### 问题分析

这是整个调试过程中最核心、最棘手的问题。

**根本原因**：
1. 浏览器在创建 WebRTC offer 时，自动将 `urn:3gpp:video-orientation` 分配到 extmap ID **3**
2. mediasoup 服务器返回的 answer 中，将 `transport-wide-cc` 也分配到 ID **3**
3. WebRTC 检测到同一个 ID 被映射到两个不同的扩展，拒绝设置 remote SDP

**为什么会发生**：
- mediasoup 3.13.24 和 mediasoup-client 3.6.102/3.7.6/3.13.0 之间存在 RTP header extension 协商的兼容性问题
- 浏览器的 WebRTC 实现会强制添加某些标准扩展（如 video-orientation）
- 即使在 RTP capabilities 中过滤掉了 video-orientation，浏览器仍会在底层自动添加

### 尝试的解决方案（失败）

#### 尝试 1: 服务器端过滤 RTP capabilities ❌
```javascript
// 过滤掉 video-orientation
rtpCapabilities.headerExtensions = rtpCapabilities.headerExtensions.filter(
  ext => ext.uri !== 'urn:3gpp:video-orientation'
);
```
**结果**：失败，浏览器仍然在 offer 中添加了 video-orientation

#### 尝试 2: 客户端过滤并重新分配 ID ❌
```javascript
// 重新分配 ID，从 4 开始
rtpCapabilities.headerExtensions.forEach((ext, index) => {
  if (nextId <= 3) nextId = 4;
  ext.preferredId = nextId;
  nextId++;
});
```
**结果**：失败，`preferredId` 只是建议，浏览器不一定遵守

#### 尝试 3: Monkey Patch setLocalDescription ❌
```javascript
RTCPeerConnection.prototype.setLocalDescription = function(description) {
  if (description && description.sdp) {
    const modifiedSdp = description.sdp.replace(
      /a=extmap:3 urn:3gpp:video-orientation\r?\n/g,
      ''
    );
    // ...
  }
};
```
**结果**：失败，移除后导致其他扩展的 ID 错位，出现新的冲突

#### 尝试 4: 在 produce 事件中过滤 rtpParameters ❌
```javascript
this.sendTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
  filteredRtpParameters.headerExtensions =
    filteredRtpParameters.headerExtensions.filter(
      ext => ext.uri !== 'urn:3gpp:video-orientation'
    );
  // ...
});
```
**结果**：失败，produce 事件在 SDP 协商之后触发，为时已晚

### 最终解决方案 ✅

**升级到最新版本**：
```json
{
  "mediasoup": "^3.19.19",
  "mediasoup-client": "^3.18.8"
}
```

**为什么有效**：
- mediasoup 3.19.19 是 2026 年 4 月的最新版本，包含大量 bug 修复
- mediasoup-client 3.18.8 与服务器版本完全匹配
- 最新版本正确处理了 RTP header extension 的协商逻辑
- 两端能够正确协商出一致的 extmap ID 映射

**关键教训**：
- 版本兼容性至关重要，特别是在复杂的 WebRTC 协商场景中
- 不要试图通过 hack 或 workaround 解决底层协议问题
- 升级到最新稳定版往往是最简单有效的解决方案

---

## 问题 2: FFmpeg 端口绑定冲突

### 错误信息
```
[udp @ 0x7f8835815400] bind failed: Address already in use
Error opening input file rtp://127.0.0.1:10046?pkt_size=1200.
```

### 问题分析

**初始实现**：
```javascript
const videoTransport = await router.createPlainTransport({
  listenIp: { ip: '127.0.0.1', announcedIp: null },
  rtcpMux: false,
  comedia: true  // ❌ 问题所在
});

// FFmpeg 尝试连接
ffmpeg -i rtp://127.0.0.1:10046
```

**冲突原因**：
1. mediasoup PlainTransport 已经在监听端口 10046
2. FFmpeg 默认也会尝试绑定（bind）该端口来接收 RTP
3. 两个进程不能同时绑定同一个端口

**comedia 模式的问题**：
- `comedia: true` 表示 transport 会等待第一个 RTP 包来确定对端地址
- 但 FFmpeg 也在等待 RTP 包，形成死锁

### 解决方案 ✅

**反转连接方向**：
```javascript
// 1. mediasoup 使用 comedia: false
const videoTransport = await router.createPlainTransport({
  listenIp: { ip: '127.0.0.1', announcedIp: null },
  rtcpMux: false,
  comedia: false  // mediasoup 将主动连接
});

// 2. FFmpeg 以 listen 模式启动
const args = [
  '-i', `rtp://127.0.0.1:${videoRtpPort}?listen`  // 监听端口
];

// 3. Consumer 先暂停
const videoConsumer = await videoTransport.consume({
  producerId: videoProducer.producer.id,
  rtpCapabilities: router.rtpCapabilities,
  paused: true  // 先暂停
});

// 4. 启动 FFmpeg
const ffmpeg = spawn('ffmpeg', ffmpegArgs);
await new Promise(resolve => setTimeout(resolve, 2000));  // 等待 FFmpeg 启动

// 5. mediasoup 连接到 FFmpeg
await videoTransport.connect({
  ip: '127.0.0.1',
  port: videoRtpPort,
  rtcpPort: videoRtpPort + 1
});

// 6. 恢复 consumer，开始发送
await videoConsumer.resume();
```

**流程**：
1. FFmpeg 先启动并监听端口
2. mediasoup transport 主动连接到 FFmpeg
3. Consumer 恢复后开始发送 RTP 包

---

## 问题 3: FFmpeg 无法识别 RTP Payload

### 错误信息
```
[in#0 @ 0x7f7e8f404400] Unable to receive RTP payload type 127
without an SDP file describing it
Error opening input: Invalid data found when processing input
```

### 问题分析

RTP 包本身不包含完整的 codec 信息，只有 payload type (PT) 编号。FFmpeg 需要知道：
- PT 127 对应什么编解码器？
- 时钟频率是多少？
- 是否有特殊参数？

这些信息通常通过 SDP (Session Description Protocol) 文件提供。

### 解决方案 ✅

**动态生成 SDP 文件**：

```javascript
function generateSDP(videoConsumer, audioConsumer, videoPort, audioPort) {
  const videoCodec = videoConsumer.rtpParameters.codecs[0];
  const audioCodec = audioConsumer ? audioConsumer.rtpParameters.codecs[0] : null;

  let sdp = `v=0
o=- 0 0 IN IP4 127.0.0.1
s=FFmpeg Stream
c=IN IP4 127.0.0.1
t=0 0
`;

  // Video m-line
  sdp += `m=video ${videoPort} RTP/AVP ${videoCodec.payloadType}
a=rtpmap:${videoCodec.payloadType} ${videoCodec.mimeType.split('/')[1]}/${videoCodec.clockRate}
`;

  if (videoCodec.parameters) {
    const fmtp = Object.entries(videoCodec.parameters)
      .map(([key, value]) => `${key}=${value}`)
      .join(';');
    if (fmtp) {
      sdp += `a=fmtp:${videoCodec.payloadType} ${fmtp}\n`;
    }
  }

  sdp += `a=recvonly\n`;

  // Audio m-line (类似)
  // ...

  return sdp;
}

// 使用
const sdpPath = path.join(__dirname, `stream_${streamKey}.sdp`);
const sdpContent = generateSDP(videoConsumer, audioConsumer, videoRtpPort, audioRtpPort);
fs.writeFileSync(sdpPath, sdpContent);

// FFmpeg 使用 SDP 文件
const args = [
  '-protocol_whitelist', 'file,rtp,udp',
  '-i', sdpPath
];
```

**SDP 文件示例**：
```
v=0
o=- 0 0 IN IP4 127.0.0.1
s=FFmpeg Stream
c=IN IP4 127.0.0.1
t=0 0
m=video 13104 RTP/AVP 96
a=rtpmap:96 VP8/90000
a=recvonly
m=audio 13106 RTP/AVP 111
a=rtpmap:111 opus/48000/2
a=recvonly
```

这样 FFmpeg 就知道：
- PT 96 = VP8, 90000 Hz
- PT 111 = Opus, 48000 Hz, 立体声

---

## 问题 4: VP8/Opus 与 FLV 容器不兼容

### 错误信息
```
[flv @ 0x7fe0a2405780] Video codec vp8 not compatible with flv
Could not write header (incorrect codec parameters ?): Function not implemented
Conversion failed!
```

### 问题分析

**FLV 容器限制**：
- 视频：只支持 H.264, H.263, Screen Video, VP6
- 音频：只支持 AAC, MP3, Speex, PCM

**WebRTC 默认编解码器**：
- 视频：VP8 (或 VP9, H.264)
- 音频：Opus

**不能直接 copy**：
```javascript
// ❌ 这样会失败
ffmpeg -i input.sdp -c:v copy -c:a copy -f flv output.flv
```

### 解决方案 ✅

**实时转码**：

```javascript
function buildFFmpegCommand(streamKey, sdpPath) {
  const args = [
    '-protocol_whitelist', 'file,rtp,udp',
    '-i', sdpPath,

    // VP8 → H.264
    '-c:v', 'libx264',
    '-preset', 'ultrafast',      // 最快编码速度
    '-tune', 'zerolatency',      // 零延迟调优
    '-b:v', '2000k',             // 视频码率
    '-maxrate', '2000k',
    '-bufsize', '4000k',
    '-g', '60',                  // GOP size (2秒，30fps)

    // Opus → AAC
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '48000',

    '-f', 'flv',
    `rtmp://localhost:1935/live/${streamKey}`
  ];

  return args;
}
```

**性能优化**：
- `ultrafast`：牺牲压缩率换取速度
- `zerolatency`：禁用 B 帧，减少延迟
- 码率控制：防止网络拥塞

**延迟考量**：
- 编码延迟：~50-100ms
- 网络延迟：~50-200ms
- HLS 切片延迟：~6-10 秒（3 个分片）
- 总延迟：约 7-11 秒

---

## 完整的启动流程

### 1. 初始化阶段

```javascript
// 创建 mediasoup workers
const workers = [];
for (let i = 0; i < numWorkers; i++) {
  const worker = await mediasoup.createWorker({
    logLevel: 'warn',
    rtcMinPort: 10000,
    rtcMaxPort: 59999
  });
  workers.push(worker);
}

// 创建 router
const router = await worker.createRouter({ mediaCodecs });
```

### 2. WebRTC 推流建立

```javascript
// 客户端
const device = new mediasoupClient.Device();
await device.load({ routerRtpCapabilities });

const sendTransport = device.createSendTransport(transportOptions);

const videoProducer = await sendTransport.produce({ track: videoTrack });
const audioProducer = await sendTransport.produce({ track: audioTrack });
```

### 3. FFmpeg 桥接启动

```javascript
// 服务器端
async function startFFmpegBridge(streamKey) {
  // 1. 创建 PlainTransport
  const videoTransport = await router.createPlainTransport({
    listenIp: { ip: '127.0.0.1', announcedIp: null },
    rtcpMux: false,
    comedia: false
  });

  // 2. 创建 Consumer（暂停）
  const videoConsumer = await videoTransport.consume({
    producerId: videoProducer.producer.id,
    rtpCapabilities: router.rtpCapabilities,
    paused: true
  });

  // 3. 生成 SDP
  const sdpPath = generateAndSaveSDP(videoConsumer, audioConsumer);

  // 4. 启动 FFmpeg
  const ffmpeg = spawn('ffmpeg', buildFFmpegCommand(streamKey, sdpPath));
  await sleep(2000);

  // 5. 连接 transport
  await videoTransport.connect({
    ip: '127.0.0.1',
    port: videoRtpPort,
    rtcpPort: videoRtpPort + 1
  });

  // 6. 恢复 consumer
  await videoConsumer.resume();
}
```

### 4. RTMP/HLS 转换

```javascript
// node-media-server 自动处理
const nms = new NodeMediaServer({
  rtmp: { port: 1935 },
  http: { port: 8000 },
  trans: {
    ffmpeg: '/usr/local/bin/ffmpeg',
    tasks: [{
      app: 'live',
      hls: true,
      hlsKeep: true,
      rec: true
    }]
  }
});
```

---

## 关键技术点总结

### 1. mediasoup 版本选择

| 版本 | 状态 | 说明 |
|------|------|------|
| 3.6.37 | ❌ | worker 编译失败 |
| 3.13.24 | ⚠️ | RTP extension 兼容性问题 |
| **3.19.19** | ✅ | **最新稳定版，推荐使用** |

### 2. RTP Transport 配置

```javascript
// ❌ 错误配置
{
  comedia: true,  // 等待第一个包
  rtcpMux: true   // 单端口模式
}

// ✅ 正确配置
{
  comedia: false,  // 主动连接
  rtcpMux: false   // 分离 RTP/RTCP 端口
}
```

### 3. FFmpeg 参数优化

**低延迟**：
```bash
-preset ultrafast -tune zerolatency
```

**高质量**：
```bash
-preset medium -tune film
```

**平衡**：
```bash
-preset fast -tune zerolatency -b:v 2000k
```

### 4. 端口分配策略

```javascript
const basePort = 10000 + Math.floor(Math.random() * 10000);

const videoRtpPort = basePort;        // 13104
const videoRtcpPort = basePort + 1;   // 13105
const audioRtpPort = basePort + 2;    // 13106
const audioRtcpPort = basePort + 3;   // 13107
```

---

## 常见问题排查

### Q1: 推流成功但播放器无法播放

**检查项**：
```bash
# 1. 检查 HLS 文件是否生成
ls -la media/live/webrtc_stream/

# 2. 检查 RTMP 服务器日志
# 应该看到 [Transmuxing HLS] 和 [Transmuxing MP4]

# 3. 测试 HLS URL
curl http://localhost:8000/live/webrtc_stream/index.m3u8

# 4. 检查 FFmpeg 进程
ps aux | grep ffmpeg
```

### Q2: FFmpeg 立即退出

**调试方法**：
```javascript
// 启用 FFmpeg stderr 输出
ffmpeg.stderr.on('data', (data) => {
  console.log(`[FFmpeg stderr] ${data}`);
});

ffmpeg.on('close', (code) => {
  console.log(`FFmpeg 进程退出，代码: ${code}`);
});
```

**常见退出码**：
- 0: 正常退出
- 1: 一般错误
- 183: SDP 格式错误
- 208: 端口绑定失败

### Q3: iOS Safari 无法播放

**解决方案**：
```html
<!-- 添加 playsinline 属性 -->
<video id="video" controls autoplay muted playsinline webkit-playsinline></video>
```

### Q4: 跨域访问失败

**CORS 配置**：
```javascript
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Range'],
  exposedHeaders: ['Content-Length', 'Content-Range']
}));
```

---

## 性能指标

### 延迟分析

| 环节 | 延迟 | 说明 |
|------|------|------|
| 摄像头采集 | ~16ms | 30fps |
| WebRTC 编码 | ~20ms | VP8 硬编码 |
| 网络传输 | ~10-50ms | 局域网 |
| mediasoup 转发 | ~5ms | 内存操作 |
| FFmpeg 转码 | ~50-100ms | VP8→H.264 |
| RTMP 推流 | ~20ms | 本地 |
| HLS 切片 | ~6-10s | 3个分片缓冲 |
| **总计** | **~7-11s** | 端到端 |

### 资源消耗

**CPU**：
- mediasoup: ~5-10%
- FFmpeg (ultrafast): ~15-25%
- node-media-server: ~5%

**内存**：
- mediasoup: ~100-200MB
- FFmpeg: ~50-100MB
- node-media-server: ~50MB

**带宽**：
- WebRTC: ~2.5 Mbps (视频2M + 音频128K + 开销)
- RTMP: ~2.1 Mbps
- HLS: ~2.1 Mbps

---

## 生产环境建议

### 1. 安全性

```javascript
// HTTPS 证书（生产环境使用 Let's Encrypt）
const options = {
  key: fs.readFileSync('/path/to/privkey.pem'),
  cert: fs.readFileSync('/path/to/fullchain.pem')
};

// 流密钥验证
const validStreamKeys = new Set(['key1', 'key2']);
if (!validStreamKeys.has(streamKey)) {
  throw new Error('Invalid stream key');
}
```

### 2. 可扩展性

```javascript
// 使用 Redis 存储 router 映射
const redis = require('redis');
const client = redis.createClient();

// 多 worker 负载均衡
const workerIndex = hash(streamKey) % workers.length;
const worker = workers[workerIndex];
```

### 3. 监控

```javascript
// Prometheus metrics
const prometheus = require('prom-client');

const activeStreams = new prometheus.Gauge({
  name: 'active_streams',
  help: 'Number of active streams'
});

const ffmpegRestarts = new prometheus.Counter({
  name: 'ffmpeg_restarts_total',
  help: 'Total FFmpeg restarts'
});
```

### 4. 错误恢复

```javascript
// FFmpeg 自动重启
ffmpeg.on('close', (code) => {
  if (code !== 0 && isStreaming) {
    console.log('FFmpeg crashed, restarting...');
    setTimeout(() => startFFmpegBridge(streamKey), 5000);
  }
});

// Consumer 重连
videoConsumer.on('transportclose', () => {
  console.log('Transport closed, cleaning up...');
  cleanup(streamKey);
});
```

---

## 参考资料

- [mediasoup Documentation](https://mediasoup.org/documentation/v3/)
- [mediasoup GitHub](https://github.com/versatica/mediasoup)
- [FFmpeg RTP Documentation](https://ffmpeg.org/ffmpeg-protocols.html#rtp)
- [WebRTC Glossary](https://webrtcglossary.com/)
- [SDP: Session Description Protocol](https://datatracker.ietf.org/doc/html/rfc4566)

---

## 问题 5: HLS 跨设备播放缓冲不足

### 错误信息
```javascript
{
  type: 'mediaError',
  details: 'bufferStalledError',
  fatal: false,
  buffer: 1.533,
  error: "Playback stalling at @0 due to low buffer"
}
```

### 问题分析

**场景**：一个设备推流，另一个局域网设备观看时出现缓冲停滞。

**根本原因**：
1. hls.js 默认配置的缓冲区较小（1.5秒左右）
2. `lowLatencyMode: true` 牺牲了缓冲区大小以降低延迟
3. HLS 分片时间为 2 秒，分片列表只保留 3 个，总缓冲时间不足
4. 跨设备网络延迟可能导致分片加载不够快

### 解决方案 ✅

**1. 优化 hls.js 配置**：

```javascript
hls = new Hls({
  enableWorker: true,
  lowLatencyMode: false,  // 禁用低延迟模式以优先保证流畅性
  backBufferLength: 90,
  maxBufferLength: 60,    // 从 30 增加到 60 秒
  maxMaxBufferLength: 120, // 从 60 增加到 120 秒
  maxBufferSize: 60 * 1000 * 1000, // 60MB
  maxBufferHole: 0.5,
  liveSyncDurationCount: 3,
  liveMaxLatencyDurationCount: 10,
  fragLoadingTimeOut: 20000,
  fragLoadingMaxRetry: 6,
  fragLoadingRetryDelay: 1000,
  startFragPrefetch: true  // 启用预加载
});
```

**2. 添加 bufferStalledError 特殊处理**：

```javascript
if (data.details === 'bufferStalledError') {
  console.warn('⚠️ 缓冲区不足，尝试优化...');
  if (hls && video.buffered.length > 0) {
    const bufferEnd = video.buffered.end(video.buffered.length - 1);
    if (bufferEnd - video.currentTime < 0.5) {
      // 缓冲区几乎耗尽，从稍早的位置重新加载
      hls.startLoad(video.currentTime - 1);
    }
  }
}
```

**3. 优化 node-media-server HLS 分片参数**：

```javascript
trans: {
  ffmpeg: '/usr/local/bin/ffmpeg',
  tasks: [{
    app: 'live',
    hls: true,
    hlsFlags: '[hls_time=3:hls_list_size=6:hls_flags=delete_segments+append_list:hls_delete_threshold=3]',
    hlsKeep: true
  }]
}
```

**关键改进**：
- `hls_time=3`：增加每个分片时长到 3 秒（原 2 秒）
- `hls_list_size=6`：保留 6 个分片（原 3 个），总缓冲 18 秒
- `hls_delete_threshold=3`：删除阈值为 3，确保有足够的旧分片供回看

**效果**：
- 总缓冲时间：从 ~6 秒增加到 ~18 秒
- hls.js 最大缓冲：从 30 秒增加到 60 秒
- 减少了缓冲停滞的发生频率
- 牺牲约 3-5 秒的额外延迟换取流畅播放

---

## 问题 6: FFmpeg 无法接收 RTP - "Unable to receive RTP payload type without SDP"

### 错误信息
```
[FFmpeg] Unable to receive RTP payload type 127 without an SDP file describing it
[FFmpeg] Error opening input: Invalid data found when processing input
Error opening input file rtp://127.0.0.1:10340?listen.
⚠️ FFmpeg 进程退出，代码: 183
```

但同时看到：
```
📊 视频 RTP 包已发送: 4052
```

### 问题分析

**现象**：
- mediasoup 正在发送 RTP 包 ✅
- FFmpeg 启动并监听端口 ✅
- 但 FFmpeg 报错无法识别 payload type 127 ❌

**根本原因**：

RTP 协议本身不包含编解码器信息，只有 payload type 编号（如 101、100、127）。当使用 `rtp://` URL 直接输入时，FFmpeg 不知道：
- PT 127 是什么编解码器？
- 时钟频率是多少？
- 有哪些参数？

这些信息需要通过 **SDP (Session Description Protocol)** 文件来描述。

### 解决方案 ✅

**方案：生成 SDP 文件描述 RTP payload**

1. **从 mediasoup consumer 提取编解码器信息**：

```javascript
function generateSDPWithListen(videoConsumer, audioConsumer, videoPort, audioPort) {
  const videoCodec = videoConsumer.rtpParameters.codecs[0];
  const audioCodec = audioConsumer ? audioConsumer.rtpParameters.codecs[0] : null;

  let sdp = `v=0
o=- 0 0 IN IP4 127.0.0.1
s=mediasoup
c=IN IP4 127.0.0.1
t=0 0
m=video ${videoPort} RTP/AVP ${videoCodec.payloadType}
a=rtpmap:${videoCodec.payloadType} ${videoCodec.mimeType.split('/')[1]}/${videoCodec.clockRate}
`;

  if (videoCodec.parameters) {
    const fmtp = Object.entries(videoCodec.parameters)
      .map(([key, value]) => `${key}=${value}`)
      .join(';');
    if (fmtp) {
      sdp += `a=fmtp:${videoCodec.payloadType} ${fmtp}\n`;
    }
  }

  sdp += `a=recvonly\n`;

  // 音频部分类似...
  return sdp;
}
```

2. **FFmpeg 使用 SDP 文件输入**：

```javascript
function buildFFmpegWithSDP(streamKey, sdpPath) {
  const args = [
    '-protocol_whitelist', 'file,udp,rtp',
    '-analyzeduration', '10000000',
    '-probesize', '10000000',
    '-i', sdpPath,  // 使用 SDP 文件而不是 rtp:// URL
    '-c:v', 'libx264',
    // ... 转码参数
  ];
  return args;
}
```

3. **生成的 SDP 示例**：

```sdp
v=0
o=- 0 0 IN IP4 127.0.0.1
s=mediasoup
c=IN IP4 127.0.0.1
t=0 0
m=video 10340 RTP/AVP 101
a=rtpmap:101 VP8/90000
a=recvonly
m=audio 10350 RTP/AVP 100
a=rtpmap:100 opus/48000/2
a=fmtp:100 minptime=10;useinbandfec=1
a=recvonly
```

这告诉 FFmpeg：
- PT 101 = VP8，时钟频率 90000
- PT 100 = Opus，时钟频率 48000，2 声道，带参数

**效果**：
- ✅ FFmpeg 成功识别 RTP payload
- ✅ 正常解码 VP8/Opus 流
- ✅ 转码并推送到 RTMP

---

## 问题 7: 跨设备 WebRTC 连接失败 - announcedIp 配置错误

### 错误信息

**场景**：
- 本机推流 → 本机观看 ✅
- 其他设备推流 → 本机观看 ❌ (WebRTC 连接失败)

### 问题分析

**根本原因**：mediasoup WebRTC Transport 配置使用了 `announcedIp: '127.0.0.1'`

```javascript
const transport = await router.createWebRtcTransport({
  listenIps: [
    {
      ip: '0.0.0.0',
      announcedIp: '127.0.0.1'  // ❌ 问题所在
    }
  ],
  // ...
});
```

**为什么会失败**：

1. mediasoup 生成 ICE candidates 时使用 `announcedIp`
2. 手机收到的 candidate 地址是 `127.0.0.1:xxxxx`
3. 手机尝试连接 `127.0.0.1` → 连接到手机自己 → 失败 ❌

**正确流程**：
- announcedIp 应该是**其他设备能访问到的地址**
- 局域网场景：使用局域网 IP（如 `192.168.2.15`）
- 公网场景：使用公网 IP

### 解决方案 ✅

**1. 自动检测本机局域网 IP**：

```javascript
const os = require('os');

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // 跳过内部和非 IPv4 地址
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const LOCAL_IP = getLocalIp();
console.log(`📍 检测到本机 IP: ${LOCAL_IP}`);
```

**2. 使用正确的 announcedIp**：

```javascript
const transport = await router.createWebRtcTransport({
  listenIps: [
    {
      ip: '0.0.0.0',
      announcedIp: LOCAL_IP  // ✅ 使用局域网 IP
    }
  ],
  // ...
});
```

**效果**：
- ✅ 手机收到的 ICE candidate：`192.168.2.15:xxxxx`
- ✅ 手机成功连接到服务器
- ✅ WebRTC 推流正常工作

---

## 问题 8: 跨设备 HLS 播放失败 - 混合内容安全策略

### 错误信息

**场景**：
- 本机推流 → 手机观看 ❌
- 错误：`load failed` / `无法访问 HLS 文件`

手机访问：`https://192.168.2.15:6443/`

### 问题分析

**根本原因**：浏览器的**混合内容（Mixed Content）安全策略**

1. **页面使用 HTTPS**：`https://192.168.2.15:6443/index.html`
2. **HLS URL 使用 HTTP**：`http://192.168.2.15:8000/live/.../index.m3u8`
3. **浏览器阻止**：现代浏览器（特别是 Safari）禁止 HTTPS 页面加载 HTTP 资源

**原始代码**：
```javascript
const host = window.location.hostname;  // 192.168.2.15
hlsUrlInput.value = `http://${host}:8000/live/${key}/index.m3u8`;
// 结果：http://192.168.2.15:8000/... ❌
```

### 解决方案 ✅

**方案 1（最初尝试）**：使用 HTTP 代理

尝试用 `http-proxy` 将请求转发到 node-media-server:

```javascript
const proxy = httpProxy.createProxyServer({
  target: 'http://localhost:8000'
});

app.use('/live', (req, res) => {
  proxy.web(req, res);
});
```

**问题**：node-media-server 2.6.3 的 HTTP 服务器没有启动（端口 8000 未监听）

**方案 2（最终方案）**：直接用 Express 提供 HLS 文件

不依赖 node-media-server 的 HTTP 功能，直接用 Express 提供静态文件：

```javascript
// 直接提供 HLS 文件服务
app.use('/live', express.static(path.join(__dirname, 'media', 'live'), {
  setHeaders: (res, filepath) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    // 设置正确的 MIME 类型
    if (filepath.endsWith('.m3u8')) {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    } else if (filepath.endsWith('.ts')) {
      res.setHeader('Content-Type', 'video/MP2T');
    } else if (filepath.endsWith('.mp4')) {
      res.setHeader('Content-Type', 'video/mp4');
    }
  }
}));
```

**前端 URL 生成**：

```javascript
// 使用与页面相同的协议和端口
const protocol = window.location.protocol;  // https:
const host = window.location.host;          // 192.168.2.15:6443
hlsUrlInput.value = `${protocol}//${host}/live/${key}/index.m3u8`;
// 结果：https://192.168.2.15:6443/live/.../index.m3u8 ✅
```

**请求流程**：

1. 手机访问：`https://192.168.2.15:6443/live/webrtc_stream/index.m3u8`
2. Express 接收请求，映射到：`./media/live/webrtc_stream/index.m3u8`
3. 返回文件内容（带正确 MIME 类型和 CORS 头）
4. Safari 成功加载（同协议，无混合内容问题）✅

**优势**：

1. ✅ **安全**：全程 HTTPS，符合浏览器安全策略
2. ✅ **简化**：只需暴露一个端口（6443），不需要 8000
3. ✅ **可靠**：不依赖 node-media-server 的 HTTP 服务器
4. ✅ **灵活**：完全控制 CORS、缓存、MIME 类型等

**效果**：
- ✅ 手机 Safari 成功加载 HLS 播放列表
- ✅ 跨设备观看直播正常工作
- ✅ 无混合内容警告或错误

---

## 总结

这个项目的调试过程充分展示了 WebRTC 实时通信的复杂性：

1. **版本兼容性**至关重要，特别是在 SDP 协商阶段
2. **网络协议细节**需要深入理解（RTP、RTCP、SDP）
3. **编解码器兼容性**不能想当然，需要明确转码
4. **调试工具**很重要：启用详细日志、检查 SDP 内容、监控进程状态

最终实现的系统虽然延迟较高（~10秒），但稳定性和兼容性良好，适合直播场景。如需低延迟（<1秒），建议使用 WebRTC 端到端方案或 WebTransport。
