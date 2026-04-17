// 全局变量
let hls = null;
let ws = null;
let danmakuCount = 0;
let isPlaying = false;

// DOM 元素
const video = document.getElementById('video');
const streamKeyInput = document.getElementById('streamKey');
const hlsUrlInput = document.getElementById('hlsUrl');
const playBtn = document.getElementById('playBtn');
const streamStatus = document.getElementById('streamStatus');
const chatMessages = document.getElementById('chatMessages');
const usernameInput = document.getElementById('usernameInput');
const danmakuInput = document.getElementById('danmakuInput');
const sendBtn = document.getElementById('sendBtn');
const danmakuCanvas = document.getElementById('danmakuCanvas');

// 统计元素
const currentLevelEl = document.getElementById('currentLevel');
const bufferHealthEl = document.getElementById('bufferHealth');
const danmakuCountEl = document.getElementById('danmakuCount');
const viewerCountEl = document.getElementById('viewerCount');

// 更新 HLS URL
streamKeyInput.addEventListener('input', () => {
  const key = streamKeyInput.value || 'stream_key';
  hlsUrlInput.value = `http://localhost:8000/live/${key}/index.m3u8`;
});

// 播放按钮
playBtn.addEventListener('click', () => {
  if (isPlaying) {
    stopStream();
  } else {
    playStream();
  }
});

// 播放直播流
function playStream() {
  const streamUrl = hlsUrlInput.value;

  if (Hls.isSupported()) {
    if (hls) {
      hls.destroy();
    }

    hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 90
    });

    hls.loadSource(streamUrl);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      console.log('✅ HLS manifest 已加载');
      video.play().catch(err => {
        console.error('播放失败:', err);
        addSystemMessage('播放失败: ' + err.message);
      });
      updateStreamStatus(true);
      isPlaying = true;
      playBtn.textContent = '⏸️ 停止播放';
    });

    hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
      const level = hls.levels[data.level];
      currentLevelEl.textContent = level ? `${level.height}p` : '-';
      console.log('切换画质:', level);
    });

    hls.on(Hls.Events.ERROR, (event, data) => {
      console.error('HLS 错误:', data);
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            addSystemMessage('网络错误，尝试重连...');
            hls.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            addSystemMessage('媒体错误，尝试恢复...');
            hls.recoverMediaError();
            break;
          default:
            addSystemMessage('致命错误，无法播放');
            stopStream();
            break;
        }
      }
    });

  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari 原生支持
    video.src = streamUrl;
    video.addEventListener('loadedmetadata', () => {
      video.play();
      updateStreamStatus(true);
      isPlaying = true;
      playBtn.textContent = '⏸️ 停止播放';
    });
  } else {
    addSystemMessage('您的浏览器不支持 HLS 播放');
  }
}

// 停止播放
function stopStream() {
  if (hls) {
    hls.destroy();
    hls = null;
  }
  video.pause();
  video.src = '';
  updateStreamStatus(false);
  isPlaying = false;
  playBtn.textContent = '▶️ 开始播放';
  currentLevelEl.textContent = '-';
}

// 更新流状态指示器
function updateStreamStatus(online) {
  if (online) {
    streamStatus.classList.add('online');
    streamStatus.classList.remove('offline');
  } else {
    streamStatus.classList.remove('online');
    streamStatus.classList.add('offline');
  }
}

// 初始状态
updateStreamStatus(false);

// 更新缓冲健康度
setInterval(() => {
  if (video.buffered.length > 0) {
    const buffered = video.buffered.end(video.buffered.length - 1) - video.currentTime;
    bufferHealthEl.textContent = buffered.toFixed(1) + 's';
  }
}, 1000);

// ============ WebSocket 弹幕系统 ============

function connectWebSocket() {
  ws = new WebSocket('ws://localhost:5001');

  ws.onopen = () => {
    console.log('✅ WebSocket 已连接');
    addSystemMessage('已连接到弹幕服务器');
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log('收到消息:', data);

      switch (data.type) {
        case 'connected':
          // 显示历史弹幕
          if (data.history && data.history.length > 0) {
            data.history.forEach(msg => {
              if (msg.type === 'danmaku') {
                addChatMessage(msg.username, msg.text, msg.timestamp);
              }
            });
          }
          break;

        case 'danmaku':
          addChatMessage(data.username, data.text, data.timestamp);
          showDanmaku(data.text, data.color || '#FFFFFF');
          danmakuCount++;
          danmakuCountEl.textContent = danmakuCount;
          break;

        case 'stream_started':
          addSystemMessage('直播已开始！');
          break;

        case 'stream_stopped':
          addSystemMessage('直播已结束');
          break;
      }
    } catch (error) {
      console.error('消息解析错误:', error);
    }
  };

  ws.onclose = () => {
    console.log('❌ WebSocket 已断开');
    addSystemMessage('弹幕服务器已断开，3秒后重连...');
    setTimeout(connectWebSocket, 3000);
  };

  ws.onerror = (error) => {
    console.error('WebSocket 错误:', error);
  };
}

// 发送弹幕
function sendDanmaku() {
  const username = usernameInput.value.trim() || '游客';
  const text = danmakuInput.value.trim();

  if (!text) {
    return;
  }

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    addSystemMessage('弹幕服务器未连接');
    return;
  }

  const danmaku = {
    type: 'danmaku',
    username: username,
    text: text,
    color: getRandomColor()
  };

  ws.send(JSON.stringify(danmaku));
  danmakuInput.value = '';
}

// 添加聊天消息
function addChatMessage(username, text, timestamp) {
  const messageEl = document.createElement('div');
  messageEl.className = 'chat-message';

  const time = timestamp ? new Date(timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();

  messageEl.innerHTML = `
    <span class="username">${escapeHtml(username)}:</span>
    <span class="text">${escapeHtml(text)}</span>
    <span class="time">${time}</span>
  `;

  chatMessages.appendChild(messageEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // 限制消息数量
  while (chatMessages.children.length > 100) {
    chatMessages.removeChild(chatMessages.firstChild);
  }
}

// 添加系统消息
function addSystemMessage(text) {
  const messageEl = document.createElement('div');
  messageEl.className = 'system-message';
  messageEl.textContent = text;
  chatMessages.appendChild(messageEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 显示弹幕动画
function showDanmaku(text, color) {
  const danmakuEl = document.createElement('div');
  danmakuEl.className = 'danmaku-item';
  danmakuEl.textContent = text;
  danmakuEl.style.color = color;

  // 随机垂直位置
  const containerHeight = danmakuCanvas.offsetHeight;
  const top = Math.random() * (containerHeight - 50);
  danmakuEl.style.top = top + 'px';

  // 从右侧开始
  danmakuEl.style.right = '-100%';

  // 计算动画时长 (基于文本长度)
  const duration = 8 + text.length * 0.2;
  danmakuEl.style.animationDuration = duration + 's';

  danmakuCanvas.appendChild(danmakuEl);

  // 动画结束后移除
  setTimeout(() => {
    danmakuCanvas.removeChild(danmakuEl);
  }, duration * 1000);
}

// 获取随机颜色
function getRandomColor() {
  const colors = [
    '#FFFFFF', '#FF6B6B', '#4ECDC4', '#45B7D1',
    '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// HTML 转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 事件监听
sendBtn.addEventListener('click', sendDanmaku);

danmakuInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendDanmaku();
  }
});

// 页面加载完成后连接 WebSocket
window.addEventListener('load', () => {
  connectWebSocket();
});
