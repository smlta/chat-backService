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
const quickEmoji = document.querySelector("#quickEmoji");
const mediaInput = document.querySelector("#mediaInput");
const attachmentHint = document.querySelector("#attachmentHint");
const attachmentPreview = document.querySelector("#attachmentPreview");
const stickerToggleBtn = document.querySelector("#stickerToggleBtn");
const stickerPanel = document.querySelector("#stickerPanel");
const themeChips = document.querySelectorAll(".theme-chip");

const typingUsers = new Map();
const MAX_MEDIA_SIZE = 6 * 1024 * 1024;
let selectedColor = "#7c91ff";
let currentTheme = "cosmos";
let me = null;
let currentRoom = "大厅";
let typingTimer = null;
let audioContext = null;
let pendingAttachment = null;

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

  audioContext ||= new AudioContext();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(780, audioContext.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(520, audioContext.currentTime + 0.12);
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.06, audioContext.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.18);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.2);
}

function updateViewportHeight() {
  document.documentElement.style.setProperty("--app-height", `${window.innerHeight}px`);
}

function setTheme(theme) {
  currentTheme = theme;
  document.body.classList.remove("theme-cosmos", "theme-sunset", "theme-mint");
  if (theme !== "cosmos") {
    document.body.classList.add(`theme-${theme}`);
  }
  themeChips.forEach((chip) => chip.classList.toggle("active", chip.dataset.theme === theme));
}

function renderMessages(history) {
  messages.innerHTML = "";
  history.forEach(addMessage);
  scrollToBottom();
}

function createSystemMessage(text) {
  const system = document.createElement("div");
  system.className = "system-message";
  system.textContent = text;
  return system;
}

function renderMessageMedia(media, mine) {
  if (!media?.url || !media?.kind) return "";

  if (media.kind === "video") {
    return `
      <div class="message-media">
        <video controls preload="metadata" ${mine ? "" : 'playsinline'}>
          <source src="${escapeHtml(media.url)}" type="${escapeHtml(media.mime || "video/mp4")}" />
        </video>
        <div class="media-caption">${escapeHtml(media.name || "视频")}</div>
      </div>
    `;
  }

  return `
    <div class="message-media">
      <img src="${escapeHtml(media.url)}" alt="${escapeHtml(media.name || "图片消息")}" loading="lazy" />
      <div class="media-caption">${escapeHtml(media.name || (media.kind === "sticker" ? "贴纸" : "图片"))}</div>
    </div>
  `;
}

