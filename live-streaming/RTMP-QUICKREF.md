# 📡 RTMP 快速参考

## 一句话解释

**RTMP = 从你的电脑把直播画面推送到服务器的协议**

---

## 核心概念

### RTMP 是什么？

```
你的摄像头 → OBS (编码) → RTMP 推流 → 服务器 → 转换成 HLS → 观众观看
                              └────┘
                            这就是 RTMP！
```

**类比**:
- RTMP 就像**快递发货** - 把东西从你这里送到服务器
- HLS 就像**快递收货** - 观众从服务器那里收东西

---

## RTMP vs HLS 对比

| | RTMP | HLS |
|---|------|-----|
| **用途** | 上传/推流 | 下载/播放 |
| **方向** | 你 → 服务器 | 服务器 → 观众 |
| **类比** | 寄快递 | 收快递 |
| **工具** | OBS, FFmpeg | 浏览器 |
| **延迟** | 低 (1-3秒) | 中 (5-30秒) |

**完整流程**:
```
主播 ──RTMP推流──→ 服务器 ──HLS播放──→ 观众
    (上传)              (下载)
```

---

## RTMP URL 结构

```
rtmp://localhost:1935/live/stream_key
│      │         │    │    │
│      │         │    │    └─ 密钥 (你的房间号)
│      │         │    └────── 应用 (直播分类)
│      │         └─────────── 端口 (固定1935)
│      └───────────────────── 地址
└──────────────────────────── 协议
```

**真实例子**:
```bash
# 本地测试
rtmp://localhost:1935/live/stream_key

# YouTube
rtmp://a.rtmp.youtube.com/live2/你的密钥

# Bilibili
rtmp://live-push.bilivideo.com/live-bvc/你的密钥
```

---

## OBS 推流配置

### 步骤 1: 打开设置
```
OBS → 设置 → 推流
```

### 步骤 2: 填写信息
```
服务:      自定义
服务器:    rtmp://localhost:1935/live
串流密钥:  stream_key
```

### 步骤 3: 开始推流
```
OBS 主界面 → 开始推流
```

---

## FFmpeg 推流示例

### 推流本地视频
```bash
ffmpeg -re -i video.mp4 -c copy -f flv \
  rtmp://localhost:1935/live/stream_key
```

### 推流摄像头 (macOS)
```bash
ffmpeg -f avfoundation -i "0:0" \
  -c:v libx264 -preset ultrafast \
  -c:a aac \
  -f flv rtmp://localhost:1935/live/stream_key
```

### 推流摄像头 (Linux)
```bash
ffmpeg -f v4l2 -i /dev/video0 \
  -c:v libx264 -preset ultrafast \
  -c:a aac \
  -f flv rtmp://localhost:1935/live/stream_key
```

---

## RTMP 工作流程

### 简化版
```
1. 连接服务器 (握手)
2. 发送"我要开播"命令
3. 开始传输音视频数据
4. 持续推流...
5. 发送"下播"命令
6. 断开连接
```

### 详细版
```
客户端 (OBS)              服务器
    │                        │
    ├───── 握手 ────────────→│
    │←──── 确认 ─────────────┤
    │                        │
    ├── connect 命令 ───────→│
    │←── 连接成功 ───────────┤
    │                        │
    ├── publish 命令 ───────→│
    │←── 开始接收 ───────────┤
    │                        │
    ├── 音频包 ────────────→│
    ├── 视频包 ────────────→│
    ├── 音频包 ────────────→│
    ├── 视频包 ────────────→│
    │     (持续传输...)      │
    │                        │
    ├── 停止推流 ──────────→│
    │←── 确认断开 ───────────┤
    │                        │
```

---

## RTMP 数据包

### 音频包
```
每 64ms 发送一次
内容: AAC 编码的音频数据
大小: 约 1-2 KB
```

### 视频包
```
每帧发送一次 (30fps = 每 33ms)
内容: H.264 编码的视频帧
大小: 关键帧 50-100 KB, 普通帧 5-20 KB
```

### 关键帧 (GOP)
```
每 2 秒一个关键帧
├─ 关键帧 (I 帧) - 完整画面
├─ 普通帧 (P 帧) - 只记录变化
├─ 普通帧 (P 帧)
├─ 普通帧 (P 帧)
└─ 关键帧 (I 帧) - 完整画面
```

---

## RTMP 推流参数

### 分辨率与码率

| 分辨率 | 推荐码率 | 适用场景 |
|--------|---------|---------|
| 1920x1080 | 4500 Kbps | 高清直播 |
| 1280x720 | 2500 Kbps | 标清直播 |
| 854x480 | 1000 Kbps | 移动直播 |
| 640x360 | 600 Kbps | 低带宽 |

### OBS 编码设置
```
编码器:        x264
码率控制:      CBR (恒定码率)
比特率:        2500 Kbps (720p)
关键帧间隔:    2 秒
CPU 预设:      veryfast
配置文件:      main
```

