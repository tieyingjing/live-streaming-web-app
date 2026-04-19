const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const mediasoup = require('mediasoup');
const NodeMediaServer = require('node-media-server');
const { spawn } = require('child_process');
const os = require('os');

// Express 服务器配置
const app = express();

// CORS 配置 - 允许所有来源访问
const cors = require('cors');
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Range'],
  exposedHeaders: ['Content-Length', 'Content-Range'],
  credentials: false
}));

app.use(express.json());
app.use(express.static('public', {
  setHeaders: (res, path) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
}));

// 直接提供 HLS 文件服务，不依赖 node-media-server 的 HTTP 功能
// 这样更可靠，且支持 HTTPS
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

console.log('📁 HLS 文件服务: /live → ./media/live');

const HTTP_PORT = 6000;
const HTTPS_PORT = 6443;
const WS_PORT = 6001;
const MEDIASOUP_PORT_START = 10000;
const MEDIASOUP_PORT_END = 10100;

// 获取本机局域网 IP
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
  return '127.0.0.1'; // 如果没找到，回退到 localhost
}

const LOCAL_IP = getLocalIp();
console.log(`📍 检测到本机 IP: ${LOCAL_IP}`);

// WebRTC 需要 HTTPS
let httpsServer;
try {
  // 尝试加载本地证书
  const options = {
    key: fs.readFileSync(path.join(__dirname, 'certs/key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'certs/cert.pem'))
  };
  httpsServer = https.createServer(options, app);
  console.log('✅ HTTPS 证书加载成功');
} catch (e) {
  console.log('⚠️  未找到 HTTPS 证书，将使用 HTTP (仅限 localhost)');
  console.log('提示: 生成证书运行: npm run generate-cert');
  httpsServer = null;
}

const httpServer = http.createServer(app);

// Mediasoup Workers 和 Routers
let workers = [];
let nextWorkerIdx = 0;
let routers = new Map(); // streamKey -> router
let transports = new Map(); // transportId -> transport
let producers = new Map(); // producerId -> producer info
let ffmpegProcesses = new Map(); // streamKey -> ffmpeg process

// WebSocket 信令服务器
const wss = new WebSocket.Server({
  server: httpsServer || httpServer,
  path: '/signaling'
});

// ================== Mediasoup 初始化 ==================

async function createWorker() {
  const worker = await mediasoup.createWorker({
    logLevel: 'warn',
    rtcMinPort: MEDIASOUP_PORT_START,
    rtcMaxPort: MEDIASOUP_PORT_END,
  });

  worker.on('died', () => {
    console.error('❌ Mediasoup worker died, 退出...');
    setTimeout(() => process.exit(1), 2000);
  });

  return worker;
}

async function initMediasoup() {
  // 创建多个 workers (根据 CPU 核心数)
  const numWorkers = require('os').cpus().length;
  console.log(`Creating ${numWorkers} mediasoup workers...`);

  for (let i = 0; i < numWorkers; i++) {
    const worker = await createWorker();
    workers.push(worker);
  }

  console.log('✅ Mediasoup workers 已创建');
}

function getNextWorker() {
  const worker = workers[nextWorkerIdx];
  nextWorkerIdx = (nextWorkerIdx + 1) % workers.length;
  return worker;
}

async function createRouter(streamKey) {
  const worker = getNextWorker();

  const mediaCodecs = [
    {
      kind: 'audio',
      mimeType: 'audio/opus',
      clockRate: 48000,
      channels: 2
    },
    {
      kind: 'video',
      mimeType: 'video/VP8',
      clockRate: 90000,
      parameters: {
        'x-google-start-bitrate': 1000
      }
    },
    {
      kind: 'video',
      mimeType: 'video/H264',
      clockRate: 90000,
      parameters: {
        'packetization-mode': 1,
        'profile-level-id': '42e01f',
        'level-asymmetry-allowed': 1
      }
    }
  ];

  const router = await worker.createRouter({ mediaCodecs });
  routers.set(streamKey, router);

  console.log(`✅ Router created for stream: ${streamKey}`);
  return router;
}

// ================== WebSocket 信令处理 ==================

wss.on('connection', (socket) => {
  console.log('WebSocket 客户端已连接');

  socket.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      await handleSignaling(socket, data);
    } catch (error) {
      console.error('信令处理错误:', error);
      socket.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  });

  socket.on('close', () => {
    console.log('WebSocket 客户端断开');
  });
});

