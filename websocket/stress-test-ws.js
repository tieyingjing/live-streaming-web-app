/**
 * WebSocket 压力测试工具
 *
 * 用途：测试服务器能承载多少并发连接
 * 使用：node stress-test.js [连接数] [消息频率]
 */

const WebSocket = require('ws');

// ==================== 配置 ====================

const config = {
  serverUrl: process.argv[4] || 'ws://localhost:3000',
  numClients: parseInt(process.argv[2]) || 100,        // 模拟用户数
  messageInterval: parseInt(process.argv[3]) || 5000,  // 发消息间隔(毫秒)
  connectInterval: 50,                                  // 连接间隔(避免同时连接)
};

// ==================== 统计数据 ====================

const stats = {
  connected: 0,
  disconnected: 0,
  messagesSent: 0,
  messagesReceived: 0,
  errors: 0,
  startTime: null,
  clients: []
};

// ==================== 创建客户端连接 ====================

function createClient(id) {
  return new Promise((resolve, reject) => {
    try {
      const ws = new WebSocket(config.serverUrl);
      const clientData = {
        id,
        ws,
        username: `测试用户${id}`,
        connected: false,
        messageCount: 0
      };

      ws.on('open', () => {
        stats.connected++;
        clientData.connected = true;

        // 发送加入消息
        ws.send(JSON.stringify({
          type: 'join',
          username: clientData.username
        }));

        console.log(`✅ 客户端 ${id} 已连接 (${stats.connected}/${config.numClients})`);

        // 定期发送消息
        clientData.messageTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'chat',
              message: `测试消息 ${++clientData.messageCount} from ${clientData.username}`
            }));
            stats.messagesSent++;
          }
        }, config.messageInterval);

        // 定期发送心跳
        clientData.heartbeatTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);

        resolve(clientData);
      });

      ws.on('message', (data) => {
        stats.messagesReceived++;
        // 不打印接收的消息，避免控制台刷屏
      });

      ws.on('close', () => {
        stats.connected--;
        stats.disconnected++;
        clientData.connected = false;

        if (clientData.messageTimer) clearInterval(clientData.messageTimer);
        if (clientData.heartbeatTimer) clearInterval(clientData.heartbeatTimer);

        console.log(`❌ 客户端 ${id} 断开连接`);
      });

      ws.on('error', (error) => {
        stats.errors++;
        console.error(`⚠️  客户端 ${id} 错误:`, error.message);
        reject(error);
      });

    } catch (error) {
      stats.errors++;
      reject(error);
    }
  });
}

// ==================== 启动压力测试 ====================

async function runStressTest() {
  console.log('='.repeat(60));
  console.log('🔥 WebSocket 压力测试');
  console.log('='.repeat(60));
  console.log(`📊 测试配置:`);
  console.log(`   服务器: ${config.serverUrl}`);
  console.log(`   模拟用户数: ${config.numClients}`);
  console.log(`   消息间隔: ${config.messageInterval}ms`);
  console.log(`   连接间隔: ${config.connectInterval}ms`);
  console.log('='.repeat(60));
  console.log('');

  stats.startTime = Date.now();

  // 逐个创建连接（避免瞬间大量连接）
  for (let i = 1; i <= config.numClients; i++) {
    try {
      const client = await createClient(i);
      stats.clients.push(client);

      // 等待一小段时间再创建下一个连接
      if (i < config.numClients) {
        await new Promise(resolve => setTimeout(resolve, config.connectInterval));
      }
    } catch (error) {
      console.error(`❌ 创建客户端 ${i} 失败:`, error.message);
    }
  }

  console.log('');
  console.log('✅ 所有客户端创建完成');
  console.log('');

  // 定期打印统计
  setInterval(printStats, 5000);
}

// ==================== 打印统计信息 ====================

function printStats() {
  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);
  const memUsage = process.memoryUsage();

  console.log('='.repeat(60));
  console.log(`⏱️  运行时间: ${elapsed}s`);
  console.log(`👥 连接状态: ${stats.connected} 在线 / ${stats.disconnected} 断开`);
  console.log(`📤 发送消息: ${stats.messagesSent}`);
  console.log(`📥 接收消息: ${stats.messagesReceived}`);
  console.log(`❌ 错误数: ${stats.errors}`);
  console.log(`💾 内存使用: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);

  if (stats.messagesSent > 0) {
    const avgLatency = stats.messagesReceived / stats.messagesSent * 100;
    console.log(`📊 消息到达率: ${avgLatency.toFixed(1)}%`);
  }

  console.log('='.repeat(60));
  console.log('');
}

// ==================== 优雅退出 ====================

process.on('SIGINT', () => {
  console.log('\n\n👋 正在关闭所有连接...');

  stats.clients.forEach(client => {
    if (client.ws && client.ws.readyState === WebSocket.OPEN) {
      client.ws.close();
    }
  });

  setTimeout(() => {
    console.log('\n📊 最终统计:');
    printStats();
    process.exit(0);
  }, 1000);
});

// ==================== 启动 ====================

runStressTest().catch(error => {
  console.error('❌ 压力测试失败:', error);
  process.exit(1);
});
