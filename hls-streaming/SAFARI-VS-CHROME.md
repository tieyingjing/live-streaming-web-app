# Safari vs Chrome - HLS 播放差异

## 核心区别

### Safari（macOS/iOS）
- ✅ **原生 HLS 支持** - 内置在浏览器中
- ❌ **无法监听详细事件** - 只有基本的 HTML5 Video 事件
- ⚡ **性能更好** - 硬件加速，省电
- 📱 **移动设备必须** - iOS 只支持原生 HLS

### Chrome/Firefox/Edge
- ❌ **不支持原生 HLS** - 需要 hls.js 库
- ✅ **可以监听详细事件** - 所有 hls.js 事件
- 🔍 **适合调试** - 可以看到画质切换、ABR 算法
- 💻 **桌面开发推荐** - 学习 HLS 原理

---

## 事件对比

### Safari 原生 HLS

**可用事件（HTML5 Video 标准）：**
```javascript
video.addEventListener('loadedmetadata', () => {
    console.log('元数据加载完成');
    console.log('时长:', video.duration);
    console.log('分辨率:', video.videoWidth, 'x', video.videoHeight);
});

video.addEventListener('timeupdate', () => {
    console.log('当前时间:', video.currentTime);
});

video.addEventListener('progress', () => {
    console.log('缓冲进度:', video.buffered);
});

video.addEventListener('seeking', () => {
    console.log('用户拖拽进度条');
});
```

**❌ 无法监听：**
- 画质切换事件
- 分片下载事件
- 带宽估算事件
- ABR 算法决策

**画质切换方式：**
- Safari 内部自动处理
- 用户无法知道何时切换
- 只能通过分辨率变化间接观察

---

### Chrome + hls.js

**可用事件（hls.js 提供）：**
```javascript
hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
    console.log('找到', data.levels.length, '个画质');
});

hls.on(Hls.Events.LEVEL_SWITCHING, (event, data) => {
    console.log('准备切换到:', data.level);
});

hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
    console.log('已切换到:', data.level);
    console.log('分辨率:', hls.levels[data.level].height + 'p');
});

hls.on(Hls.Events.FRAG_LOADED, (event, data) => {
    const stats = data.frag.stats;
    const speed = (stats.total * 8) / (stats.loading.end - stats.loading.start) * 1000;
    console.log('分片下载速度:', speed / 1000000, 'Mbps');
});

// 共 74 个事件！
```

**✅ 完全可控：**
- 知道何时切换画质
- 知道每个分片的下载速度
- 知道 ABR 算法的决策过程
- 可以手动控制画质

---

## 如何查看画质切换？

### 在 Safari 中

#### 方法 1: 观察分辨率变化

```javascript
video.addEventListener('resize', () => {
    console.log('分辨率变化:', video.videoWidth, 'x', video.videoHeight);
});

setInterval(() => {
    console.log('当前分辨率:', video.videoWidth, 'x', video.videoHeight);
}, 2000);
```

#### 方法 2: 观察 Network 标签

1. 打开 Safari DevTools (Cmd+Option+I)
2. 切换到 Network 标签
3. 播放视频
4. 观察 `.ts` 文件的大小变化

```
720p_001.ts - 2.5 MB
720p_002.ts - 2.5 MB
360p_003.ts - 0.9 MB  ← 切换到 360p！
360p_004.ts - 0.9 MB
```

#### 方法 3: 使用 Safari 的 Web Inspector

Safari 有一些特殊的 HLS 调试功能：
1. Develop → Show Web Inspector
2. Elements → 选中 video 元素
3. 右侧 Properties 面板可以看到一些 HLS 信息

---

### 在 Chrome 中

#### 方法 1: 使用我们的调试页面 ⭐ 推荐

访问 **http://localhost:4000/event-test.html**

会显示所有 hls.js 事件，包括：
```
LEVEL_SWITCHING → Level 1 (720p, 2.50 Mbps)
LEVEL_SWITCHED → Level 1 (720p, 2.50 Mbps)
FRAG_LOADED → 分片 #0 [Level 1 - 720p], 2.13 MB, 32.50 Mbps
```

#### 方法 2: Chrome Console

