const form = document.getElementById("chat-form");
const nameInput = document.getElementById("name");
const messageInput = document.getElementById("message");
const messagesEl = document.getElementById("messages");

const NAME_STORAGE_KEY = "public_chat_name";

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

function renderMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    messagesEl.innerHTML = "<div class=\"message-item\">Chưa có tin nhắn nào.</div>";
    return;
  }

  messagesEl.innerHTML = messages
    .map((item) => {
      const name = escapeHtml(item.name || "Ẩn danh");
      const text = escapeHtml(item.text || "");
      const createdAt = formatTime(item.createdAt);
      return `
        <article class="message-item">
          <div class="message-meta"><strong>${name}</strong> • ${createdAt}</div>
          <div class="message-text">${text}</div>
        </article>
      `;
    })
    .join("");

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function loadMessages() {
  try {
    const response = await fetch("/api/chat/messages");
    if (!response.ok) {
      throw new Error("Không tải được tin nhắn");
    }
    const messages = await response.json();
    renderMessages(messages);
  } catch (error) {
    messagesEl.innerHTML = `<div class="message-item">${escapeHtml(error.message)}</div>`;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = nameInput.value.trim();
  const text = messageInput.value.trim();
  if (!name || !text) {
    return;
  }

  try {
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
    await loadMessages();
  } catch (error) {
    alert(error.message);
  }
});

function init() {
  const savedName = localStorage.getItem(NAME_STORAGE_KEY);
  if (savedName) {
    nameInput.value = savedName;
  }

  void loadMessages();
  setInterval(loadMessages, 2500);
}

init();
