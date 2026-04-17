# HLS 流媒体服务器 - 安装指南

## 前置要求

### 1. 安装 FFmpeg

FFmpeg 是视频转码的核心工具，必须先安装。

#### macOS 安装

```bash
# 使用 Homebrew 安装（推荐）
brew install ffmpeg

# 验证安装
ffmpeg -version
```

#### Linux (Ubuntu/Debian) 安装

```bash
sudo apt update
sudo apt install ffmpeg

# 验证安装
ffmpeg -version
```

#### Windows 安装

1. 访问 https://ffmpeg.org/download.html
2. 下载 Windows 版本
3. 解压并添加到 PATH 环境变量

#### 验证 FFmpeg 功能

```bash
# 检查支持的编码器
ffmpeg -encoders | grep h264
ffmpeg -encoders | grep aac

# 应该看到：
# libx264    H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10
```

### 2. 安装 Node.js 依赖

```bash
cd hls-streaming
npm install
```

## 快速开始

### 步骤 1: 准备源视频

将你的视频文件（.mp4, .mov 等）放入 `source-videos/` 文件夹：

```bash
# 示例：复制视频
cp ~/Downloads/my-video.mp4 source-videos/

# 或下载测试视频
curl -o source-videos/sample.mp4 \
  https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_10mb.mp4
```

### 步骤 2: 转码视频为 HLS 格式

```bash
# 转码单个视频（生成多码率）
npm run transcode

# 或直接运行
node transcode.js source-videos/sample.mp4
```

**转码过程：**
- 360p (低画质) - 适合慢速网络
- 720p (中画质) - 适合一般网络
- 1080p (高画质) - 适合快速网络

转码完成后，`hls-output/` 文件夹结构：

```
hls-output/
└── sample/
    ├── master.m3u8          # 主播放列表
    ├── 360p.m3u8           # 360p 播放列表
    ├── 360p_000.ts         # 360p 视频分片
    ├── 360p_001.ts
    ├── ...
    ├── 720p.m3u8
    ├── 720p_000.ts
    ├── ...
    ├── 1080p.m3u8
    └── 1080p_000.ts
```

### 步骤 3: 启动 HLS 服务器

```bash
npm start
```

### 步骤 4: 在浏览器中播放

访问 http://localhost:4000

浏览器会：
- 自动选择合适的画质
- 根据网络速度切换码率
- 实现平滑播放

## 文件说明

```
hls-streaming/
├── source-videos/        # 原始视频文件
├── hls-output/          # 转码后的 HLS 文件
│   └── {video-name}/
│       ├── master.m3u8  # 主播放列表
│       ├── 360p.m3u8    # 各码率播放列表
│       ├── *.ts         # 视频分片（每段约 6 秒）
├── public/
│   └── index.html       # 播放器界面
├── transcode.js         # 转码脚本
├── hls-server.js        # HLS 服务器
└── package.json
```

## 常见问题

### Q1: FFmpeg 未找到

```
Error: Cannot find ffmpeg
```

**解决方案：**
1. 运行 `brew install ffmpeg` (macOS)
2. 重启终端
3. 运行 `ffmpeg -version` 验证

### Q2: 转码失败

```
Error: ffmpeg exited with code 1
```

**可能原因：**
- 视频文件损坏
- 不支持的编码格式
- 磁盘空间不足

**解决方案：**
```bash
# 检查视频信息
ffmpeg -i source-videos/your-video.mp4

# 如果不是 H.264，先转换
ffmpeg -i input.mov -vcodec h264 -acodec aac output.mp4
```

### Q3: 播放卡顿

**原因：** 视频分片太大或服务器性能不足

**解决方案：**
- 调整转码参数（降低码率）
- 减少分片大小（修改 `-hls_time` 参数）

### Q4: 浏览器不支持 HLS

**Safari/iOS：** 原生支持 HLS ✅

**Chrome/Firefox：** 需要 hls.js 库 ✅（已内置）

## 下一步

完成基础设置后，你可以：

1. 查看 `HLS-EXPLAINED.md` 了解 HLS 原理
2. 修改转码参数调整画质和文件大小
3. 添加更多码率选项
4. 实现上传和自动转码功能

## 故障排除

### 检查 FFmpeg 安装

```bash
# 应该输出版本信息
ffmpeg -version

# 应该输出 /usr/local/bin/ffmpeg 或类似路径
which ffmpeg
```

### 手动测试转码

```bash
# 简单的转码测试
ffmpeg -i source-videos/sample.mp4 \
  -vf scale=640:360 \
  -c:v libx264 \
  -c:a aac \
  test-output.mp4
```

如果这个命令成功，说明 FFmpeg 工作正常。
