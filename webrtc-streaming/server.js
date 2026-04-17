const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const mediasoup = require('mediasoup');
const NodeMediaServer = require('node-media-server');
const { spawn } = require('child_process');

// Express 服务器配置
const app = express();
app.use(express.json());
app.use(express.static('public'));

const HTTP_PORT = 6000;
const HTTPS_PORT = 6443;
const WS_PORT = 6001;
const MEDIASOUP_PORT_START = 10000;
const MEDIASOUP_PORT_END = 10100;

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
            announcedIp: '127.0.0.1' // 在生产环境改为公网 IP
          }
        ],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true
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
  const videoTransport = await router.createPlainTransport({
    listenIp: { ip: '127.0.0.1', announcedIp: null },
    rtcpMux: false,
    comedia: true
  });

  const audioTransport = audioProducer ? await router.createPlainTransport({
    listenIp: { ip: '127.0.0.1', announcedIp: null },
    rtcpMux: false,
    comedia: true
  }) : null;

  // 创建 Consumer
  const videoConsumer = await videoTransport.consume({
    producerId: videoProducer.producer.id,
    rtpCapabilities: router.rtpCapabilities,
    paused: false
  });

  const audioConsumer = audioProducer ? await audioTransport.consume({
    producerId: audioProducer.producer.id,
    rtpCapabilities: router.rtpCapabilities,
    paused: false
  }) : null;

  // 构建 FFmpeg 命令
  const videoPort = videoTransport.tuple.localPort;
  const audioPort = audioTransport ? audioTransport.tuple.localPort : null;

  const ffmpegCmd = buildFFmpegCommand(streamKey, videoPort, audioPort);

  const ffmpeg = spawn('ffmpeg', ffmpegCmd.split(' '));

  ffmpeg.stdout.on('data', (data) => {
    console.log(`[FFmpeg] ${data}`);
  });

  ffmpeg.stderr.on('data', (data) => {
    // FFmpeg 输出到 stderr
    // console.log(`[FFmpeg] ${data}`);
  });

  ffmpeg.on('close', (code) => {
    console.log(`FFmpeg 进程退出，代码: ${code}`);
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

function buildFFmpegCommand(streamKey, videoPort, audioPort) {
  let cmd = `-protocol_whitelist file,rtp,udp -i rtp://127.0.0.1:${videoPort}`;

  if (audioPort) {
    cmd += ` -protocol_whitelist file,rtp,udp -i rtp://127.0.0.1:${audioPort}`;
    cmd += ` -map 0:v -map 1:a`;
  } else {
    cmd += ` -map 0:v`;
  }

  cmd += ` -c:v libx264 -preset ultrafast -tune zerolatency`;
  cmd += ` -c:a aac -b:a 128k`;
  cmd += ` -f flv rtmp://localhost:1935/live/${streamKey}`;

  return cmd;
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
    mediaroot: './media'
  },
  trans: {
    ffmpeg: '/opt/homebrew/bin/ffmpeg',
    tasks: [
      {
        app: 'live',
        hls: true,
        hlsFlags: '[hls_time=2:hls_list_size=3:hls_flags=delete_segments]',
        hlsKeep: false
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

    // 启动 HTTP/HTTPS 服务器
    httpServer.listen(HTTP_PORT, () => {
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
      httpsServer.listen(HTTPS_PORT, () => {
        console.log(`✅ HTTPS 服务器运行在端口 ${HTTPS_PORT}`);
      });
    }

  } catch (error) {
    console.error('❌ 服务器启动失败:', error);
    process.exit(1);
  }
}

main();
