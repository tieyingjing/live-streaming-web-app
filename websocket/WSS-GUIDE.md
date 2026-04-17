# WSS (WebSocket Secure) 完整指南

## WSS vs WS 对比

| 特性 | WS (ws://) | WSS (wss://) |
|------|-----------|-------------|
| 加密 | ❌ 明文传输 | ✅ TLS/SSL 加密 |
| 安全性 | 低，可被窃听 | 高，防窃听和篡改 |
| 端口 | 通常 80/3000 | 通常 443/3443 |
| 类似协议 | HTTP | HTTPS |
| 生产环境 | ❌ 不推荐 | ✅ 必须使用 |
| 证书需求 | 不需要 | 需要 SSL 证书 |

## 核心代码位置对比

### WS 服务器 (server.js)

```javascript
// 第 12 行：使用 http 模块
const http = require('http');

// 第 17 行：创建 HTTP 服务器
const server = http.createServer((req, res) => {
  // ...
});

// 第 42 行：创建 WebSocket 服务器
const wss = new WebSocket.Server({ server });

// 第 327 行：监听端口 3000
server.listen(3000);
```

**启动**: `npm start` 或 `node server.js`
**访问**: http://localhost:3000
**WebSocket URL**: ws://localhost:3000

---

### WSS 服务器 (server-wss.js)

```javascript
// 第 12 行：使用 https 模块（关键区别！）
const https = require('https');

// 第 27-30 行：加载 SSL 证书
const serverOptions = {
  key: fs.readFileSync('ssl/key.pem'),
  cert: fs.readFileSync('ssl/cert.pem')
};

// 第 57 行：创建 HTTPS 服务器（传入证书）
const server = https.createServer(serverOptions, (req, res) => {
  // ...
});

// 第 82 行：创建 WSS 服务器
const wss = new WebSocket.Server({ server });

// 第 341 行：监听端口 3443
server.listen(3443);
```

**启动**: `npm run start:wss` 或 `node server-wss.js`
**访问**: https://localhost:3443
**WebSocket URL**: wss://localhost:3443

## 启动 WSS 服务器步骤

### 步骤 1: 生成 SSL 证书

```bash
# 方法 1: 使用提供的脚本
npm run cert

# 方法 2: 手动执行脚本
./generate-cert.sh

# 方法 3: 直接使用 openssl 命令
mkdir -p ssl
openssl req -x509 -newkey rsa:4096 \
  -keyout ssl/key.pem \
  -out ssl/cert.pem \
  -days 365 -nodes \
  -subj "/CN=localhost"
```

这会在 `ssl/` 目录下生成两个文件：
- `key.pem` - 私钥
- `cert.pem` - 证书

### 步骤 2: 启动 WSS 服务器

```bash
npm run start:wss
```

你会看到：
```
🔒 WSS (WebSocket Secure) 加密聊天服务器已启动！
📡 HTTPS 服务器: https://localhost:3443
🔐 WSS 服务器: wss://localhost:3443
```

### 步骤 3: 在浏览器中访问

1. 打开 https://localhost:3443
2. 会看到安全警告（因为是自签名证书）
3. 点击"高级" → "继续访问 localhost（不安全）"
4. 开始使用加密聊天室

## 关键代码差异分析

### 1. 服务器模块

```javascript
// WS
const http = require('http');
const server = http.createServer(handler);

// WSS
const https = require('https');
const server = https.createServer(serverOptions, handler);
```

**区别**: WSS 使用 `https` 模块并需要传入 SSL 证书配置

### 2. 证书加载

```javascript
// server-wss.js:27-30
const serverOptions = {
  key: fs.readFileSync('ssl/key.pem'),   // 私钥
  cert: fs.readFileSync('ssl/cert.pem')  // 证书
};
```

**解释**:
- `key.pem`: 私钥，用于解密
- `cert.pem`: 公钥证书，用于加密

### 3. WebSocket 服务器创建

```javascript
// 两者相同！
const wss = new WebSocket.Server({ server });
```

**重点**: WebSocket 服务器的创建方式一样，加密层由底层的 HTTPS 处理

### 4. 客户端连接 URL

```javascript
// WS
const ws = new WebSocket('ws://localhost:3000');

// WSS
const ws = new WebSocket('wss://localhost:3443');
```

**区别**: 只是协议从 `ws://` 变成 `wss://`

## SSL 证书详解

### 自签名证书 vs 正式证书

| 类型 | 用途 | 浏览器信任 | 成本 |
|------|------|------------|------|
| 自签名 | 开发/测试 | ❌ 不信任 | 免费 |
| Let's Encrypt | 生产环境 | ✅ 信任 | 免费 |
| 商业证书 | 企业生产 | ✅ 信任 | 付费 |

### 生产环境证书获取

**推荐: Let's Encrypt (免费)**

```bash
# 使用 certbot 获取证书
sudo certbot certonly --standalone -d yourdomain.com

# 证书会生成在
/etc/letsencrypt/live/yourdomain.com/
  - privkey.pem  (私钥)
  - fullchain.pem (证书链)

# 在代码中使用
const serverOptions = {
  key: fs.readFileSync('/etc/letsencrypt/live/yourdomain.com/privkey.pem'),
  cert: fs.readFileSync('/etc/letsencrypt/live/yourdomain.com/fullchain.pem')
};
```

## 安全性对比示例

### WS (不安全)

```
客户端 -> [明文消息] -> 网络 -> [明文消息] -> 服务器
         ↑
    可以被窃听和篡改！
```

如果你在咖啡馆的 WiFi 上使用 WS：
- 攻击者可以看到所有聊天内容
- 攻击者可以修改消息
- 攻击者可以伪造消息

### WSS (安全)

```
客户端 -> [加密] -> 网络 -> [加密数据] -> [解密] -> 服务器
                       ↑
                  无法解密！
```

使用 WSS：
- 所有数据都经过 TLS 加密
- 攻击者只能看到乱码
- 无法篡改或伪造

## 实际应用场景

### 使用 WS 的场景
- ✅ 本地开发测试
- ✅ 内网环境（无外部访问）
- ✅ 学习和实验

### 必须使用 WSS 的场景
- ✅ 生产环境（互联网）
- ✅ 传输敏感数据（密码、个人信息）
- ✅ 金融、医疗等领域
- ✅ 从 HTTPS 页面发起的连接（混合内容限制）

## 浏览器混合内容策略

**重要**: 如果网页是 HTTPS，WebSocket 必须是 WSS！

```javascript
// ❌ 错误：HTTPS 页面使用 WS
// https://example.com
const ws = new WebSocket('ws://example.com'); // 浏览器会阻止！

// ✅ 正确：HTTPS 页面使用 WSS
// https://example.com
const ws = new WebSocket('wss://example.com'); // 正常工作
```

## 性能对比

| 指标 | WS | WSS | 说明 |
|------|----|----|------|
| 连接延迟 | ~10ms | ~20ms | WSS 多了 TLS 握手 |
| 数据传输 | 100% | ~98% | 加密有轻微开销 |
| CPU 使用 | 低 | 中 | 加解密需要 CPU |
| 内存使用 | 相同 | 相同 | 差异可忽略 |

**结论**: WSS 的性能开销很小（< 5%），安全收益远大于性能损失

## 调试技巧

### Chrome DevTools 查看加密状态

1. F12 打开开发者工具
2. Network 标签 → WS 筛选
3. 点击 WebSocket 连接
4. 查看 Headers

**WS 连接**:
```
Request URL: ws://localhost:3000/
```

**WSS 连接**:
```
Request URL: wss://localhost:3443/
Protocol: wss
Encrypted: Yes
```

### 使用 curl 测试

```bash
# 测试 HTTPS 服务器（忽略证书验证）
curl -k https://localhost:3443

# 使用 wscat 测试 WSS
npm install -g wscat
wscat -c wss://localhost:3443 --no-check
```

## 常见问题

### Q1: 为什么浏览器显示"不安全"？

自签名证书未被浏览器信任。解决方法：
- 开发环境：点击"继续访问"
- 生产环境：使用 Let's Encrypt 等正式证书

### Q2: WSS 连接失败？

检查：
1. 是否生成了 SSL 证书？
2. 证书路径是否正确？
3. 端口是否被占用？
4. 防火墙是否允许？

### Q3: 自签名证书有效期多久？

默认 365 天。可以在生成时修改：
```bash
openssl ... -days 3650  # 10 年
```

### Q4: 如何强制所有连接使用 WSS？

服务器端拒绝 WS 连接：
```javascript
wss.on('connection', (ws, req) => {
  if (!req.socket.encrypted) {
    ws.close();
    return;
  }
  // 继续处理...
});
```

## 代码对照表

| 功能 | WS (server.js) | WSS (server-wss.js) |
|------|----------------|---------------------|
| 引入模块 | `require('http')` | `require('https')` |
| 证书配置 | 无 | 第 27-30 行 |
| 服务器创建 | 第 17 行 | 第 57 行 |
| WebSocket 创建 | 第 42 行 | 第 82 行 |
| 端口 | 3000 | 3443 |
| 访问 URL | `ws://` | `wss://` |

## 学习建议

1. **先理解 WS** - 从 `server.js` 开始
2. **再学习 WSS** - 对比 `server-wss.js`
3. **生成证书** - 运行 `npm run cert`
4. **同时运行** - 两个服务器一起跑，对比差异
5. **查看网络** - DevTools 观察加密状态

## 下一步

- [ ] 运行 WS 服务器，理解基础
- [ ] 生成 SSL 证书
- [ ] 运行 WSS 服务器
- [ ] 使用 DevTools 对比两者
- [ ] 学习 Let's Encrypt 部署

## 总结

**核心差异只有 3 个地方：**

1. **模块**: `http` → `https`
2. **证书**: 加载 `key.pem` 和 `cert.pem`
3. **URL**: `ws://` → `wss://`

其他所有代码完全一样！WSS 只是在传输层加了加密，应用层逻辑不变。
