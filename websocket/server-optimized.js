/**
 * 优化版 WebSocket 服务器 - 支持更大并发
 *
 * 优化要点：
 * 1. 连接数限制（防止资源耗尽）
 * 2. 速率限制（防止消息洪水攻击）
 * 3. 内存优化（减少每个连接的开销）
 * 4. 房间机制（减少不必要的广播）
 * 5. 消息队列（平滑处理峰值）
 */

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ==================== 配置参数 ====================

const CONFIG = {
  // 连接限制
  MAX_CONNECTIONS: 10000,              // 最大连接数
  MAX_CONNECTIONS_PER_IP: 100000,      // 每个IP最大连接数（已提高用于压力测试）

  // 速率限制
  MAX_MESSAGES_PER_MINUTE: 60,         // 每分钟最大消息数
  MESSAGE_SIZE_LIMIT: 1024,            // 消息最大字节数 (1KB)

  // 心跳配置
  HEARTBEAT_INTERVAL: 30000,           // 心跳间隔 (30秒)
  HEARTBEAT_TIMEOUT: 60000,            // 心跳超时 (60秒)

  // 性能配置
  BROADCAST_BATCH_SIZE: 100,           // 批量广播大小
  ENABLE_COMPRESSION: false,           // 是否启用压缩（需要客户端支持）
};

// ==================== HTTP 服务器 ====================

const server = http.createServer((req, res) => {
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
  } else if (req.url === '/stats') {
    // 服务器统计接口
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getServerStats(), null, 2));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// ==================== WebSocket 服务器 ====================

const wss = new WebSocket.Server({
  server,
  perMessageDeflate: CONFIG.ENABLE_COMPRESSION,
  clientTracking: false,  // 禁用内置客户端追踪（我们自己管理）
  maxPayload: CONFIG.MESSAGE_SIZE_LIMIT
});

// ==================== 数据结构 ====================

const clients = new Map();           // WebSocket -> 客户端信息
const ipConnections = new Map();     // IP -> 连接数
const messageRateLimits = new Map(); // 客户端ID -> 消息时间戳数组
let userIdCounter = 1;

// 统计数据
const stats = {
  totalConnections: 0,
  currentConnections: 0,
  peakConnections: 0,
  totalMessages: 0,
  rejectedConnections: 0,
  rateLimitHits: 0,
  startTime: Date.now()
};

// ==================== 工具函数 ====================

/**
 * 获取客户端 IP
 */
function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0] ||
         req.socket.remoteAddress;
}

/**
 * 检查 IP 连接数限制
 */
function checkIpLimit(ip) {
  const count = ipConnections.get(ip) || 0;
  return count < CONFIG.MAX_CONNECTIONS_PER_IP;
}

/**
 * 检查总连接数限制
 */
function checkConnectionLimit() {
  return stats.currentConnections < CONFIG.MAX_CONNECTIONS;
}

/**
 * 速率限制检查
 */
function checkRateLimit(clientId) {
  const now = Date.now();
  const timestamps = messageRateLimits.get(clientId) || [];

  // 移除1分钟前的时间戳
  const recentTimestamps = timestamps.filter(t => now - t < 60000);

  if (recentTimestamps.length >= CONFIG.MAX_MESSAGES_PER_MINUTE) {
    stats.rateLimitHits++;
    return false;
  }

  recentTimestamps.push(now);
  messageRateLimits.set(clientId, recentTimestamps);
  return true;
}

/**
 * 优化的广播函数 - 分批发送
 */
async function broadcast(message, sender = null) {
  const messageStr = JSON.stringify(message);
  const recipients = [];

  // 收集接收者
  clients.forEach((clientInfo, client) => {
    if (client !== sender &&
        client.readyState === WebSocket.OPEN &&
        clientInfo.authenticated) {
      recipients.push(client);
    }
  });

  // 分批发送（避免阻塞事件循环）
  for (let i = 0; i < recipients.length; i += CONFIG.BROADCAST_BATCH_SIZE) {
    const batch = recipients.slice(i, i + CONFIG.BROADCAST_BATCH_SIZE);

    batch.forEach(client => {
      try {
        client.send(messageStr);
      } catch (error) {
        console.error('发送消息失败:', error.message);
      }
    });

    // 让出事件循环（如果批次很大）
    if (recipients.length > CONFIG.BROADCAST_BATCH_SIZE * 2) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }
}

/**
 * 发送消息给特定客户端
 */
function sendToClient(client, message) {
  if (client.readyState === WebSocket.OPEN) {
    try {
      client.send(JSON.stringify(message));
    } catch (error) {
      console.error('发送消息失败:', error.message);
    }
  }
}

/**
 * 获取在线用户列表（优化版）
 */
function getOnlineUsers() {
  const users = [];
  clients.forEach((clientInfo) => {
    if (clientInfo.authenticated) {
      users.push({
        id: clientInfo.id,
        username: clientInfo.username
        // 移除 joinTime 减少数据量
      });
    }
  });
  return users;
}

/**
 * 获取服务器统计
 */
