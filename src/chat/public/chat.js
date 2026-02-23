const form = document.getElementById("chat-form");
const nameInput = document.getElementById("name");
const messageInput = document.getElementById("message");
const messagesEl = document.getElementById("messages");
const submitButton = form.querySelector("button[type='submit']");

const NAME_STORAGE_KEY = "public_chat_name";
let isSending = false;

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("vi-VN");
}

function isNearBottom() {
  return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 80;
}

function renderMessages(messages, forceBottom = false) {
  const shouldStickToBottom = forceBottom || isNearBottom();
  const activeName = nameInput.value.trim().toLowerCase();

  if (!Array.isArray(messages) || messages.length === 0) {
    messagesEl.innerHTML = "<div class=\"empty\">Chưa có tin nhắn nào.</div>";
    return;
  }

  messagesEl.innerHTML = messages
    .map((item) => {
      const name = escapeHtml(item.name || "Ẩn danh");
      const text = escapeHtml(item.text || "");
      const createdAt = formatTime(item.createdAt);
      const mine = activeName && (item.name || "").trim().toLowerCase() === activeName;
      return `
        <article class="message-item${mine ? " mine" : ""}">
          <div class="message-meta"><strong>${name}</strong> • ${createdAt}</div>
          <div class="message-text">${text}</div>
        </article>
      `;
    })
    .join("");

  if (shouldStickToBottom) {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

async function loadMessages(forceBottom = false) {
  try {
    const response = await fetch("/api/chat/messages");
    if (!response.ok) {
      throw new Error("Không tải được tin nhắn");
    }
    const messages = await response.json();
    renderMessages(messages, forceBottom);
  } catch (error) {
    messagesEl.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = nameInput.value.trim();
  const text = messageInput.value.trim();
  if (!name || !text || isSending) {
    return;
  }

  try {
    isSending = true;
    submitButton.disabled = true;

    const response = await fetch("/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, text })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Không gửi được tin nhắn");
    }

    localStorage.setItem(NAME_STORAGE_KEY, name);
    messageInput.value = "";
    messageInput.style.height = "";
    await loadMessages(true);
    messageInput.focus();
  } catch (error) {
    alert(error.message);
  } finally {
    isSending = false;
    submitButton.disabled = false;
  }
});

messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 150)}px`;
});

function init() {
  const savedName = localStorage.getItem(NAME_STORAGE_KEY);
  if (savedName) {
    nameInput.value = savedName;
  }

  void loadMessages(true);
  setInterval(loadMessages, 2500);
}

init();
