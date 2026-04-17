const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 4000;

// 提供静态文件
app.use(express.static('public'));

// CORS 支持（允许跨域请求 HLS 文件）
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

/**
 * 获取可用的 HLS 视频列表
 */
app.get('/api/videos', (req, res) => {
    const hlsDir = path.join(__dirname, 'hls-output');

    if (!fs.existsSync(hlsDir)) {
        return res.json([]);
    }

    try {
        const videos = fs.readdirSync(hlsDir)
            .filter(item => {
                const itemPath = path.join(hlsDir, item);
                return fs.statSync(itemPath).isDirectory();
            })
            .map(videoName => {
                const masterPath = path.join(hlsDir, videoName, 'master.m3u8');

                // 统计视频信息
                const videoDir = path.join(hlsDir, videoName);
                const files = fs.readdirSync(videoDir);
                let totalSize = 0;

                files.forEach(file => {
                    const filePath = path.join(videoDir, file);
                    totalSize += fs.statSync(filePath).size;
                });

                // 检测可用的码率
                const qualities = [];
                if (fs.existsSync(path.join(videoDir, '360p.m3u8'))) qualities.push('360p');
                if (fs.existsSync(path.join(videoDir, '720p.m3u8'))) qualities.push('720p');
                if (fs.existsSync(path.join(videoDir, '1080p.m3u8'))) qualities.push('1080p');

                return {
                    name: videoName,
                    url: `/hls/${videoName}/master.m3u8`,
                    size: totalSize,
                    qualities: qualities,
                    hasMasterPlaylist: fs.existsSync(masterPath)
                };
            });

        res.json(videos);
    } catch (error) {
        console.error('获取视频列表失败:', error);
        res.status(500).json({ error: 'Failed to get video list' });
    }
});

/**
 * 提供 HLS 文件（.m3u8 和 .ts）
 */
app.get('/hls/:videoName/:file', (req, res) => {
    const { videoName, file } = req.params;
    const filePath = path.join(__dirname, 'hls-output', videoName, file);

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found');
    }

    // 设置正确的 MIME 类型
    if (file.endsWith('.m3u8')) {
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    } else if (file.endsWith('.ts')) {
        res.setHeader('Content-Type', 'video/mp2t');
    }

    // 禁用缓存（方便开发调试）
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    // 发送文件
    res.sendFile(filePath);
});

/**
 * 获取单个视频的详细信息
 */
app.get('/api/video/:videoName/info', (req, res) => {
    const { videoName } = req.params;
    const videoDir = path.join(__dirname, 'hls-output', videoName);
    const masterPath = path.join(videoDir, 'master.m3u8');

    if (!fs.existsSync(masterPath)) {
        return res.status(404).json({ error: 'Video not found' });
    }

    try {
        // 读取主播放列表
        const masterContent = fs.readFileSync(masterPath, 'utf-8');

        // 解析码率信息
        const qualities = [];
        const lines = masterContent.split('\n');

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('#EXT-X-STREAM-INF:')) {
                const bandwidthMatch = lines[i].match(/BANDWIDTH=(\d+)/);
                const resolutionMatch = lines[i].match(/RESOLUTION=(\d+x\d+)/);
                const playlistFile = lines[i + 1];

                if (bandwidthMatch && resolutionMatch && playlistFile) {
                    qualities.push({
                        bandwidth: parseInt(bandwidthMatch[1]),
                        resolution: resolutionMatch[1],
                        playlist: playlistFile
                    });
                }
            }
        }

        // 统计每个码率的分片数量
        qualities.forEach(quality => {
            const playlistPath = path.join(videoDir, quality.playlist);
            if (fs.existsSync(playlistPath)) {
                const content = fs.readFileSync(playlistPath, 'utf-8');
                const segments = content.split('\n').filter(line => line.endsWith('.ts'));
                quality.segments = segments.length;
            }
        });

        res.json({
            name: videoName,
            qualities: qualities,
            url: `/hls/${videoName}/master.m3u8`
        });

    } catch (error) {
        console.error('获取视频信息失败:', error);
        res.status(500).json({ error: 'Failed to get video info' });
    }
});

/**
 * 健康检查
 */
app.get('/health', (req, res) => {
    const hlsDir = path.join(__dirname, 'hls-output');
    const videoCount = fs.existsSync(hlsDir)
        ? fs.readdirSync(hlsDir).filter(item => {
            return fs.statSync(path.join(hlsDir, item)).isDirectory();
          }).length
        : 0;

    res.json({
        status: 'ok',
        videoCount: videoCount,
        hlsOutputDir: hlsDir
    });
});

// 404 处理
app.use((req, res) => {
    res.status(404).send('Not found');
});

// 启动服务器
app.listen(PORT, () => {
    console.log('\n' + '='.repeat(60));
    console.log('🎬 HLS 流媒体服务器');
    console.log('='.repeat(60));
    console.log(`🌐 服务器地址: http://localhost:${PORT}`);
    console.log(`📁 HLS 输出目录: ${path.join(__dirname, 'hls-output')}`);
    console.log('='.repeat(60));

    const hlsDir = path.join(__dirname, 'hls-output');
    if (!fs.existsSync(hlsDir) || fs.readdirSync(hlsDir).length === 0) {
        console.log('\n⚠️  还没有 HLS 视频');
        console.log('\n使用方法:');
        console.log('  1. 将视频放入 source-videos/ 文件夹');
        console.log('  2. 运行: npm run transcode');
        console.log('  3. 刷新浏览器\n');
    } else {
        const videoCount = fs.readdirSync(hlsDir).filter(item => {
            return fs.statSync(path.join(hlsDir, item)).isDirectory();
        }).length;
        console.log(`\n✅ 找到 ${videoCount} 个 HLS 视频\n`);
    }

    console.log('='.repeat(60) + '\n');
});
