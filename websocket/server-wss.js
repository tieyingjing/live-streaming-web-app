/**
 * WSS (WebSocket Secure) 服务器实现 - HTTPS + WebSocket
 *
 * 学习要点：
 * 1. WSS 使用 TLS/SSL 加密，类似 HTTPS
 * 2. 需要 SSL 证书（生产环境）或自签名证书（开发环境）
 * 3. 客户端使用 wss:// 而不是 ws://
 * 4. 更安全，防止中间人攻击和数据窃听
 */

const WebSocket = require('ws');
const https = require('https');  // 使用 https 而不是 http
const fs = require('fs');
const path = require('path');

// ==================== SSL 证书配置 ====================

/**
 * 生产环境：使用真实的 SSL 证书
 * 开发环境：使用自签名证书
 *
 * 生成自签名证书命令：
 * openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes
 */

let serverOptions;

try {
  // 尝试加载 SSL 证书
  serverOptions = {
    key: fs.readFileSync(path.join(__dirname, 'ssl', 'key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'ssl', 'cert.pem'))
  };
  console.log('✅ 使用真实 SSL 证书');
} catch (error) {
  // 如果没有证书，生成临时自签名证书说明
  console.log('⚠️  未找到 SSL 证书文件');
  console.log('📝 请运行以下命令生成自签名证书（仅用于开发）：');
  console.log('');
  console.log('mkdir -p ssl');
  console.log('openssl req -x509 -newkey rsa:4096 -keyout ssl/key.pem -out ssl/cert.pem -days 365 -nodes -subj "/CN=localhost"');
  console.log('');
  console.log('然后重新启动服务器。');
  console.log('');
  console.log('💡 如果没有安装 openssl，可以：');
  console.log('   macOS: brew install openssl');
  console.log('   Ubuntu: apt-get install openssl');
  console.log('   Windows: 使用 Git Bash 或下载 OpenSSL');
  process.exit(1);
}

// ==================== HTTPS 服务器配置 ====================

/**
 * 创建 HTTPS 服务器用于提供静态文件
 * WSS 必须运行在 HTTPS 之上
 */
const server = https.createServer(serverOptions, (req, res) => {
  // 处理根路径，返回 index.html
  if (req.url === '/' || req.url === '/index.html') {
    fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading index.html');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// ==================== WSS 服务器配置 ====================

/**
 * 创建 WSS (WebSocket Secure) 服务器
 * - 附加到 HTTPS 服务器上
 * - 所有通信都经过 TLS/SSL 加密
 * - 防止中间人攻击和窃听
 */
const wss = new WebSocket.Server({
  server,
  // 可选配置
  verifyClient: (info) => {
    // 可以在这里验证客户端（如检查 origin、cookie 等）
    // 返回 false 拒绝连接
    return true;
  }
});

// 存储所有连接的客户端
const clients = new Map();

// 生成唯一用户 ID
let userIdCounter = 1;

// ==================== 工具函数 ====================

function broadcast(message, sender = null) {
  const messageStr = JSON.stringify(message);

  clients.forEach((clientInfo, client) => {
    if (client !== sender &&
        client.readyState === WebSocket.OPEN &&
        clientInfo.authenticated) {
      client.send(messageStr);
    }
  });
}

function sendToClient(client, message) {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(message));
  }
}

function getOnlineUsers() {
  const users = [];
  clients.forEach((clientInfo) => {
    if (clientInfo.authenticated) {
      users.push({
        id: clientInfo.id,
        username: clientInfo.username,
        joinTime: clientInfo.joinTime
      });
    }
  });
  return users;
}

// ==================== WebSocket 连接处理 ====================

wss.on('connection', (ws, req) => {
  // 获取客户端信息
  const clientIp = req.socket.remoteAddress;
  const isSecure = req.socket.encrypted; // 验证是否加密

  console.log(`📡 新客户端连接尝试 [IP: ${clientIp}, 加密: ${isSecure ? '✅' : '❌'}]`);

  const clientInfo = {
    id: userIdCounter++,
    username: null,
    authenticated: false,
    joinTime: null,
    lastHeartbeat: Date.now(),
    ip: clientIp
  };

  clients.set(ws, clientInfo);

  sendToClient(ws, {
    type: 'welcome',
    message: '欢迎连接到 WSS 加密聊天服务器！',
    data: {
      serverId: clientInfo.id,
      timestamp: new Date().toISOString(),
      secure: true
    }
  });

  // ==================== 消息接收处理 ====================

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      console.log(`📨 收到消息 [${message.type}]:`, message);

      switch (message.type) {
        case 'join':
          handleUserJoin(ws, message);
          break;

        case 'chat':
          handleChatMessage(ws, message);
          break;

        case 'ping':
          handlePing(ws);
          break;

        case 'typing':
          handleTyping(ws, message);
          break;

        default:
          console.log('⚠️  未知消息类型:', message.type);
      }
    } catch (error) {
      console.error('❌ 解析消息出错:', error);
      sendToClient(ws, {
        type: 'error',
        message: '消息格式错误'
      });
    }
  });

  // ==================== 连接关闭处理 ====================

  ws.on('close', () => {
    const info = clients.get(ws);
    console.log(`👋 用户断开连接: ${info?.username || '未认证用户'}`);

    if (info && info.authenticated) {
      broadcast({
        type: 'user_left',
        data: {
          username: info.username,
          userId: info.id,
          timestamp: new Date().toISOString(),
          onlineUsers: getOnlineUsers().length - 1
        }
      });
    }

    clients.delete(ws);
  });

  // ==================== 错误处理 ====================

  ws.on('error', (error) => {
    console.error('❌ WebSocket 错误:', error);
  });
});