async function handleSignaling(socket, data) {
  const { type } = data;

  switch (type) {
    case 'getRouterRtpCapabilities': {
      const { streamKey } = data;
      let router = routers.get(streamKey);

      if (!router) {
        router = await createRouter(streamKey);
      }

      socket.send(JSON.stringify({
        type: 'routerRtpCapabilities',
        rtpCapabilities: router.rtpCapabilities
      }));
      break;
    }

    case 'createTransport': {
      const { streamKey, direction } = data; // direction: 'send' or 'recv'
      const router = routers.get(streamKey);

      if (!router) {
        throw new Error('Router not found');
      }

      const transport = await router.createWebRtcTransport({
        listenIps: [
          {
            ip: '0.0.0.0',
            announcedIp: LOCAL_IP // 使用局域网 IP，支持跨设备连接
          }
        ],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        enableSctp: false,  // 禁用 SCTP 避免 RTP 扩展冲突
        numSctpStreams: { OS: 0, MIS: 0 }
      });

      transports.set(transport.id, { transport, streamKey, direction });

      socket.send(JSON.stringify({
        type: 'transportCreated',
        transportOptions: {
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters
        }
      }));
      break;
    }

    case 'connectTransport': {
      const { transportId, dtlsParameters } = data;
      const transportInfo = transports.get(transportId);

      if (!transportInfo) {
        throw new Error('Transport not found');
      }

      await transportInfo.transport.connect({ dtlsParameters });

      socket.send(JSON.stringify({ type: 'transportConnected' }));
      break;
    }

    case 'produce': {
      const { transportId, kind, rtpParameters, streamKey } = data;
      const transportInfo = transports.get(transportId);

      if (!transportInfo) {
        throw new Error('Transport not found');
      }

      const producer = await transportInfo.transport.produce({
        kind,
        rtpParameters
      });

      producers.set(producer.id, {
        producer,
        streamKey,
        kind
      });

      // 如果是第一个 producer，启动 FFmpeg 转换
      const streamProducers = Array.from(producers.values())
        .filter(p => p.streamKey === streamKey);

      if (streamProducers.length === 1) {
        startFFmpegBridge(streamKey);
      }

      socket.send(JSON.stringify({
        type: 'produced',
        id: producer.id
      }));
      break;
    }

    default:
      console.warn('未知的信令类型:', type);
  }
}

// ================== FFmpeg 桥接 (WebRTC → RTMP) ==================

