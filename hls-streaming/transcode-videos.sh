#!/bin/bash

# HLS 转码脚本 - 转码 video-streaming/videos 中的视频

echo "======================================"
echo "HLS 视频转码工具"
echo "======================================"

# 视频源目录
VIDEO_DIR="../video-streaming/videos"

# 检查目录是否存在
if [ ! -d "$VIDEO_DIR" ]; then
    echo "❌ 错误: 找不到视频目录 $VIDEO_DIR"
    exit 1
fi

# 查找所有视频文件
echo ""
echo "📁 扫描视频目录: $VIDEO_DIR"
echo ""

# 计数器
count=0

# 遍历视频文件
for video in "$VIDEO_DIR"/*.{mp4,mov,webm,avi,mkv}; do
    # 检查文件是否存在（避免匹配失败）
    if [ ! -f "$video" ]; then
        continue
    fi

    filename=$(basename "$video")
    echo "找到视频: $filename"
    count=$((count + 1))
done

if [ $count -eq 0 ]; then
    echo ""
    echo "❌ 未找到视频文件"
    echo ""
    echo "请将视频文件放入: $VIDEO_DIR"
    echo "支持格式: .mp4, .mov, .webm, .avi, .mkv"
    exit 1
fi

echo ""
echo "共找到 $count 个视频文件"
echo ""
echo "======================================"
echo ""

# 询问用户
read -p "是否开始转码所有视频？(y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "已取消"
    exit 0
fi

echo ""
echo "======================================"
echo "开始转码..."
echo "======================================"
echo ""

# 转码所有视频
for video in "$VIDEO_DIR"/*.{mp4,mov,webm,avi,mkv}; do
    if [ ! -f "$video" ]; then
        continue
    fi

    filename=$(basename "$video")

    echo ""
    echo "--------------------------------------"
    echo "转码: $filename"
    echo "--------------------------------------"

    node transcode.js "$video"

    if [ $? -eq 0 ]; then
        echo "✅ $filename 转码成功"
    else
        echo "❌ $filename 转码失败"
    fi
done

echo ""
echo "======================================"
echo "✅ 所有视频转码完成！"
echo "======================================"
echo ""
echo "启动服务器: npm start"
echo "访问地址: http://localhost:4000"
echo ""
