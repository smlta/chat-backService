const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;
const MAX_HISTORY_PER_ROOM = 80;
const DEFAULT_ROOM = "大厅";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

// 托管 public 目录，浏览器访问根路径即可打开聊天室页面。
app.use(express.static(path.join(__dirname, "public")));
// 暴露本地 Live2D 模型资源，前端通过 /models/xueli/雪莉.model3.json 加载雪莉。
app.use("/models/xueli", express.static(path.join(__dirname, "雪莉")));

// 在线用户和房间消息历史都保存在内存中，适合学习和小型演示。
// 如果要上线，可替换为 Redis / 数据库，让多进程和重启后也能保留状态。
const users = new Map();
const roomHistory = new Map([[DEFAULT_ROOM, []]]);

function getRoomHistory(room) {
  if (!roomHistory.has(room)) {
    roomHistory.set(room, []);
  }
  return roomHistory.get(room);
}

function pushRoomMessage(room, message) {
  const history = getRoomHistory(room);
  history.push(message);

  // 限制历史长度，避免长时间运行后内存无限增长。
  if (history.length > MAX_HISTORY_PER_ROOM) {
    history.shift();
  }
}

function createMessage({ type = "chat", room, user, text, meta = {} }) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    room,
    user,
    text,
    meta,
    time: new Date().toISOString()
  };
}

function getPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    color: user.color,
    room: user.room
  };
}

function getRoomUsers(room) {
  return Array.from(users.values())
    .filter((user) => user.room === room)
    .map(getPublicUser)
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

function broadcastRoomState(room) {
  io.to(room).emit("room:state", {
    room,
    users: getRoomUsers(room),
    onlineCount: getRoomUsers(room).length
  });
}

function sanitizeText(value, maxLength = 800) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

io.on("connection", (socket) => {
  socket.on("user:join", (profile, callback) => {
    const name = sanitizeText(profile?.name, 24) || `访客${socket.id.slice(0, 4)}`;
    const requestedRoom = sanitizeText(profile?.room, 24) || DEFAULT_ROOM;
    const color = /^#[0-9a-f]{6}$/i.test(profile?.color) ? profile.color : "#6f8cff";

    const user = {
      id: socket.id,
      name,
      color,
      room: requestedRoom
    };

    users.set(socket.id, user);
    socket.join(requestedRoom);

    const notice = createMessage({
      type: "system",
      room: requestedRoom,
      user: { name: "系统", color: "#98a2b3" },
      text: `${name} 加入了 ${requestedRoom}`
    });

    pushRoomMessage(requestedRoom, notice);
    socket.to(requestedRoom).emit("message:new", notice);
    broadcastRoomState(requestedRoom);

    // 通过回调把初始状态直接返回给当前客户端，避免额外请求。
    callback?.({
      ok: true,
      me: getPublicUser(user),
      history: getRoomHistory(requestedRoom),
      users: getRoomUsers(requestedRoom)
    });
  });

  socket.on("room:switch", (roomName, callback) => {
    const user = users.get(socket.id);
    if (!user) return;

    const nextRoom = sanitizeText(roomName, 24) || DEFAULT_ROOM;
    const previousRoom = user.room;
    if (previousRoom === nextRoom) {
      callback?.({
        ok: true,
        room: nextRoom,
        history: getRoomHistory(nextRoom),
        users: getRoomUsers(nextRoom)
      });
      return;
    }

    socket.leave(previousRoom);
    socket.join(nextRoom);
    user.room = nextRoom;

    const leaveNotice = createMessage({
      type: "system",
      room: previousRoom,
      user: { name: "系统", color: "#98a2b3" },
      text: `${user.name} 离开了 ${previousRoom}`
    });
    const joinNotice = createMessage({
      type: "system",
      room: nextRoom,
      user: { name: "系统", color: "#98a2b3" },
      text: `${user.name} 加入了 ${nextRoom}`
    });

    pushRoomMessage(previousRoom, leaveNotice);
    pushRoomMessage(nextRoom, joinNotice);
    socket.to(previousRoom).emit("message:new", leaveNotice);
    socket.to(nextRoom).emit("message:new", joinNotice);
    broadcastRoomState(previousRoom);
    broadcastRoomState(nextRoom);

    callback?.({
      ok: true,
      room: nextRoom,
      history: getRoomHistory(nextRoom),
      users: getRoomUsers(nextRoom)
    });
  });

  socket.on("message:send", (payload, callback) => {
    const user = users.get(socket.id);
    if (!user) return;

    const text = sanitizeText(payload?.text);
    if (!text) {
      callback?.({ ok: false, error: "消息不能为空" });
      return;
    }

    const message = createMessage({
      room: user.room,
      user: getPublicUser(user),
      text,
      meta: {
        mood: sanitizeText(payload?.mood, 12)
      }
    });

    pushRoomMessage(user.room, message);
    io.to(user.room).emit("message:new", message);
    callback?.({ ok: true, message });
  });

  socket.on("typing:start", () => {
    const user = users.get(socket.id);
    if (user) socket.to(user.room).emit("typing:update", { user: getPublicUser(user), typing: true });
  });

  socket.on("typing:stop", () => {
    const user = users.get(socket.id);
    if (user) socket.to(user.room).emit("typing:update", { user: getPublicUser(user), typing: false });
  });

  socket.on("disconnect", () => {
    const user = users.get(socket.id);
    if (!user) return;

    users.delete(socket.id);
    const notice = createMessage({
      type: "system",
      room: user.room,
      user: { name: "系统", color: "#98a2b3" },
      text: `${user.name} 下线了`
    });

    pushRoomMessage(user.room, notice);
    socket.to(user.room).emit("message:new", notice);
    broadcastRoomState(user.room);
  });
});

server.listen(PORT, () => {
  console.log(`Socket.IO chat room is running at http://localhost:${PORT}`);
});
