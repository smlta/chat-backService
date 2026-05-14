const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;
const MAX_HISTORY_PER_ROOM = 80;
const DEFAULT_ROOM = "大厅";
const MAX_TEXT_LENGTH = 800;
const MAX_MEDIA_URL_LENGTH = 8 * 1024 * 1024;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

app.use(express.static(path.join(__dirname, "public")));
app.use("/models/xueli", express.static(path.join(__dirname, "雪莉")));

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
  if (history.length > MAX_HISTORY_PER_ROOM) {
    history.shift();
  }
}

function createMessage({ type = "chat", room, user, text = "", meta = {}, media = null }) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    room,
    user,
    text,
    meta,
    media,
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
  const roomUsers = getRoomUsers(room);
  io.to(room).emit("room:state", {
    room,
    users: roomUsers,
    onlineCount: roomUsers.length
  });
}

function sanitizeText(value, maxLength = MAX_TEXT_LENGTH, preserveLines = false) {
  const source = String(value ?? "");
  const normalized = preserveLines
    ? source.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim()
    : source.replace(/\s+/g, " ").trim();
  return normalized.slice(0, maxLength);
}

function sanitizeMedia(rawMedia) {
  if (!rawMedia) return null;

  const kind = ["image", "video", "sticker"].includes(rawMedia.kind) ? rawMedia.kind : null;
  const url = typeof rawMedia.url === "string" ? rawMedia.url.trim() : "";
  if (!kind || !url || url.length > MAX_MEDIA_URL_LENGTH) {
    return null;
  }

  const safeMime = sanitizeText(rawMedia.mime, 80);
  const safeName = sanitizeText(rawMedia.name, 60);
  const size = Number(rawMedia.size) || 0;

  if (kind === "video" && !/^data:video\/|^https?:\/\//.test(url)) {
    return null;
  }

  if ((kind === "image" || kind === "sticker") && !/^data:image\/|^https?:\/\//.test(url)) {
    return null;
  }

  return {
    kind,
    url,
    mime: safeMime,
    name: safeName,
    size
  };
}

function createSystemNotice(room, text) {
  return createMessage({
    type: "system",
    room,
    user: { name: "系统", color: "#98a2b3" },
    text
  });
}

io.on("connection", (socket) => {
  socket.on("user:join", (profile, callback) => {
    const name = sanitizeText(profile?.name, 24) || `访客${socket.id.slice(0, 4)}`;
    const requestedRoom = sanitizeText(profile?.room, 24) || DEFAULT_ROOM;
    const color = /^#[0-9a-f]{6}$/i.test(profile?.color) ? profile.color : "#7c91ff";

    const user = {
      id: socket.id,
      name,
      color,
      room: requestedRoom
    };

    users.set(socket.id, user);
    socket.join(requestedRoom);

    const notice = createSystemNotice(requestedRoom, `${name} 加入了 ${requestedRoom}`);
    pushRoomMessage(requestedRoom, notice);
    socket.to(requestedRoom).emit("message:new", notice);
    broadcastRoomState(requestedRoom);

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

    const leaveNotice = createSystemNotice(previousRoom, `${user.name} 离开了 ${previousRoom}`);
    const joinNotice = createSystemNotice(nextRoom, `${user.name} 加入了 ${nextRoom}`);

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

    const text = sanitizeText(payload?.text, MAX_TEXT_LENGTH, true);
    const media = sanitizeMedia(payload?.media);
    if (!text && !media) {
      callback?.({ ok: false, error: "消息和附件不能同时为空" });
      return;
    }

    const message = createMessage({
      room: user.room,
      user: getPublicUser(user),
      text,
      media,
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
    if (user) {
      socket.to(user.room).emit("typing:update", { user: getPublicUser(user), typing: true });
    }
  });

  socket.on("typing:stop", () => {
    const user = users.get(socket.id);
    if (user) {
      socket.to(user.room).emit("typing:update", { user: getPublicUser(user), typing: false });
    }
  });

  socket.on("disconnect", () => {
    const user = users.get(socket.id);
    if (!user) return;

    users.delete(socket.id);
    const notice = createSystemNotice(user.room, `${user.name} 下线了`);
    pushRoomMessage(user.room, notice);
    socket.to(user.room).emit("message:new", notice);
    broadcastRoomState(user.room);
  });
});

server.listen(PORT, () => {
  console.log(`Socket.IO chat room is running at http://localhost:${PORT}`);
});
