const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// 提供静态文件
app.use(express.static('public'));

// 根据文件扩展名获取 MIME 类型
function getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
        '.mp4': 'video/mp4',
        '.mov': 'video/quicktime',
        '.webm': 'video/webm',
        '.ogg': 'video/ogg',
        '.avi': 'video/x-msvideo',
        '.mkv': 'video/x-matroska'
    };
    return mimeTypes[ext] || 'video/mp4';
}

// 视频流端点 - 支持 Range Requests
app.get('/video/:filename', (req, res) => {
    const filename = req.params.filename;
    const videoPath = path.join(__dirname, 'videos', filename);

    // 检查文件是否存在
    if (!fs.existsSync(videoPath)) {
        return res.status(404).send('Video not found');
    }

    // 获取文件信息
    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const mimeType = getMimeType(filename);

    if (range) {
        // 解析 Range 头
        // Range: bytes=0-1024
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        // 计算实际读取的长度
        const chunkSize = (end - start) + 1;

        // 创建可读流
        const file = fs.createReadStream(videoPath, { start, end });

        // 设置响应头
        const headers = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': mimeType,
        };

        // 206 Partial Content
        res.writeHead(206, headers);
        file.pipe(res);

        console.log(`[Range Request] ${filename} (${mimeType}): ${start}-${end}/${fileSize}`);
    } else {
        // 没有 Range 头，返回整个文件
        const headers = {
            'Content-Length': fileSize,
            'Content-Type': mimeType,
        };

        res.writeHead(200, headers);
        fs.createReadStream(videoPath).pipe(res);

        console.log(`[Full Request] ${filename} (${mimeType}): 0-${fileSize}`);
    }
});

// 获取视频列表
app.get('/api/videos', (req, res) => {
    const videosDir = path.join(__dirname, 'videos');

    if (!fs.existsSync(videosDir)) {
        return res.json([]);
    }

    const videoExtensions = ['.mp4', '.mov', '.webm', '.ogg', '.avi', '.mkv'];

    const files = fs.readdirSync(videosDir)
        .filter(file => {
            const ext = path.extname(file).toLowerCase();
            return videoExtensions.includes(ext);
        })
        .map(file => ({
            name: file,
            url: `/video/${file}`,
            size: fs.statSync(path.join(videosDir, file)).size,
            type: getMimeType(file)
        }));

    res.json(files);
});

app.listen(PORT, () => {
    console.log(`🎬 视频流服务器运行在 http://localhost:${PORT}`);
    console.log(`📁 视频文件夹: ${path.join(__dirname, 'videos')}`);
    console.log(`\n支持的格式: .mp4, .mov, .webm, .ogg, .avi, .mkv`);
    console.log(`请将视频文件放入 videos/ 文件夹中\n`);
});
