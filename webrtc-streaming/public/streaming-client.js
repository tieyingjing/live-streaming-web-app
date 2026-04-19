// WebRTC 推流客户端
class StreamingClient {
  constructor() {
    this.device = null;
    this.sendTransport = null;
    this.videoProducer = null;
    this.audioProducer = null;
    this.socket = null;
    this.localStream = null;
    this.streamKey = null;
    this.isStreaming = false;
    this.startTime = null;
    this.timerInterval = null;

    // 修复 RTP header extension 冲突：Monkey patch RTCPeerConnection
    this.patchRTCPeerConnection();

    this.initElements();
    this.bindEvents();
  }

  // Monkey patch RTCPeerConnection - 不做任何修改，先禁用
  patchRTCPeerConnection() {
    console.log('[SDP PATCH] 已禁用 SDP patching');
  }

  initElements() {
    // Video elements
    this.preview = document.getElementById('preview');

    // Buttons
    this.startPreviewBtn = document.getElementById('startPreviewBtn');
    this.stopPreviewBtn = document.getElementById('stopPreviewBtn');
    this.startStreamBtn = document.getElementById('startStreamBtn');
    this.stopStreamBtn = document.getElementById('stopStreamBtn');

    // Inputs
    this.streamKeyInput = document.getElementById('streamKey');
    this.videoSourceSelect = document.getElementById('videoSource');

    // Status
    this.statusBadge = document.getElementById('statusBadge');
    this.timer = document.getElementById('timer');
    this.alertBox = document.getElementById('alertBox');

    // Stats
    this.statStatus = document.getElementById('statStatus');
    this.statVideoBitrate = document.getElementById('statVideoBitrate');
    this.statAudioBitrate = document.getElementById('statAudioBitrate');
    this.statDuration = document.getElementById('statDuration');

    // Log
    this.logContainer = document.getElementById('logContainer');
  }

  bindEvents() {
    this.startPreviewBtn.addEventListener('click', () => this.startPreview());
    this.stopPreviewBtn.addEventListener('click', () => this.stopPreview());
    this.startStreamBtn.addEventListener('click', () => this.startStreaming());
    this.stopStreamBtn.addEventListener('click', () => this.stopStreaming());
  }

  // ========== 日志和状态 ==========

  log(message, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    this.logContainer.appendChild(entry);
    this.logContainer.scrollTop = this.logContainer.scrollHeight;

    console.log(`[${type.toUpperCase()}] ${message}`);
  }

  showAlert(message, type = 'info') {
    this.alertBox.className = `alert alert-${type}`;
    this.alertBox.textContent = message;
  }

  updateStatus(status) {
    this.statusBadge.textContent = status;
    this.statStatus.textContent = status;

    if (status === '直播中') {
      this.statusBadge.classList.add('live');
    } else {
      this.statusBadge.classList.remove('live');
    }
  }

  startTimer() {
    this.startTime = Date.now();
    this.timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      const hours = Math.floor(elapsed / 3600);
      const minutes = Math.floor((elapsed % 3600) / 60);
      const seconds = elapsed % 60;

      this.timer.textContent = [hours, minutes, seconds]
        .map(v => String(v).padStart(2, '0'))
        .join(':');

      this.statDuration.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.timer.textContent = '00:00:00';
    this.statDuration.textContent = '00:00';
  }

  // ========== 预览 ==========