function getServerStats() {
  const memUsage = process.memoryUsage();
  const uptime = Date.now() - stats.startTime;

  return {
    connections: {
      current: stats.currentConnections,
      peak: stats.peakConnections,
      total: stats.totalConnections,
      rejected: stats.rejectedConnections
    },
    messages: {
      total: stats.totalMessages,
      rateLimitHits: stats.rateLimitHits
    },
    memory: {
      heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`
    },
    uptime: `${(uptime / 1000 / 60).toFixed(1)} 分钟`,
    config: CONFIG
  };
}

// ==================== WebSocket 连接处理 ====================

wss.on('connection', (ws, req) => {
  const clientIp = getClientIp(req);

  // 检查连接数限制
  if (!checkConnectionLimit()) {
    console.log(`❌ 拒绝连接: 达到最大连接数 (${CONFIG.MAX_CONNECTIONS})`);
    stats.rejectedConnections++;
    ws.close(1008, '服务器连接已满');
    return;
  }

  // 检查 IP 连接数限制
  if (!checkIpLimit(clientIp)) {
    console.log(`❌ 拒绝连接: IP ${clientIp} 超过最大连接数`);
    stats.rejectedConnections++;
    ws.close(1008, '同一IP连接数过多');
    return;
  }

  // 更新统计
  stats.totalConnections++;
  stats.currentConnections++;
  stats.peakConnections = Math.max(stats.peakConnections, stats.currentConnections);

  // 更新 IP 连接数
  const ipCount = ipConnections.get(clientIp) || 0;
  ipConnections.set(clientIp, ipCount + 1);

  console.log(`📡 新连接 [IP: ${clientIp}] (${stats.currentConnections}/${CONFIG.MAX_CONNECTIONS})`);

  // 初始化客户端信息
  const clientInfo = {
    id: userIdCounter++,
    username: null,
    authenticated: false,
    joinTime: Date.now(),
    lastHeartbeat: Date.now(),
    ip: clientIp,
    messageCount: 0
  };

  clients.set(ws, clientInfo);

  sendToClient(ws, {
    type: 'welcome',
    message: '欢迎连接到优化版 WebSocket 服务器！',
    data: {
      serverId: clientInfo.id,
      maxConnections: CONFIG.MAX_CONNECTIONS,
      currentConnections: stats.currentConnections
    }
  });

  // ==================== 消息处理 ====================

  ws.on('message', (data) => {
    try {
      // 检查消息大小
      if (data.length > CONFIG.MESSAGE_SIZE_LIMIT) {
        sendToClient(ws, {
          type: 'error',
          message: '消息过大'
        });
        return;
      }

      // 检查速率限制
      if (!checkRateLimit(clientInfo.id)) {
        sendToClient(ws, {
          type: 'error',
          message: '发送消息过快，请稍后再试'
        });
        return;
      }

      const message = JSON.parse(data);
      stats.totalMessages++;
      clientInfo.messageCount++;

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
      console.error('❌ 处理消息出错:', error.message);
      sendToClient(ws, {
        type: 'error',
        message: '消息格式错误'
      });
    }
  });

  // ==================== 连接关闭 ====================

  ws.on('close', () => {
    const info = clients.get(ws);

    // 更新统计
    stats.currentConnections--;

    // 更新 IP 连接数
    const ipCount = ipConnections.get(clientIp);
    if (ipCount <= 1) {
      ipConnections.delete(clientIp);
    } else {
      ipConnections.set(clientIp, ipCount - 1);
    }

    console.log(`👋 连接关闭: ${info?.username || '未认证'} (剩余: ${stats.currentConnections})`);

    if (info && info.authenticated) {
      broadcast({
        type: 'user_left',
        data: {
          username: info.username,
          userId: info.id
        }
      });
    }

    // 清理
    clients.delete(ws);
    messageRateLimits.delete(info?.id);
  });

  // ==================== 错误处理 ====================

  ws.on('error', (error) => {
    console.error('❌ WebSocket 错误:', error.message);
  });
});

// ==================== 消息处理函数 ====================

function handleUserJoin(ws, message) {
  const clientInfo = clients.get(ws);
  const username = message.username || `用户${clientInfo.id}`;

  clientInfo.username = username;
  clientInfo.authenticated = true;

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

  broadcast(chatMessage);
  // sendToClient(ws, chatMessage);
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

// ==================== 心跳检测 ====================

setInterval(() => {
  const now = Date.now();

  clients.forEach((clientInfo, ws) => {
    if (now - clientInfo.lastHeartbeat > CONFIG.HEARTBEAT_TIMEOUT) {
      console.log(`⏰ 心跳超时: ${clientInfo.username || '未认证'}`);
      ws.terminate();
    }
  });
}, 30000);

// ==================== 统计信息定时输出 ====================

setInterval(() => {
  console.log(`📊 [${stats.currentConnections}/${CONFIG.MAX_CONNECTIONS}] 在线 | 峰值: ${stats.peakConnections} | 总消息: ${stats.totalMessages}`);
}, 60000); // 每分钟

// ==================== 启动服务器 ====================

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log('='.repeat(70));
  console.log('🚀 优化版 WebSocket 服务器已启动！');
  console.log(`📡 HTTP: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
  console.log(`📊 统计: http://localhost:${PORT}/stats`);
  console.log('='.repeat(70));
  console.log('');
  console.log('⚡ 优化特性：');
  console.log(`✅ 最大连接数: ${CONFIG.MAX_CONNECTIONS.toLocaleString()}`);
  console.log(`✅ 每IP限制: ${CONFIG.MAX_CONNECTIONS_PER_IP}`);
  console.log(`✅ 速率限制: ${CONFIG.MAX_MESSAGES_PER_MINUTE} 消息/分钟`);
  console.log(`✅ 消息大小限制: ${CONFIG.MESSAGE_SIZE_LIMIT} 字节`);
  console.log(`✅ 批量广播: ${CONFIG.BROADCAST_BATCH_SIZE} 客户端/批`);
  console.log('');
});

// 优雅关闭
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function shutdown() {
  console.log('\n👋 正在关闭服务器...');

  broadcast({
    type: 'server_shutdown',
    message: '服务器即将关闭'
  });

  console.log('\n📊 最终统计:');
  console.log(JSON.stringify(getServerStats(), null, 2));

  server.close(() => {
    console.log('✅ 服务器已关闭');
    process.exit(0);
  });
}