// ==================== 消息处理函数 ====================

function handleUserJoin(ws, message) {
  const clientInfo = clients.get(ws);
  const username = message.username || `用户${clientInfo.id}`;

  clientInfo.username = username;
  clientInfo.authenticated = true;
  clientInfo.joinTime = new Date().toISOString();

  console.log(`✅ 用户加入: ${username}`);

  sendToClient(ws, {
    type: 'join_success',
    data: {
      userId: clientInfo.id,
      username: username,
      onlineUsers: getOnlineUsers()
    }
  });

  broadcast({
    type: 'user_joined',
    data: {
      username: username,
      userId: clientInfo.id,
      timestamp: clientInfo.joinTime,
      onlineUsers: getOnlineUsers()
    }
  }, ws);
}

function handleChatMessage(ws, message) {
  const clientInfo = clients.get(ws);

  if (!clientInfo.authenticated) {
    sendToClient(ws, {
      type: 'error',
      message: '请先加入聊天室'
    });
    return;
  }

  const chatMessage = {
    type: 'chat',
    data: {
      username: clientInfo.username,
      userId: clientInfo.id,
      message: message.message,
      timestamp: new Date().toISOString()
    }
  };

  console.log(`💬 [${clientInfo.username}]: ${message.message}`);

  broadcast(chatMessage);
  sendToClient(ws, chatMessage);
}

function handlePing(ws) {
  const clientInfo = clients.get(ws);
  clientInfo.lastHeartbeat = Date.now();

  sendToClient(ws, {
    type: 'pong',
    timestamp: Date.now()
  });
}

function handleTyping(ws, message) {
  const clientInfo = clients.get(ws);

  if (!clientInfo.authenticated) return;

  broadcast({
    type: 'typing',
    data: {
      username: clientInfo.username,
      userId: clientInfo.id,
      isTyping: message.isTyping
    }
  }, ws);
}

// ==================== 心跳检测定时器 ====================

setInterval(() => {
  const now = Date.now();
  const HEARTBEAT_TIMEOUT = 60000;

  clients.forEach((clientInfo, ws) => {
    if (now - clientInfo.lastHeartbeat > HEARTBEAT_TIMEOUT) {
      console.log(`⏰ 客户端心跳超时，断开连接: ${clientInfo.username || '未认证'}`);
      ws.terminate();
    }
  });
}, 30000);

// ==================== 启动服务器 ====================

const PORT = process.env.PORT || 3443; // WSS 常用端口：3443 或 443

server.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🔒 WSS (WebSocket Secure) 加密聊天服务器已启动！');
  console.log(`📡 HTTPS 服务器: https://localhost:${PORT}`);
  console.log(`🔐 WSS 服务器: wss://localhost:${PORT}`);
  console.log('='.repeat(60));
  console.log('');
  console.log('🔐 安全特性：');
  console.log('✅ TLS/SSL 加密通信');
  console.log('✅ 防止中间人攻击');
  console.log('✅ 数据传输加密');
  console.log('');
  console.log('⚠️  注意：');
  console.log('- 如果使用自签名证书，浏览器会显示安全警告');
  console.log('- 点击"高级" -> "继续访问"即可');
  console.log('- 生产环境请使用 Let\'s Encrypt 等免费证书');
  console.log('');
  console.log('💡 WSS vs WS:');
  console.log('- WS (ws://): 未加密，类似 HTTP');
  console.log('- WSS (wss://): 加密，类似 HTTPS');
  console.log('- 生产环境必须使用 WSS！');
  console.log('');
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('\n👋 正在关闭服务器...');

  broadcast({
    type: 'server_shutdown',
    message: '服务器即将关闭'
  });

  server.close(() => {
    console.log('✅ 服务器已关闭');
    process.exit(0);
  });
});
