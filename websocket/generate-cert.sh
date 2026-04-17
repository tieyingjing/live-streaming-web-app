#!/bin/bash

# SSL 证书生成脚本（用于 WSS 开发环境）

echo "🔐 正在生成自签名 SSL 证书..."
echo ""

# 创建 ssl 目录
mkdir -p ssl

# 生成自签名证书
# - rsa:4096: 4096 位 RSA 密钥
# - days 365: 有效期 1 年
# - nodes: 不加密私钥（开发环境）
# - subj: 证书信息（避免交互式输入）

openssl req -x509 -newkey rsa:4096 \
  -keyout ssl/key.pem \
  -out ssl/cert.pem \
  -days 365 \
  -nodes \
  -subj "/C=CN/ST=State/L=City/O=Development/OU=IT/CN=localhost"

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ SSL 证书生成成功！"
  echo ""
  echo "📁 证书文件位置："
  echo "   私钥: ssl/key.pem"
  echo "   证书: ssl/cert.pem"
  echo ""
  echo "⚠️  注意："
  echo "1. 这是自签名证书，仅用于开发环境"
  echo "2. 浏览器会显示\"不安全\"警告，这是正常的"
  echo "3. 生产环境请使用 Let's Encrypt 等正式证书"
  echo ""
  echo "🚀 现在可以运行: npm run start:wss"
else
  echo ""
  echo "❌ 证书生成失败"
  echo "请确保已安装 openssl"
  echo ""
  echo "安装方法："
  echo "  macOS:   brew install openssl"
  echo "  Ubuntu:  sudo apt-get install openssl"
  echo "  Windows: 使用 Git Bash 或下载 OpenSSL"
fi
