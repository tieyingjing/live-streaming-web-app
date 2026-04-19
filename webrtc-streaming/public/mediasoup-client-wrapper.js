// 简化的 mediasoup-client 加载器
// 从 CDN 加载经过打包的版本
(function() {
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/mediasoup-client@3/dist/mediasoup-client.min.js';
  script.onload = function() {
    console.log('✅ mediasoup-client 加载成功');
  };
  script.onerror = function() {
    console.error('❌ mediasoup-client 加载失败');
  };
  document.head.appendChild(script);
})();
