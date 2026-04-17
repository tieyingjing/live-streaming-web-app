/**
 * WebSocket 服务器实现 - 实时聊天室
 *
 * 学习要点：
 * 1. WebSocket 服务器的创建和配置
 * 2. 连接管理（connection, close, error）
 * 3. 消息处理和广播
 * 4. 心跳机制保持连接活跃
 */

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 创建 HTTP 服务器用于提供静态文件
const server = http.createServer((req, res) => {
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

// ==================== WebSocket 服务器配置 ====================

/**
 * 创建 WebSocket 服务器
 * - 附加到现有的 HTTP 服务器上
 * - 这样可以在同一个端口上同时提供 HTTP 和 WebSocket 服务
 */
const wss = new WebSocket.Server({ server });

// 存储所有连接的客户端
// Map 结构: WebSocket 对象 -> 客户端信息
const clients = new Map();

// 生成唯一用户 ID
let userIdCounter = 1;

// ==================== 工具函数 ====================

/**
 * 广播消息给所有客户端（除了发送者）
 * @param {Object} message - 要广播的消息对象
 * @param {WebSocket} sender - 发送消息的客户端（可选，用于排除）
 */
function broadcast(message, sender = null) {
  const messageStr = JSON.stringify(message);

  clients.forEach((clientInfo, client) => {
    // 只发送给已认证的、在线的客户端，并排除发送者（如果指定）
    if (client !== sender &&
        client.readyState === WebSocket.OPEN &&
        clientInfo.authenticated) {
      client.send(messageStr);
    }
  });
}

/**
 * 发送消息给特定客户端
 * @param {WebSocket} client - 目标客户端
 * @param {Object} message - 消息对象
 */
function sendToClient(client, message) {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(message));
  }
}

/**
 * 获取当前在线用户列表
 */
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

/**
 * 当有新的 WebSocket 连接时触发
 * 这是 WebSocket 服务器最重要的事件
 */
wss.on('connection', (ws, req) => {
  console.log('📡 新客户端连接尝试');

  // 为每个连接初始化客户端信息
  const clientInfo = {
    id: userIdCounter++,
    username: null,
    authenticated: false,
    joinTime: null,
    lastHeartbeat: Date.now()
  };

  clients.set(ws, clientInfo);

  // 发送欢迎消息
  sendToClient(ws, {
    type: 'welcome',
    message: '欢迎连接到 WebSocket 聊天服务器！',
    data: {
      serverId: clientInfo.id,
      timestamp: new Date().toISOString()
    }
  });

  // ==================== 消息接收处理 ====================

  /**
   * 当收到客户端消息时触发
   * WebSocket 的核心：实时双向通信
   */
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      console.log(`📨 收到消息 [${message.type}]:`, message);

      // 根据消息类型处理不同的逻辑
      switch (message.type) {
        // 用户加入聊天室
        case 'join':
          handleUserJoin(ws, message);
          break;

        // 普通聊天消息
        case 'chat':
          handleChatMessage(ws, message);
          break;

        // 心跳消息（保持连接活跃）
        case 'ping':
          handlePing(ws);
          break;

        // 用户正在输入
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

  /**
   * 当客户端断开连接时触发
   * 重要：需要清理资源并通知其他用户
   */
  ws.on('close', () => {
    const info = clients.get(ws);
    console.log(`👋 用户断开连接: ${info?.username || '未认证用户'}`);

    // 如果用户已认证，通知其他用户
    if (info && info.authenticated) {
      broadcast({
        type: 'user_left',
        data: {
          username: info.username,
          userId: info.id,
          timestamp: new Date().toISOString(),
          onlineUsers: getOnlineUsers().length - 1 // 减去即将离开的用户
        }
      });
    }

    // 从客户端列表中移除
    clients.delete(ws);
  });

  // ==================== 错误处理 ====================

  /**
   * 当 WebSocket 连接发生错误时触发
   */
  ws.on('error', (error) => {
    console.error('❌ WebSocket 错误:', error);
  });
});

// ==================== 消息处理函数 ====================

/**
 * 处理用户加入
 */
function handleUserJoin(ws, message) {
  const clientInfo = clients.get(ws);
  const username = message.username || `用户${clientInfo.id}`;

  // 更新客户端信息
  clientInfo.username = username;
  clientInfo.authenticated = true;
  clientInfo.joinTime = new Date().toISOString();

  console.log(`✅ 用户加入: ${username}`);

  // 发送加入成功确认
  sendToClient(ws, {
    type: 'join_success',
    data: {
      userId: clientInfo.id,
      username: username,
      onlineUsers: getOnlineUsers()
    }
  });

  // 广播给其他用户
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

/**
 * 处理聊天消息
 */
function handleChatMessage(ws, message) {
  const clientInfo = clients.get(ws);

  // 验证用户是否已认证
  if (!clientInfo.authenticated) {
    sendToClient(ws, {
      type: 'error',
      message: '请先加入聊天室'
    });
    return;
  }

  // 构造消息对象
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

  // 广播给所有人（包括发送者，用于确认）
  broadcast(chatMessage);
  sendToClient(ws, chatMessage);
}

/**
 * 处理心跳（Ping）
 * 心跳机制：客户端定期发送 ping，服务器响应 pong
 * 作用：
 * 1. 保持连接活跃（防止代理服务器超时断开）
 * 2. 检测连接是否真的活跃
 */
function handlePing(ws) {
  const clientInfo = clients.get(ws);
  clientInfo.lastHeartbeat = Date.now();

  sendToClient(ws, {
    type: 'pong',
    timestamp: Date.now()
  });
}

/**
 * 处理用户正在输入状态
 */
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

/**
 * 定期检查客户端心跳
 * 如果超过 60 秒没有心跳，主动断开连接
 */
setInterval(() => {
  const now = Date.now();
  const HEARTBEAT_TIMEOUT = 60000; // 60 秒

  clients.forEach((clientInfo, ws) => {
    if (now - clientInfo.lastHeartbeat > HEARTBEAT_TIMEOUT) {
      console.log(`⏰ 客户端心跳超时，断开连接: ${clientInfo.username || '未认证'}`);
      ws.terminate();
    }
  });
}, 30000); // 每 30 秒检查一次

// ==================== 启动服务器 ====================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('🚀 WebSocket 聊天服务器已启动！');
  console.log(`📡 HTTP 服务器: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket 服务器: ws://localhost:${PORT}`);
  console.log('='.repeat(50));
  console.log('');
  console.log('💡 学习提示：');
  console.log('1. WebSocket 使用持久连接，无需每次请求都握手');
  console.log('2. 双向通信：服务器可以主动推送消息给客户端');
  console.log('3. 低延迟：适合实时应用（聊天、游戏、协作等）');
  console.log('4. 心跳机制：保持连接活跃，及时发现断线');
  console.log('');
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('\n👋 正在关闭服务器...');

  // 通知所有客户端服务器即将关闭
  broadcast({
    type: 'server_shutdown',
    message: '服务器即将关闭'
  });

  server.close(() => {
    console.log('✅ 服务器已关闭');
    process.exit(0);
  });
});
