# 视频格式兼容性说明

## .mov 格式支持

### 可以播放吗？

**答案：取决于编码格式**

`.mov` 是 Apple 的 QuickTime 容器格式，它本身只是一个"容器"，里面可以包含各种不同的视频和音频编码。

### 浏览器兼容性

| 编码格式 | Chrome | Safari | Firefox | Edge |
|---------|--------|--------|---------|------|
| H.264 (MOV) | ✅ | ✅ | ✅ | ✅ |
| H.265/HEVC (MOV) | ❌ | ✅ (macOS/iOS) | ❌ | 部分 |
| ProRes (MOV) | ❌ | ❌ | ❌ | ❌ |

### 如何检查你的 .mov 文件编码？

**方法 1: 使用 FFmpeg（推荐）**

```bash
# 安装 FFmpeg (macOS)
brew install ffmpeg

# 查看视频信息
ffmpeg -i your-video.mov

# 输出示例：
# Stream #0:0: Video: h264 (avc1 / 0x31637661), yuv420p, 1920x1080
#                      ^^^^
#                      这就是编码格式
```

**方法 2: 使用 macOS QuickTime Player**

1. 打开视频
2. 按 `Cmd + I` 查看信息
3. 查看"格式"一栏

**方法 3: 使用在线工具**

- [MediaInfo Online](https://mediaarea.net/en/MediaInfo)

### 常见问题

#### ❌ 问题 1: .mov 文件无法播放

**原因**：视频使用了浏览器不支持的编码（如 H.265, ProRes）

**解决方案**：转换为 H.264 编码

```bash
ffmpeg -i input.mov -vcodec h264 -acodec aac output.mp4
```

#### ❌ 问题 2: Safari 可以播放，Chrome 不行

**原因**：视频使用了 H.265 (HEVC) 编码，只有 Safari 支持

**解决方案**：同上，转换为 H.264

#### ⚠️ 问题 3: 文件很大，加载慢

**原因**：.mov 文件通常来自专业摄像机，未压缩或压缩率低

**解决方案**：重新编码并压缩

```bash
# 降低码率（适合网络播放）
ffmpeg -i input.mov -vcodec h264 -crf 23 -preset medium output.mp4
```

## 支持的视频格式总结

### ✅ 浏览器广泛支持

| 格式 | 容器 | 视频编码 | 音频编码 | 推荐度 |
|------|------|---------|---------|--------|
| .mp4 | MP4 | H.264 | AAC | ⭐⭐⭐⭐⭐ |
| .webm | WebM | VP8/VP9 | Vorbis/Opus | ⭐⭐⭐⭐ |

### ⚠️ 部分支持（取决于编码）

| 格式 | 容器 | 说明 |
|------|------|------|
| .mov | QuickTime | H.264 编码可以，H.265 只在 Safari 支持 |
| .avi | AVI | 古老格式，支持度不一 |
| .mkv | Matroska | Chrome/Edge 支持，Safari 不支持 |

### ❌ 不推荐用于 Web

- ProRes (专业剪辑格式，文件巨大)
- AVI (古老格式，兼容性差)
- WMV (Windows 专有格式)

## 最佳实践

### 1. 用于网络播放的最佳格式

```bash
# 转换为 H.264 + AAC 的 MP4
ffmpeg -i input.mov \
  -vcodec h264 \
  -acodec aac \
  -crf 23 \
  -preset medium \
  -movflags +faststart \
  output.mp4
```

**参数说明：**
- `-crf 23`: 质量控制（18-28，数字越小质量越高）
- `-preset medium`: 编码速度（fast/medium/slow）
- `-movflags +faststart`: 优化网络播放（元数据移到文件开头）

### 2. 如果必须使用 .mov

确保使用 H.264 编码：

```bash
ffmpeg -i input.mov \
  -vcodec h264 \
  -acodec aac \
  -crf 20 \
  -pix_fmt yuv420p \
  output.mov
```

### 3. 批量转换脚本

```bash
#!/bin/bash
# 将 videos 目录下的所有 .mov 转换为 .mp4

for file in videos/*.mov; do
  filename=$(basename "$file" .mov)
  ffmpeg -i "$file" \
    -vcodec h264 \
    -acodec aac \
    -crf 23 \
    -movflags +faststart \
    "videos/${filename}.mp4"
done
```

## 如何测试你的 .mov 文件

### 步骤 1: 将 .mov 文件放入 videos 目录

```bash
cp ~/Downloads/your-video.mov video-streaming/videos/
```

### 步骤 2: 启动服务器

```bash
cd video-streaming
npm start
```

### 步骤 3: 打开浏览器测试

访问 http://localhost:3000

**观察控制台输出：**

```
[Range Request] your-video.mov (video/quicktime): 0-65535/10485760
```

### 步骤 4: 检查浏览器兼容性

**在不同浏览器测试：**

1. Chrome/Edge
2. Safari
3. Firefox

**如果在某个浏览器无法播放：**

1. 打开浏览器控制台（F12）
2. 查看错误信息
3. 使用 `ffmpeg -i` 检查编码格式
4. 必要时转换为 H.264

## iPhone/相机拍摄的 .mov 文件

### iPhone 拍摄的视频

**iOS 11 之前：** H.264 编码 ✅ 兼容性好

**iOS 11 之后：** 默认使用 H.265 (HEVC) ⚠️ 只有 Safari 支持

**查看 iPhone 设置：**
- 设置 → 相机 → 格式
- 选择"最兼容"而不是"高效"

### 专业相机（如 Canon, Sony）

通常使用 H.264，兼容性较好 ✅

### GoPro, DJI 无人机

可能使用 H.265，需要转换 ⚠️

## 快速参考

### 我的视频能播放吗？

```bash
# 1. 检查编码
ffmpeg -i your-video.mov 2>&1 | grep Video

# 2. 如果看到 "h264" → ✅ 可以播放
# 3. 如果看到 "hevc" 或 "h265" → ⚠️ 只在 Safari 可以
# 4. 如果看到 "prores" → ❌ 需要转换
```

### 快速转换命令

```bash
# 最简单的转换（保持质量）
ffmpeg -i input.mov output.mp4

# 优化网络播放
ffmpeg -i input.mov -vcodec h264 -acodec aac -crf 23 -movflags +faststart output.mp4

# 压缩大文件（降低质量）
ffmpeg -i input.mov -vcodec h264 -acodec aac -crf 28 -preset fast output.mp4
```

## 总结

✅ **可以使用 .mov**，但要确保：
1. 视频编码是 H.264（不是 H.265 或 ProRes）
2. 音频编码是 AAC
3. 如果不确定，先用 FFmpeg 检查或直接转换为 .mp4

❌ **不推荐直接使用 .mov**，因为：
1. 编码格式不确定
2. 文件通常比 .mp4 大
3. 兼容性不如 .mp4 好

💡 **最佳实践**：
统一转换为 H.264 编码的 .mp4 格式，确保最佳兼容性和性能。
