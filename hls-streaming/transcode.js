const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

/**
 * HLS 视频转码器
 * 将源视频转码为多码率的 HLS 流
 */

// 转码配置：不同画质的参数
const PROFILES = [
    {
        name: '360p',
        width: 640,
        height: 360,
        videoBitrate: '800k',
        audioBitrate: '96k',
        description: '低画质 - 适合慢速网络'
    },
    {
        name: '720p',
        width: 1280,
        height: 720,
        videoBitrate: '2500k',
        audioBitrate: '128k',
        description: '中画质 - 适合一般网络'
    },
    {
        name: '1080p',
        width: 1920,
        height: 1080,
        videoBitrate: '5000k',
        audioBitrate: '192k',
        description: '高画质 - 适合快速网络'
    }
];

/**
 * 转码单个码率
 */
function transcodeToProfile(inputPath, outputDir, profile) {
    return new Promise((resolve, reject) => {
        const outputPath = path.join(outputDir, `${profile.name}.m3u8`);
        const segmentPattern = path.join(outputDir, `${profile.name}_%03d.ts`);

        console.log(`\n🎬 开始转码: ${profile.name} (${profile.description})`);
        console.log(`   分辨率: ${profile.width}x${profile.height}`);
        console.log(`   视频码率: ${profile.videoBitrate}`);
        console.log(`   音频码率: ${profile.audioBitrate}`);

        ffmpeg(inputPath)
            // 视频编码
            .videoCodec('libx264')
            .size(`${profile.width}x${profile.height}`)
            .videoBitrate(profile.videoBitrate)
            .fps(30)

            // 音频编码
            .audioCodec('aac')
            .audioBitrate(profile.audioBitrate)
            .audioChannels(2)

            // HLS 参数
            .outputOptions([
                '-f hls',                          // 输出格式：HLS
                '-hls_time 6',                     // 每段 6 秒
                '-hls_list_size 0',                // 保留所有分片
                '-hls_segment_filename', segmentPattern
            ])

            // 输出路径
            .output(outputPath)

            // 进度监控
            .on('start', (commandLine) => {
                console.log(`   FFmpeg 命令: ${commandLine.substring(0, 100)}...`);
            })
            .on('progress', (progress) => {
                if (progress.percent) {
                    process.stdout.write(`   \r进度: ${progress.percent.toFixed(1)}%`);
                }
            })
            .on('end', () => {
                console.log(`\n   ✅ ${profile.name} 转码完成`);
                resolve(outputPath);
            })
            .on('error', (err) => {
                console.error(`\n   ❌ ${profile.name} 转码失败:`, err.message);
                reject(err);
            })
            .run();
    });
}

/**
 * 生成主播放列表 (master.m3u8)
 * 包含所有码率选项
 */
function generateMasterPlaylist(outputDir, profiles) {
    const masterContent = [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        ''
    ];

    profiles.forEach(profile => {
        const bandwidth = parseInt(profile.videoBitrate) * 1000;
        masterContent.push(
            `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${profile.width}x${profile.height}`,
            `${profile.name}.m3u8`,
            ''
        );
    });

    const masterPath = path.join(outputDir, 'master.m3u8');
    fs.writeFileSync(masterPath, masterContent.join('\n'));

    console.log('\n📝 生成主播放列表: master.m3u8');
    console.log('   包含码率:', profiles.map(p => p.name).join(', '));

    return masterPath;
}

/**
 * 转码视频到 HLS 格式（所有码率）
 */
async function transcodeToHLS(inputPath, videoName = null) {
    try {
        // 支持绝对路径和相对路径
        let resolvedInputPath = inputPath;
        if (!path.isAbsolute(inputPath)) {
            resolvedInputPath = path.resolve(inputPath);
        }

        // 验证输入文件
        if (!fs.existsSync(resolvedInputPath)) {
            throw new Error(`输入文件不存在: ${resolvedInputPath}`);
        }

        // 确定输出目录
        if (!videoName) {
            videoName = path.basename(resolvedInputPath, path.extname(resolvedInputPath));
        }
        const outputDir = path.join(__dirname, 'hls-output', videoName);

        // 创建输出目录
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        console.log('\n' + '='.repeat(60));
        console.log('🎥 HLS 转码开始');
        console.log('='.repeat(60));
        console.log(`源文件: ${inputPath}`);
        console.log(`输出目录: ${outputDir}`);
        console.log(`视频名称: ${videoName}`);

        // 获取视频信息
        await getVideoInfo(resolvedInputPath);

        // 转码所有码率
        console.log('\n' + '-'.repeat(60));
        console.log('开始转码多码率...');
        console.log('-'.repeat(60));

        for (const profile of PROFILES) {
            await transcodeToProfile(resolvedInputPath, outputDir, profile);
        }

        // 生成主播放列表
        console.log('\n' + '-'.repeat(60));
        const masterPlaylist = generateMasterPlaylist(outputDir, PROFILES);
        console.log('-'.repeat(60));

        // 统计文件信息
        const stats = getOutputStats(outputDir);

        console.log('\n' + '='.repeat(60));
        console.log('✅ 转码完成！');
        console.log('='.repeat(60));
        console.log(`总文件数: ${stats.fileCount}`);
        console.log(`总大小: ${formatBytes(stats.totalSize)}`);
        console.log(`\n主播放列表: ${masterPlaylist}`);
        console.log('\n启动服务器: npm start');
        console.log('访问地址: http://localhost:4000');
        console.log('='.repeat(60) + '\n');

        return masterPlaylist;

    } catch (error) {
        console.error('\n❌ 转码失败:', error.message);
        throw error;
    }
}

/**
 * 获取视频信息
 */
function getVideoInfo(inputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(inputPath, (err, metadata) => {
            if (err) {
                reject(err);
                return;
            }

            const video = metadata.streams.find(s => s.codec_type === 'video');
            const audio = metadata.streams.find(s => s.codec_type === 'audio');

            console.log('\n📊 源视频信息:');
            if (video) {
                console.log(`   分辨率: ${video.width}x${video.height}`);
                console.log(`   编码: ${video.codec_name}`);
                console.log(`   帧率: ${eval(video.r_frame_rate).toFixed(2)} fps`);
            }
            if (audio) {
                console.log(`   音频编码: ${audio.codec_name}`);
                console.log(`   采样率: ${audio.sample_rate} Hz`);
            }
            console.log(`   时长: ${formatDuration(metadata.format.duration)}`);
            console.log(`   文件大小: ${formatBytes(metadata.format.size)}`);

            resolve(metadata);
        });
    });
}

/**
 * 统计输出文件信息
 */
function getOutputStats(outputDir) {
    const files = fs.readdirSync(outputDir);
    let totalSize = 0;

    files.forEach(file => {
        const filePath = path.join(outputDir, file);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
    });

    return {
        fileCount: files.length,
        totalSize: totalSize
    };
}

/**
 * 格式化字节大小
 */
function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

/**
 * 格式化时长
 */
function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// CLI 使用
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('\n使用方法:');
        console.log('  node transcode.js <视频文件路径> [输出名称]\n');
        console.log('示例:');
        console.log('  node transcode.js source-videos/sample.mp4');
        console.log('  node transcode.js source-videos/my-video.mov my-video\n');
        process.exit(1);
    }

    const inputPath = args[0];
    const videoName = args[1];

    transcodeToHLS(inputPath, videoName)
        .then(() => {
            console.log('转码成功完成！');
            process.exit(0);
        })
        .catch((error) => {
            console.error('转码失败:', error);
            process.exit(1);
        });
}

module.exports = { transcodeToHLS, PROFILES };