function addMessage(message) {
  if (message.type === "system") {
    messages.append(createSystemMessage(message.text));
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

  const safeText = message.text ? `<p>${escapeHtml(message.text)}</p>` : "";
  const tag = message.meta?.mood ? `<span class="tag">${escapeHtml(message.meta.mood)}</span>` : "";
  const mediaMarkup = renderMessageMedia(message.media, isMine);

  wrapper.innerHTML = `
    <div class="bubble">
      <div class="meta-row">
        <span>${escapeHtml(message.user.name)}</span>
        ${tag}
        <time>${formatTime(message.time)}</time>
      </div>
      ${safeText}
      ${mediaMarkup}
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

function clearPendingAttachment() {
  pendingAttachment = null;
  mediaInput.value = "";
  attachmentPreview.innerHTML = "";
  attachmentPreview.classList.add("hidden");
  attachmentHint.textContent = "支持图片、GIF、MP4 / WebM，单文件最多约 6MB。";
}

function renderAttachmentPreview() {
  if (!pendingAttachment) {
    clearPendingAttachment();
    return;
  }

  const previewTag =
    pendingAttachment.kind === "video"
      ? `<video controls preload="metadata"><source src="${escapeHtml(pendingAttachment.url)}" type="${escapeHtml(pendingAttachment.mime)}" /></video>`
      : `<img src="${escapeHtml(pendingAttachment.url)}" alt="${escapeHtml(pendingAttachment.name)}" />`;

  attachmentPreview.classList.remove("hidden");
  attachmentPreview.innerHTML = `
    <div class="preview-copy">
      ${previewTag}
      <strong>${escapeHtml(pendingAttachment.name)}</strong>
      <span>${escapeHtml(pendingAttachment.kind === "sticker" ? "贴纸消息" : pendingAttachment.mime)} · ${Math.max(1, Math.round(pendingAttachment.size / 1024))} KB</span>
    </div>
    <button class="preview-remove" type="button" id="removeAttachmentBtn">移除</button>
  `;

  const removeAttachmentBtn = document.querySelector("#removeAttachmentBtn");
  removeAttachmentBtn?.addEventListener("click", clearPendingAttachment);
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
    clearPendingAttachment();
    renderMessages(response.history);
    renderUsers(response.users);
    messageInput.focus();
  });
}

function insertAtCursor(text) {
  const start = messageInput.selectionStart;
  const end = messageInput.selectionEnd;
  const current = messageInput.value;
  messageInput.value = `${current.slice(0, start)}${text}${current.slice(end)}`;
  messageInput.dispatchEvent(new Event("input", { bubbles: true }));
  const nextPosition = start + text.length;
  messageInput.setSelectionRange(nextPosition, nextPosition);
  messageInput.focus();
}

function buildMediaPayload() {
  if (!pendingAttachment) return null;
  return {
    kind: pendingAttachment.kind,
    url: pendingAttachment.url,
    mime: pendingAttachment.mime,
    name: pendingAttachment.name,
    size: pendingAttachment.size
  };
}

async function handleFileSelection(file) {
  if (!file) return;
  if (!/^image\/|^video\//.test(file.type)) {
    attachmentHint.textContent = "只支持图片和视频文件。";
    return;
  }
  if (file.size > MAX_MEDIA_SIZE) {
    attachmentHint.textContent = "文件过大，请控制在 6MB 以内。";
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    pendingAttachment = {
      kind: file.type.startsWith("video/") ? "video" : "image",
      url: reader.result,
      mime: file.type,
      name: file.name,
      size: file.size
    };
    attachmentHint.textContent = "附件已就绪，发送时会和文本一起发出。";
    renderAttachmentPreview();
  });
  reader.readAsDataURL(file);
}

colorDots.forEach((dot) => {
  dot.addEventListener("click", () => {
    colorDots.forEach((item) => item.classList.remove("active"));
    dot.classList.add("active");
    selectedColor = dot.dataset.color;
  });
});

themeChips.forEach((chip) => {
  chip.addEventListener("click", () => setTheme(chip.dataset.theme));
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
  const media = buildMediaPayload();

  if (!text && !media) return;

  socket.emit("message:send", { text, mood: moodInput.value, media }, (response) => {
    if (!response?.ok) {
      attachmentHint.textContent = response?.error || "发送失败，请稍后重试。";
      return;
    }

    messageInput.value = "";
    messageInput.style.height = "auto";
    clearPendingAttachment();
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
  if (event.key === "Enter") {
    event.preventDefault();
    switchRoom(roomSwitchInput.value);
  }
});

quickRooms.forEach((button) => {
  button.addEventListener("click", () => switchRoom(button.dataset.room));
});

clearBtn.addEventListener("click", () => {
  messages.innerHTML = "";
  messages.append(createSystemMessage("本地消息面板已清空，服务端历史不会删除。"));
});

themeToggle.addEventListener("change", () => {
  document.body.classList.toggle("soft", themeToggle.checked);
});

quickEmoji.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-emoji]");
  if (!button) return;
  insertAtCursor(`${button.dataset.emoji} `);
});

mediaInput.addEventListener("change", () => {
  handleFileSelection(mediaInput.files?.[0]);
});

stickerToggleBtn.addEventListener("click", () => {
  stickerPanel.classList.toggle("hidden");
});

stickerPanel.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-sticker]");
  if (!button) return;

  pendingAttachment = {
    kind: "sticker",
    url: button.dataset.sticker,
    mime: "image/gif",
    name: button.textContent.trim(),
    size: 1
  };
  stickerPanel.classList.add("hidden");
  attachmentHint.textContent = "贴纸已选择，发送后会作为消息内容发出。";
  renderAttachmentPreview();
});

window.addEventListener("resize", updateViewportHeight);
updateViewportHeight();
setTheme(currentTheme);

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