  async startPreview() {
    try {
      this.log('开始获取媒体流...');
      this.showAlert('正在获取媒体流...', 'info');

      const videoSource = this.videoSourceSelect.value;

      if (videoSource === 'camera') {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 }
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      } else if (videoSource === 'screen') {
        this.localStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 }
          },
          audio: true
        });
      }

      this.preview.srcObject = this.localStream;

      this.log('✅ 媒体流获取成功', 'success');
      this.showAlert('预览已开启，可以开始推流', 'success');
      this.updateStatus('预览中');

      // 更新按钮状态
      this.startPreviewBtn.disabled = true;
      this.stopPreviewBtn.disabled = false;
      this.startStreamBtn.disabled = false;

    } catch (error) {
      this.log(`❌ 获取媒体流失败: ${error.message}`, 'error');
      this.showAlert(`错误: ${error.message}`, 'error');
    }
  }

  stopPreview() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
      this.preview.srcObject = null;
    }

    this.log('预览已停止');
    this.showAlert('预览已停止', 'info');
    this.updateStatus('未开始');

    this.startPreviewBtn.disabled = false;
    this.stopPreviewBtn.disabled = true;
    this.startStreamBtn.disabled = true;
  }

  // ========== WebRTC 推流 ==========

  async startStreaming() {
    try {
      if (!this.localStream) {
        throw new Error('请先开启预览');
      }

      this.streamKey = this.streamKeyInput.value || 'webrtc_stream';

      this.log('连接信令服务器...');
      this.showAlert('正在连接服务器...', 'info');

      // 连接 WebSocket
      await this.connectSignaling();

      // 初始化 Mediasoup Device
      this.log('初始化 Mediasoup Device...');
      await this.initDevice();

      // 创建发送 Transport
      this.log('创建发送 Transport...');
      await this.createSendTransport();

      // 开始生产媒体流
      this.log('开始推流...');
      await this.produce();

      this.isStreaming = true;
      this.updateStatus('直播中');
      this.showAlert('🎉 推流成功！直播已开始', 'success');
      this.log('✅ 推流成功', 'success');
      this.startTimer();

      // 更新按钮状态
      this.startStreamBtn.disabled = true;
      this.stopStreamBtn.disabled = false;
      this.startPreviewBtn.disabled = true;
      this.stopPreviewBtn.disabled = true;

      // 启动统计
      this.startStats();

    } catch (error) {
      this.log(`❌ 推流失败: ${error.message}`, 'error');
      this.showAlert(`错误: ${error.message}`, 'error');
      this.cleanup();
    }
  }

  async stopStreaming() {
    this.log('停止推流...');

    if (this.videoProducer) {
      this.videoProducer.close();
      this.videoProducer = null;
    }

    if (this.audioProducer) {
      this.audioProducer.close();
      this.audioProducer = null;
    }

    if (this.sendTransport) {
      this.sendTransport.close();
      this.sendTransport = null;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this.isStreaming = false;
    this.updateStatus('预览中');
    this.showAlert('推流已停止', 'info');
    this.log('推流已停止');
    this.stopTimer();

    // 更新按钮状态
    this.startStreamBtn.disabled = false;
    this.stopStreamBtn.disabled = true;
    this.startPreviewBtn.disabled = true;
    this.stopPreviewBtn.disabled = false;

    // 清理统计
    this.statVideoBitrate.textContent = '0 kbps';
    this.statAudioBitrate.textContent = '0 kbps';
  }

  cleanup() {
    this.stopStreaming();
    this.stopPreview();
  }

  // ========== 信令 ==========

  connectSignaling() {
    return new Promise((resolve, reject) => {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${location.host}/signaling`;

      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.log('✅ 信令服务器已连接', 'success');
        resolve();
      };

      this.socket.onerror = (error) => {
        this.log('❌ 信令服务器连接失败', 'error');
        reject(new Error('WebSocket 连接失败'));
      };

      this.socket.onclose = () => {
        this.log('信令服务器已断开');
        if (this.isStreaming) {
          this.showAlert('连接断开，推流已中断', 'error');
          this.cleanup();
        }
      };
    });
  }

  sendMessage(message) {
    return new Promise((resolve, reject) => {
      const handler = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'error') {
          this.socket.removeEventListener('message', handler);
          reject(new Error(data.message));
        } else {
          this.socket.removeEventListener('message', handler);
          resolve(data);
        }
      };

      this.socket.addEventListener('message', handler);
      this.socket.send(JSON.stringify(message));
    });
  }

  // ========== Mediasoup Device ==========

  async initDevice() {
    this.device = new mediasoupClient.Device();

    const { rtpCapabilities } = await this.sendMessage({
      type: 'getRouterRtpCapabilities',
      streamKey: this.streamKey
    });

    console.log('[DEBUG] 接收到的 RTP capabilities（未过滤）');

    await this.device.load({ routerRtpCapabilities: rtpCapabilities });

    this.log('✅ Device 初始化完成', 'success');
  }

  async createSendTransport() {
    const { transportOptions } = await this.sendMessage({
      type: 'createTransport',
      streamKey: this.streamKey,
      direction: 'send'
    });

    this.sendTransport = this.device.createSendTransport(transportOptions);

    this.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await this.sendMessage({
          type: 'connectTransport',
          transportId: this.sendTransport.id,
          dtlsParameters
        });

        callback();
      } catch (error) {
        errback(error);
      }
    });

    this.sendTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
      try {
        console.log(`[DEBUG] ${kind} 流 produce 请求`);

        const { id } = await this.sendMessage({
          type: 'produce',
          transportId: this.sendTransport.id,
          kind,
          rtpParameters,
          streamKey: this.streamKey
        });

        callback({ id });
      } catch (error) {
        errback(error);
      }
    });

    this.log('✅ Send Transport 创建完成', 'success');
  }

  async produce() {
    const videoTrack = this.localStream.getVideoTracks()[0];
    const audioTrack = this.localStream.getAudioTracks()[0];

    if (videoTrack) {
      console.log('[DEBUG] 准备发送视频流...');
      try {
        this.videoProducer = await this.sendTransport.produce({
          track: videoTrack,
          // 简化编码，避免 RTP 扩展冲突
          stopTracks: false
        });
        console.log('[DEBUG] 视频流 produce 成功');
        this.log('✅ 视频流已发布', 'success');
      } catch (error) {
        console.error('[DEBUG] 视频流 produce 失败:', error);
        throw error;
      }
    }

    if (audioTrack) {
      console.log('[DEBUG] 准备发送音频流...');
      try {
        this.audioProducer = await this.sendTransport.produce({
          track: audioTrack,
          stopTracks: false
        });
        console.log('[DEBUG] 音频流 produce 成功');
        this.log('✅ 音频流已发布', 'success');
      } catch (error) {
        console.error('[DEBUG] 音频流 produce 失败:', error);
        throw error;
      }
    }
  }

  // ========== 统计 ==========

  async startStats() {
    setInterval(async () => {
      if (!this.isStreaming) return;

      try {
        if (this.videoProducer) {
          const stats = await this.videoProducer.getStats();
          stats.forEach(stat => {
            if (stat.type === 'outbound-rtp' && stat.mediaType === 'video') {
              const bitrate = Math.round((stat.bytesSent * 8) / 1000);
              this.statVideoBitrate.textContent = `${bitrate} kbps`;
            }
          });
        }

        if (this.audioProducer) {
          const stats = await this.audioProducer.getStats();
          stats.forEach(stat => {
            if (stat.type === 'outbound-rtp' && stat.mediaType === 'audio') {
              const bitrate = Math.round((stat.bytesSent * 8) / 1000);
              this.statAudioBitrate.textContent = `${bitrate} kbps`;
            }
          });
        }
      } catch (error) {
        // Ignore stats errors
      }
    }, 2000);
  }
}

// 初始化
const client = new StreamingClient();