```javascript
console.log('当前画质:', hls.currentLevel);
console.log('估算带宽:', hls.bandwidthEstimate / 1000000, 'Mbps');
console.log('可用画质:', hls.levels.map(l => l.height + 'p'));
```

#### 方法 3: Network 标签 + Throttling

1. F12 → Network
2. Throttling → "Slow 3G"
3. 观察文件名变化和日志输出

---

## 我们的代码修改

### 修改前（优先原生）

```javascript
if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari 原生 - 没有详细日志
    videoPlayer.src = url;
} else if (Hls.isSupported()) {
    // 使用 hls.js - 有详细日志
    hls.loadSource(url);
}
```

**问题：** Safari 用户看不到画质切换日志

### 修改后（优先 hls.js）✅

```javascript
if (Hls.isSupported()) {
    // 优先使用 hls.js - 有详细日志
    hls.loadSource(url);
} else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
    // 降级到原生 HLS
    videoPlayer.src = url;
}
```

**好处：**
- Chrome 和 Safari 都使用 hls.js
- 都能看到详细的事件日志
- 适合学习 HLS 原理

---

## 性能对比

### Safari 原生 HLS

**优势：**
- ⚡ 更快的启动速度
- 🔋 更省电（硬件解码）
- 📱 iOS 设备唯一选择
- 🎯 更稳定（系统级支持）

**劣势：**
- 🔍 无法调试
- 📊 看不到内部状态
- 🛠️ 无法自定义 ABR 策略

### hls.js

**优势：**
- 🔍 完全可调试
- 📊 详细的事件日志
- 🛠️ 可自定义配置
- 🌐 跨浏览器一致性

**劣势：**
- ⚡ 稍慢的启动速度
- 🔋 稍微费电（软件解码）
- 💾 额外的库大小（~200KB）

---

## 什么时候用哪个？

### 学习和开发 → hls.js ✅

```javascript
// 强制使用 hls.js
if (Hls.isSupported()) {
    const hls = new Hls({ debug: true });
    hls.loadSource(url);
    hls.attachMedia(video);
}
```

**理由：**
- 可以看到所有事件
- 理解 ABR 算法
- 调试画质问题

### 生产环境 → 原生优先 ✅

```javascript
// 优先原生，降级 hls.js
if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url;  // Safari 用原生
} else if (Hls.isSupported()) {
    hls.loadSource(url);  // Chrome 用 hls.js
}
```

**理由：**
- 性能最优
- 省电省流量
- iOS 兼容性

---

## 测试建议

### 阶段 1: 学习 HLS 原理

**使用 Chrome + event-test.html**

1. 访问 http://localhost:4000/event-test.html
2. 选择视频并点击"开始监控"
3. 观察所有事件输出
4. 使用 Network Throttling 测试画质切换

### 阶段 2: 理解 ABR 算法

**使用 Chrome + simple-test.html**

1. 访问 http://localhost:4000/simple-test.html
2. 观察带宽图表
3. 实时看到画质切换决策
4. 理解为什么切换

### 阶段 3: 生产环境测试

**使用 Safari 测试原生播放**

1. 修改代码优先使用原生
2. 在 Safari 和 iOS 设备测试
3. 确保兼容性
4. 测试性能和电池消耗

---

## 当前状态

### 主页面 (index.html) ✅

- 优先使用 hls.js
- Safari 和 Chrome 都能看到详细日志
- 适合学习

### 测试页面 ✅

- event-test.html - 监听所有事件
- simple-test.html - 可视化监控
- debug.html - 实时图表

### 生产建议

部署到生产环境时，修改回原生优先：

```javascript
// production.js
if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url;
} else if (Hls.isSupported()) {
    hls.loadSource(url);
}
```

---

## 总结

| 特性 | Safari 原生 | Chrome + hls.js |
|------|------------|-----------------|
| 画质切换 | ✅ 自动 | ✅ 自动 |
| 切换日志 | ❌ 无 | ✅ 详细 |
| 性能 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 调试能力 | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| 学习价值 | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| 生产推荐 | ✅ 推荐 | ✅ 降级方案 |

**现在代码已修改，Safari 也会使用 hls.js，可以看到详细日志了！**

刷新页面试试吧！🎉