async function startFFmpegBridge(streamKey) {
  const router = routers.get(streamKey);
  if (!router) return;

  // 等待音视频 producer 都准备好
  await new Promise(resolve => setTimeout(resolve, 1000));

  const streamProducers = Array.from(producers.values())
    .filter(p => p.streamKey === streamKey);

  const videoProducer = streamProducers.find(p => p.kind === 'video');
  const audioProducer = streamProducers.find(p => p.kind === 'audio');

  if (!videoProducer) {
    console.log('等待视频流...');
    return;
  }

  // 创建 PlainTransport 用于 FFmpeg 消费
  // 最简单方案：不使用 comedia，直接指定 FFmpeg 的端口
  // FFmpeg 监听固定端口，mediasoup 主动发送到这些端口
  const ffmpegVideoPort = 10000 + Math.floor(Math.random() * 1000);
  const ffmpegAudioPort = ffmpegVideoPort + 10;

  const videoTransport = await router.createPlainTransport({
    listenIp: { ip: '0.0.0.0', announcedIp: '127.0.0.1' },
    rtcpMux: true,  // 使用单端口简化
    comedia: false,  // mediasoup 主动连接到 FFmpeg
    enableSrtp: false
  });

  const audioTransport = audioProducer ? await router.createPlainTransport({
    listenIp: { ip: '0.0.0.0', announcedIp: '127.0.0.1' },
    rtcpMux: true,
    comedia: false,
    enableSrtp: false
  }) : null;

  // 创建 Consumer
  const videoConsumer = await videoTransport.consume({
    producerId: videoProducer.producer.id,
    rtpCapabilities: router.rtpCapabilities,
    paused: true  // 先暂停，等 FFmpeg 启动后再恢复
  });

  const audioConsumer = audioProducer ? await audioTransport.consume({
    producerId: audioProducer.producer.id,
    rtpCapabilities: router.rtpCapabilities,
    paused: true
  }) : null;

  console.log(`📡 FFmpeg 将监听端口:`);
  console.log(`   视频: ${ffmpegVideoPort}`);
  if (ffmpegAudioPort) {
    console.log(`   音频: ${ffmpegAudioPort}`);
  }

  // 生成 SDP 文件，描述 RTP payload
  const sdpPath = path.join(__dirname, `stream_${streamKey}.sdp`);
  const sdpContent = generateSDPWithListen(videoConsumer, audioConsumer, ffmpegVideoPort, ffmpegAudioPort);
  fs.writeFileSync(sdpPath, sdpContent);
  console.log(`📄 SDP 文件已生成: ${sdpPath}`);

  // 启动 FFmpeg - 使用 SDP 文件
  const ffmpegArgs = buildFFmpegWithSDP(streamKey, sdpPath);
  console.log(`🎬 启动 FFmpeg`);
  const ffmpeg = spawn('ffmpeg', ffmpegArgs);

  // 等待 FFmpeg 启动并开始监听
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 连接 mediasoup 到 FFmpeg 的监听端口
  console.log(`🔌 连接 mediasoup 到 FFmpeg...`);
  await videoTransport.connect({
    ip: '127.0.0.1',
    port: ffmpegVideoPort
  });

  if (audioTransport) {
    await audioTransport.connect({
      ip: '127.0.0.1',
      port: ffmpegAudioPort
    });
  }

  // 恢复 consumer，开始发送 RTP
  console.log('🎬 恢复视频 consumer，开始发送 RTP 到 FFmpeg...');
  await videoConsumer.resume();
  if (audioConsumer) {
    console.log('🔊 恢复音频 consumer...');
    await audioConsumer.resume();
  }

  // 监听 consumer 统计信息
  setInterval(async () => {
    const stats = await videoConsumer.getStats();
    const packetCount = stats.find(s => s.type === 'outbound-rtp')?.packetCount || 0;
    if (packetCount > 0) {
      // console.log(`📊 视频 RTP 包已发送: ${packetCount}`);
    }
  }, 5000);

  ffmpeg.stdout.on('data', (data) => {
    // 忽略 stdout
  });

  ffmpeg.stderr.on('data', (data) => {
    const output = data.toString();
    // 临时启用所有日志以便调试
    // console.log(`[FFmpeg ${streamKey}] ${output.trim()}`);
  });

  ffmpeg.on('close', (code) => {
    if (code !== 0) {
      console.log(`⚠️ FFmpeg 进程退出，代码: ${code}`);
    }
    ffmpegProcesses.delete(streamKey);
  });

  ffmpegProcesses.set(streamKey, {
    process: ffmpeg,
    videoTransport,
    audioTransport,
    videoConsumer,
    audioConsumer
  });

  console.log(`✅ FFmpeg 桥接已启动: ${streamKey}`);
}

// 生成带监听端口的 SDP 文件
function generateSDPWithListen(videoConsumer, audioConsumer, videoPort, audioPort) {
  const videoCodec = videoConsumer.rtpParameters.codecs[0];
  const audioCodec = audioConsumer ? audioConsumer.rtpParameters.codecs[0] : null;

  // 注意：这里端口要写 0，因为 FFmpeg 会自动监听
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

  sdp += `a=recvonly
`;

  if (audioConsumer && audioCodec && audioPort) {
    sdp += `m=audio ${audioPort} RTP/AVP ${audioCodec.payloadType}
a=rtpmap:${audioCodec.payloadType} ${audioCodec.mimeType.split('/')[1]}/${audioCodec.clockRate}/${audioCodec.channels || 2}
`;

    if (audioCodec.parameters) {
      const fmtp = Object.entries(audioCodec.parameters)
        .map(([key, value]) => `${key}=${value}`)
        .join(';');
      if (fmtp) {
        sdp += `a=fmtp:${audioCodec.payloadType} ${fmtp}\n`;
      }
    }

    sdp += `a=recvonly
`;
  }

  return sdp;
}

