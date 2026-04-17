const NodeMediaServer = require('node-media-server');
const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');

// Express 服务器配置
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 提供录制文件访问
app.use('/recordings', express.static('recordings'));

const HTTP_PORT = 5000;
const WS_PORT = 5001;

// RTMP 媒体服务器配置
const config = {
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
    ffmpeg: '/opt/homebrew/bin/ffmpeg',  // macOS Homebrew 路径
    tasks: [
      {
        app: 'live',
        hls: true,
        hlsFlags: '[hls_time=2:hls_list_size=3:hls_flags=delete_segments]',
        hlsKeep: false, // 不保留切片文件
        dash: false
      },
      {
        app: 'live',
        rec: true,
        recPath: './recordings',
        recFlags: '[movflags=frag_keyframe+empty_moov]'
      }
    ]
  }
};

// 创建 RTMP 服务器
const nms = new NodeMediaServer(config);

// RTMP 事件监听
nms.on('preConnect', (id, args) => {
  console.log('[NodeEvent on preConnect]', `id=${id} args=${JSON.stringify(args)}`);
});

nms.on('postConnect', (id, args) => {
  console.log('[NodeEvent on postConnect]', `id=${id} args=${JSON.stringify(args)}`);
});

nms.on('doneConnect', (id, args) => {
  console.log('[NodeEvent on doneConnect]', `id=${id} args=${JSON.stringify(args)}`);
});

nms.on('prePublish', (id, StreamPath, args) => {
  console.log('[NodeEvent on prePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);

  // 广播新的直播流开始
  broadcastToClients({
    type: 'stream_started',
    streamPath: StreamPath,
    timestamp: new Date().toISOString()
  });
});

nms.on('postPublish', (id, StreamPath, args) => {
  console.log('[NodeEvent on postPublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

nms.on('donePublish', (id, StreamPath, args) => {
  console.log('[NodeEvent on donePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);

  // 广播直播流结束
  broadcastToClients({
    type: 'stream_stopped',
    streamPath: StreamPath,
    timestamp: new Date().toISOString()
  });
});

// WebSocket 服务器 (弹幕)
const wss = new WebSocket.Server({ port: WS_PORT });

const clients = new Set();
const danmakuHistory = []; // 存储弹幕历史
const MAX_HISTORY = 100;

wss.on('connection', (ws) => {
  console.log('WebSocket 客户端已连接');
  clients.add(ws);

  // 发送欢迎消息和弹幕历史
  ws.send(JSON.stringify({
    type: 'connected',
    message: '已连接到弹幕服务器',
    history: danmakuHistory.slice(-20) // 发送最近20条弹幕
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('收到消息:', data);

      if (data.type === 'danmaku') {
        // 添加时间戳和ID
        const danmaku = {
          ...data,
          id: Date.now() + Math.random(),
          timestamp: new Date().toISOString()
        };

        // 保存到历史
        danmakuHistory.push(danmaku);
        if (danmakuHistory.length > MAX_HISTORY) {
          danmakuHistory.shift();
        }

        // 广播给所有客户端
        broadcastToClients(danmaku);
      }
    } catch (error) {
      console.error('消息解析错误:', error);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket 客户端已断开');
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket 错误:', error);
    clients.delete(ws);
  });
});

function broadcastToClients(data) {
  const message = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// REST API
app.get('/api/status', (req, res) => {
  res.json({
    status: 'running',
    rtmpPort: 1935,
    httpPort: HTTP_PORT,
    wsPort: WS_PORT,
    hlsPort: 8000
  });
});

app.get('/api/streams', (req, res) => {
  const session = nms.nrs.getSession();
  const publishers = [];

  for (let id in session) {
    if (session[id].isStarting) {
      publishers.push({
        id: id,
        streamPath: session[id].publishStreamPath,
        connectTime: session[id].connectTime
      });
    }
  }

  res.json({ streams: publishers });
});

// 启动服务器
nms.run();
app.listen(HTTP_PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                   🎬 直播服务器已启动                          ║
╚════════════════════════════════════════════════════════════════╝

📡 RTMP 推流地址:
   rtmp://localhost:1935/live/stream_key

📺 播放器访问:
   http://localhost:${HTTP_PORT}

💬 弹幕服务器:
   ws://localhost:${WS_PORT}

🎥 HLS 播放地址:
   http://localhost:8000/live/stream_key/index.m3u8

📁 录制文件目录:
   ./recordings/

═══════════════════════════════════════════════════════════════

使用 OBS Studio 推流:
1. 打开 OBS Studio
2. 设置 → 推流
3. 服务器: rtmp://localhost:1935/live
4. 串流密钥: stream_key
5. 开始推流

═══════════════════════════════════════════════════════════════
  `);
});

console.log(`WebSocket 服务器运行在端口 ${WS_PORT}`);
