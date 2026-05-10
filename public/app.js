const socket = io();

const joinView = document.querySelector("#joinView");
const chatView = document.querySelector("#chatView");
const joinForm = document.querySelector("#joinForm");
const nameInput = document.querySelector("#nameInput");
const roomInput = document.querySelector("#roomInput");
const roomSwitchInput = document.querySelector("#roomSwitchInput");
const switchRoomBtn = document.querySelector("#switchRoomBtn");
const quickRooms = document.querySelectorAll(".quick-rooms button");
const colorDots = document.querySelectorAll(".color-dot");
const connectionText = document.querySelector("#connectionText");
const roomTitle = document.querySelector("#roomTitle");
const messages = document.querySelector("#messages");
const userList = document.querySelector("#userList");
const onlineCount = document.querySelector("#onlineCount");
const messageForm = document.querySelector("#messageForm");
const messageInput = document.querySelector("#messageInput");
const moodInput = document.querySelector("#moodInput");
const typingLine = document.querySelector("#typingLine");
const soundToggle = document.querySelector("#soundToggle");
const themeToggle = document.querySelector("#themeToggle");
const clearBtn = document.querySelector("#clearBtn");

const typingUsers = new Map();
let selectedColor = "#6f8cff";
let me = null;
let currentRoom = "大厅";
let typingTimer = null;
let audioContext = null;

// 将服务器时间格式化为本地短时间，消息气泡里更容易扫读。
function formatTime(isoTime) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(isoTime));
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function getInitial(name) {
  return [...name.trim()][0]?.toUpperCase() || "?";
}

function scrollToBottom() {
  messages.scrollTop = messages.scrollHeight;
}

function setConnectionState(connected) {
  connectionText.textContent = connected ? "已连接" : "重连中";
}

function playNotice() {
  if (!soundToggle.checked) return;

  // 首次播放时再创建 AudioContext，避免浏览器自动播放限制。
  audioContext ||= new AudioContext();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(740, audioContext.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(520, audioContext.currentTime + 0.12);
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.16);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.18);
}

function renderMessages(history) {
  messages.innerHTML = "";
  history.forEach(addMessage);
  scrollToBottom();
}

function addMessage(message) {
  if (message.type === "system") {
    const system = document.createElement("div");
    system.className = "system-message";
    system.textContent = message.text;
    messages.append(system);
    scrollToBottom();
    return;
  }

  const isMine = message.user?.id === me?.id;
  const wrapper = document.createElement("article");
  wrapper.className = `message${isMine ? " mine" : ""}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.style.setProperty("--avatar", message.user.color);
  avatar.textContent = getInitial(message.user.name);

  const tag = message.meta?.mood ? `<span class="tag">${escapeHtml(message.meta.mood)}</span>` : "";

  wrapper.innerHTML = `
    <div class="bubble">
      <div class="meta-row">
        <span>${escapeHtml(message.user.name)}</span>
        ${tag}
        <time>${formatTime(message.time)}</time>
      </div>
      <p>${escapeHtml(message.text)}</p>
    </div>
  `;
  wrapper.prepend(avatar);
  messages.append(wrapper);

  if (!isMine) playNotice();
  scrollToBottom();
}

function renderUsers(users) {
  userList.innerHTML = "";
  onlineCount.textContent = users.length;

  users.forEach((user) => {
    const item = document.createElement("div");
    item.className = "user-pill";
    item.innerHTML = `
      <span class="avatar" style="--avatar:${user.color}">${escapeHtml(getInitial(user.name))}</span>
      <strong>${escapeHtml(user.name)}${user.id === me?.id ? "（我）" : ""}</strong>
    `;
    userList.append(item);
  });
}

function updateTypingLine() {
  const names = Array.from(typingUsers.values()).map((user) => user.name);
  typingLine.textContent = names.length ? `${names.join("、")} 正在输入...` : "";
}

function switchRoom(room) {
  const nextRoom = room.trim();
  if (!nextRoom || nextRoom === currentRoom) return;

  socket.emit("room:switch", nextRoom, (response) => {
    if (!response?.ok) return;
    currentRoom = response.room;
    roomTitle.textContent = currentRoom;
    roomSwitchInput.value = currentRoom;
    typingUsers.clear();
    updateTypingLine();
    renderMessages(response.history);
    renderUsers(response.users);
    messageInput.focus();
  });
}

colorDots.forEach((dot) => {
  dot.addEventListener("click", () => {
    colorDots.forEach((item) => item.classList.remove("active"));
    dot.classList.add("active");
    selectedColor = dot.dataset.color;
  });
});

joinForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const profile = {
    name: nameInput.value,
    room: roomInput.value,
    color: selectedColor
  };

  socket.emit("user:join", profile, (response) => {
    if (!response?.ok) return;

    me = response.me;
    currentRoom = me.room;
    roomTitle.textContent = currentRoom;
    roomSwitchInput.value = currentRoom;
    renderMessages(response.history);
    renderUsers(response.users);
    joinView.classList.add("hidden");
    chatView.classList.remove("hidden");
    messageInput.focus();
  });
});

messageForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;

  socket.emit("message:send", { text, mood: moodInput.value }, (response) => {
    if (!response?.ok) return;
    messageInput.value = "";
    messageInput.style.height = "auto";
    socket.emit("typing:stop");
  });
});

messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    messageForm.requestSubmit();
  }
});

messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = `${messageInput.scrollHeight}px`;
  socket.emit("typing:start");

  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => socket.emit("typing:stop"), 900);
});

switchRoomBtn.addEventListener("click", () => switchRoom(roomSwitchInput.value));
roomSwitchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") switchRoom(roomSwitchInput.value);
});

quickRooms.forEach((button) => {
  button.addEventListener("click", () => switchRoom(button.dataset.room));
});

clearBtn.addEventListener("click", () => {
  messages.innerHTML = "";
});

themeToggle.addEventListener("change", () => {
  document.body.classList.toggle("soft", themeToggle.checked);
});

socket.on("connect", () => setConnectionState(true));
socket.on("disconnect", () => setConnectionState(false));

socket.on("message:new", (message) => {
  addMessage(message);
});

socket.on("room:state", (state) => {
  if (state.room !== currentRoom) return;
  renderUsers(state.users);
});

socket.on("typing:update", ({ user, typing }) => {
  if (!user || user.id === me?.id) return;
  if (typing) typingUsers.set(user.id, user);
  else typingUsers.delete(user.id);
  updateTypingLine();
});