// 使用 SDP 文件启动 FFmpeg
function buildFFmpegWithSDP(streamKey, sdpPath) {
  const args = [
    '-protocol_whitelist', 'file,udp,rtp',
    '-analyzeduration', '10000000',
    '-probesize', '10000000',
    '-i', sdpPath,  // 使用 SDP 文件
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-b:v', '2000k',
    '-maxrate', '2000k',
    '-bufsize', '4000k',
    '-g', '60',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '48000',
    '-f', 'flv',
    `rtmp://localhost:1935/live/${streamKey}`
  ];

  return args;
}

// 旧版本保留
function buildFFmpegCommand(streamKey, sdpPath, videoPort, audioPort) {
  // 使用 UDP 监听方式，明确告诉 FFmpeg 监听端口
  const args = [
    '-protocol_whitelist', 'file,rtp,udp',
    '-analyzeduration', '5000000',
    '-probesize', '10000000',
    '-reorder_queue_size', '0',
  ];

  // 视频输入 - 使用 UDP 监听
  args.push(
    '-f', 'sdp',
    '-i', sdpPath
  );

  // 输出设置
  args.push(
    '-c:v', 'libx264',  // VP8 转 H.264
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-b:v', '2000k',
    '-maxrate', '2000k',
    '-bufsize', '4000k',
    '-g', '60',
    '-pix_fmt', 'yuv420p'
  );

  if (audioPort) {
    args.push(
      '-c:a', 'aac',  // Opus 转 AAC
      '-b:a', '128k',
      '-ar', '48000'
    );
  } else {
    args.push('-an');  // 没有音频
  }

  args.push(
    '-f', 'flv',
    `rtmp://localhost:1935/live/${streamKey}`
  );

  return args;
}

// 为 FFmpeg 生成 SDP - FFmpeg 作为发送方连接到 mediasoup
function generateSDPForFFmpeg(videoConsumer, audioConsumer, videoPort, audioPort) {
  const videoCodec = videoConsumer.rtpParameters.codecs[0];
  const audioCodec = audioConsumer ? audioConsumer.rtpParameters.codecs[0] : null;

  let sdp = `v=0
o=- 0 0 IN IP4 127.0.0.1
s=mediasoup
c=IN IP4 127.0.0.1
t=0 0
`;

  // Video m-line - FFmpeg will send to this port
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

  sdp += `a=sendonly
`;

  // Audio m-line
  if (audioConsumer && audioCodec && audioPort) {
    sdp += `m=audio ${audioPort} RTP/AVP ${audioCodec.payloadType}
a=rtpmap:${audioCodec.payloadType} ${audioCodec.mimeType.split('/')[1]}/${audioCodec.clockRate}/${audioCodec.channels || 2}
`;

    if (audioCodec.parameters) {
      const fmtp = Object.entries(audioCodec.parameters)
        .map(([key, value]) => `${key}=${value}`)
        .join(';');
      if (fmtp) {
        sdp += `a=fmtp:${audioCodec.payloadType} ${fmtp}\n`;
      }
    }

    sdp += `a=sendonly
`;
  }

  return sdp;
}

