# Socket.IO 星港聊天室

一个基于 Node.js、Express 和 Socket.IO 的实时网络聊天室，包含房间切换、在线成员、输入状态、系统消息、消息历史、通知音和响应式前端界面。

## 本地运行

```bash
npm install
npm start
```

启动后访问：

```text
http://localhost:3000
```

## 项目结构

```text
server.js          # Express + Socket.IO 后端服务
public/           # 前端页面、样式和交互脚本
package.json      # 项目依赖和启动脚本
```

## 部署说明

这个项目需要常驻 Node.js 服务来维持 Socket.IO 实时连接，适合部署到 Render、Railway、Fly.io 或 VPS。

如果只把前端部署到 Netlify，需要将 `public/app.js` 中的 Socket.IO 连接地址改成后端公网地址。