---

## 常见问题速查

### ❌ 推流失败
```
检查项:
1. 端口 1935 是否开放?
2. 服务器是否启动?
3. 流密钥是否正确?
```

### ❌ 延迟很高
```
解决:
1. 减小关键帧间隔 (2秒 → 1秒)
2. 使用更快的编码预设
3. 降低码率
```

### ❌ 画面卡顿
```
原因:
1. 上传带宽不足
2. CPU 占用过高
3. 码率设置过高

解决:
1. 降低分辨率 (1080p → 720p)
2. 降低码率
3. 使用硬件编码 (NVENC/QSV)
```

### ❌ 看不到画面
```
检查:
1. RTMP 服务器是否收到流?
   → 查看服务器日志
2. HLS 文件是否生成?
   → 查看 media/live/stream_key/
3. 播放器是否加载成功?
   → 查看浏览器控制台
```

---

## RTMP 延迟优化

### 低延迟配置

**服务器端**:
```javascript
rtmp: {
  chunk_size: 60000,
  gop_cache: true,    // 快速启动
  ping: 10,
  ping_timeout: 30
}
```

**OBS 设置**:
```
关键帧间隔: 1 秒
预设: ultrafast
调优: zerolatency
```

**HLS 转码**:
```
分片时长: 1 秒
播放列表: 2 个分片
```

**实际延迟**:
```
RTMP 推流延迟:    0.5-1 秒
转码延迟:         0.5-1 秒
HLS 播放延迟:     2-3 秒
─────────────────────────
总延迟:           3-5 秒
```

---

## 带宽计算

### 推流带宽需求

```
视频码率 + 音频码率 = 总码率

例子:
├─ 720p 视频: 2500 Kbps
├─ 音频:      128 Kbps
└─ 总计:      2628 Kbps ≈ 2.6 Mbps

建议上传带宽: 2.6 Mbps × 1.5 = 4 Mbps
```

### 不同场景推荐

```
游戏直播 (1080p60):
├─ 视频: 6000 Kbps
├─ 音频: 160 Kbps
└─ 需要: 6.2 Mbps 上传

聊天直播 (720p30):
├─ 视频: 2500 Kbps
├─ 音频: 128 Kbps
└─ 需要: 2.6 Mbps 上传

移动直播 (480p30):
├─ 视频: 1000 Kbps
├─ 音频: 96 Kbps
└─ 需要: 1.1 Mbps 上传
```

---

## RTMP 安全

### 流密钥保护
```
✅ 定期更换流密钥
✅ 不要公开流密钥
✅ 使用复杂的密钥 (如: live_a8f3k2m9x7q1)
❌ 不要使用简单密钥 (如: 123, test)
```

### 服务器鉴权
```javascript
// 验证流密钥
nms.on('prePublish', (id, StreamPath, args) => {
  const validKeys = ['secret_key_1', 'secret_key_2'];
  const key = StreamPath.split('/').pop();

  if (!validKeys.includes(key)) {
    session.reject();  // 拒绝推流
  }
});
```

---

## 实用命令

### 检查 RTMP 服务器
```bash
# 查看端口
lsof -i :1935  # macOS/Linux
netstat -ano | findstr :1935  # Windows

# 测试连接
telnet localhost 1935
```

### 查看推流信息
```bash
# 查看 HLS 文件
ls -la media/live/stream_key/

# 查看录制文件
ls -la recordings/

# 实时监控日志
tail -f logs/rtmp.log
```

### FFmpeg 测试推流
```bash
# 推流测试视频 (10秒)
ffmpeg -f lavfi -i testsrc=duration=10:size=1280x720:rate=30 \
  -f lavfi -i sine=frequency=1000:duration=10 \
  -c:v libx264 -c:a aac \
  -f flv rtmp://localhost:1935/live/test
```

---

## 总结

### RTMP 三要素
```
1. 地址: rtmp://localhost:1935/live
2. 密钥: stream_key
3. 工具: OBS / FFmpeg
```

### 典型流程
```
OBS 编码 → RTMP 推流 → 服务器接收 → 转码 HLS → 观众观看
```

### 关键配置
```
端口:     1935
协议:     TCP
编码:     H.264 + AAC
封装:     FLV
延迟:     1-3 秒
```

---

## 快速诊断流程图

```
推流失败?
    ├─ 是 → 检查端口 1935
    │      ├─ 被占用 → 停止其他 RTMP 服务
    │      └─ 未开放 → 启动 RTMP 服务器
    │
    └─ 否 → 有画面吗?
           ├─ 无 → 检查 HLS 文件
           │      ├─ 无 → FFmpeg 路径错误
           │      └─ 有 → 播放器问题
           │
           └─ 有 → 卡顿吗?
                  ├─ 是 → 降低码率
                  └─ 否 → 完美! 🎉
```

---

**更多详细内容，请查看 [RTMP-EXPLAINED.md](./RTMP-EXPLAINED.md)**