// 旧的函数保留以防需要
function generateSDP(videoConsumer, audioConsumer, videoPort, audioPort) {
  const videoCodec = videoConsumer.rtpParameters.codecs[0];
  const audioCodec = audioConsumer ? audioConsumer.rtpParameters.codecs[0] : null;

  let sdp = `v=0
o=- 0 0 IN IP4 127.0.0.1
s=FFmpeg Stream
c=IN IP4 127.0.0.1
t=0 0
`;

  // Video m-line with UDP listen directive
  sdp += `m=video ${videoPort} RTP/AVP ${videoCodec.payloadType}
c=IN IP4 127.0.0.1
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

  sdp += `a=recvonly
a=rtcp:${videoPort + 1}
`;

  // Audio m-line
  if (audioConsumer && audioCodec) {
    sdp += `m=audio ${audioPort} RTP/AVP ${audioCodec.payloadType}
c=IN IP4 127.0.0.1
a=rtpmap:${audioCodec.payloadType} ${audioCodec.mimeType.split('/')[1]}/${audioCodec.clockRate}/${audioCodec.channels || 2}
`;

    if (audioCodec.parameters) {
      const fmtp = Object.entries(audioCodec.parameters)
        .map(([key, value]) => `${key}=${value}`)
        .join(';');
      if (fmtp) {
        sdp += `a=fmtp:${audioCodec.payloadType} ${fmtp}\n`;
      }
    }

    sdp += `a=recvonly
a=rtcp:${audioPort + 1}
`;
  }

  return sdp;
}

// ================== RTMP 服务器 ==================

const rtmpConfig = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60
  },
  http: {
    port: 8000,
    allow_origin: '*',
    mediaroot: './media',
    api: true  // 启用 API
  },
  trans: {
    ffmpeg: '/usr/local/bin/ffmpeg',
    tasks: [
      {
        app: 'live',
        hls: true,
        hlsFlags: '[hls_time=3:hls_list_size=6:hls_flags=delete_segments+append_list:hls_delete_threshold=3]',
        hlsKeep: true  // 保留切片文件以便播放
      },
      {
        app: 'live',
        mp4: true,
        mp4Flags: '[movflags=frag_keyframe+empty_moov]'  // 录制为 MP4
      }
    ]
  }
};

const nms = new NodeMediaServer(rtmpConfig);

nms.on('prePublish', (id, StreamPath, args) => {
  console.log('[RTMP] 推流开始:', StreamPath);
});

nms.on('donePublish', (id, StreamPath, args) => {
  console.log('[RTMP] 推流结束:', StreamPath);

  // 清理 WebRTC 相关资源
  const streamKey = StreamPath.split('/').pop();
  cleanupStream(streamKey);
});

function cleanupStream(streamKey) {
  // 停止 FFmpeg
  const ffmpegInfo = ffmpegProcesses.get(streamKey);
  if (ffmpegInfo) {
    ffmpegInfo.process.kill();
    ffmpegProcesses.delete(streamKey);
  }

  // 清理 producers
  const streamProducers = Array.from(producers.entries())
    .filter(([, info]) => info.streamKey === streamKey);

  streamProducers.forEach(([id]) => producers.delete(id));

  // 清理 router
  routers.delete(streamKey);

  console.log(`✅ 清理完成: ${streamKey}`);
}

// ================== REST API ==================

app.get('/api/status', (req, res) => {
  res.json({
    status: 'running',
    httpPort: HTTP_PORT,
    httpsPort: HTTPS_PORT,
    wsPort: WS_PORT,
    rtmpPort: 1935,
    hlsPort: 8000,
    workers: workers.length,
    activeStreams: routers.size
  });
});

app.get('/api/streams', (req, res) => {
  const streams = Array.from(routers.keys()).map(streamKey => ({
    streamKey,
    producers: Array.from(producers.values())
      .filter(p => p.streamKey === streamKey)
      .map(p => ({ kind: p.kind, id: p.producer.id }))
  }));

  res.json({ streams });
});

// ================== 启动服务器 ==================

async function main() {
  try {
    // 初始化 Mediasoup
    await initMediasoup();

    // 启动 RTMP 服务器
    nms.run();

    // 启动 HTTP/HTTPS 服务器（监听所有网络接口）
    httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
      console.log(`
╔════════════════════════════════════════════════════════════════╗
║          🎬 阶段5: WebRTC + RTMP 直播服务器已启动              ║
╚════════════════════════════════════════════════════════════════╝

📡 推流方式:

方式 1: 网页 WebRTC 推流 (新!) ⭐
   └─ 访问: https://localhost:${HTTPS_PORT}/stream.html
      (或 http://localhost:${HTTP_PORT}/stream.html 仅localhost)

方式 2: OBS/FFmpeg RTMP 推流
   └─ rtmp://localhost:1935/live/stream_key

📺 播放器访问:
   └─ http://localhost:${HTTP_PORT}

🎥 HLS 播放地址:
   └─ http://localhost:8000/live/stream_key/index.m3u8

💬 WebSocket 信令:
   └─ ws://localhost:${HTTP_PORT}/signaling

═══════════════════════════════════════════════════════════════

⚠️  注意: WebRTC 推流需要 HTTPS
   - localhost 自动允许 HTTP
   - 生产环境需要 SSL 证书

生成自签名证书:
   openssl req -nodes -new -x509 -keyout certs/key.pem \\
     -out certs/cert.pem -days 365

═══════════════════════════════════════════════════════════════
      `);
    });

    if (httpsServer) {
      httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
        console.log(`✅ HTTPS 服务器运行在端口 ${HTTPS_PORT}`);
      });
    }

  } catch (error) {
    console.error('❌ 服务器启动失败:', error);
    process.exit(1);
  }
}

main();
