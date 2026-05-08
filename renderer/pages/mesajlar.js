(() => {
  function renderMessagesPage({ messages, setMessages, saveMessages }) {
    const listEl = document.getElementById("conversationList");
    const headerEl = document.getElementById("chatHeader");
    const subHeaderEl = document.getElementById("chatSubHeader");
    const chatUserAvatarEl = document.getElementById("chatUserAvatar");
    const streamEl = document.getElementById("chatStream");
    const searchInput = document.getElementById("conversationSearch");
    const formEl = document.getElementById("messageForm");
    const inputEl = document.getElementById("messageInput");
    if (!listEl || !headerEl || !streamEl || !searchInput || !formEl || !inputEl) return;

    let activeConversationId = messages[0]?.id || null;

    const initials = (name) =>
      name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || "")
        .join("") || "K";

    const drawConversations = () => {
      const q = searchInput.value.trim().toLowerCase();
      const view = messages.filter((m) => m.name.toLowerCase().includes(q));
      listEl.innerHTML = view
        .map((m) => {
          const badge = m.unread > 0 ? `<span class="unread">${m.unread > 99 ? "+99" : m.unread}</span>` : "";
          const avatar = m.avatar
            ? `<img class="conv-avatar" src="${m.avatar}" alt="${m.name}" />`
            : `<div class="conv-avatar">${initials(m.name)}</div>`;
          return `<div class="conv-item ${activeConversationId === m.id ? "active" : ""}" data-id="${m.id}">
            ${avatar}
            <div class="conv-main">
              <div class="conv-title-row">
                <strong style="${m.unread > 0 ? "font-weight:800" : "font-weight:600"}">${m.name}</strong>
                <span class="conv-time">${m.lastTime || "10:42 AM"}</span>
              </div>
              <div class="conv-preview">${m.preview || ""}</div>
            </div>
            ${badge}
          </div>`;
        })
        .join("");
    };

    const drawStream = () => {
      const conv = messages.find((m) => m.id === activeConversationId);
      if (!conv) {
        headerEl.textContent = "Konuşma Seçiniz";
        if (subHeaderEl) subHeaderEl.textContent = "";
        if (chatUserAvatarEl) chatUserAvatarEl.textContent = "??";
        streamEl.innerHTML = '<p style="color:var(--muted)">Bir konuşma seçerek başlayın.</p>';
        return;
      }
      headerEl.textContent = conv.name;
      if (subHeaderEl) subHeaderEl.textContent = "Stajyer, Pazarlama Departmanı";
      if (chatUserAvatarEl) {
        if (conv.avatar) {
          chatUserAvatarEl.innerHTML = `<img src="${conv.avatar}" alt="${conv.name}" />`;
        } else {
          chatUserAvatarEl.textContent = initials(conv.name);
        }
      }
      streamEl.innerHTML = `
        <div class="day-chip">BUGÜN , 24 EKİM</div>
        ${conv.items
          .map((it) => {
            if (it.from === "me") {
              return `<div class="msg-row out">
                <div class="bubble out">${it.text}</div>
                <div class="msg-time">10:45 AM ✓✓</div>
              </div>`;
            }
            return `<div class="msg-row in">
              <div class="msg-avatar">${initials(conv.name)}</div>
              <div class="msg-col">
                <div class="bubble in">${it.text}</div>
                <div class="msg-time">10:42 AM</div>
              </div>
            </div>`;
          })
          .join("")}
      `;
    };

    listEl.onclick = async (event) => {
      const row = event.target.closest(".conv-item");
      if (!row) return;
      activeConversationId = row.dataset.id;
      const conv = messages.find((m) => m.id === activeConversationId);
      if (conv) conv.unread = 0;
      await saveMessages(messages);
      setMessages(messages);
      drawConversations();
      drawStream();
    };

    searchInput.oninput = drawConversations;

    formEl.onsubmit = async (event) => {
      event.preventDefault();
      const text = inputEl.value.trim();
      if (!text || !activeConversationId) return;
      const conv = messages.find((m) => m.id === activeConversationId);
      if (!conv) return;
      conv.items.push({ from: "me", text });
      conv.preview = text;
      inputEl.value = "";
      await saveMessages(messages);
      setMessages(messages);
      drawConversations();
      drawStream();
    };

    drawConversations();
    drawStream();
  }

  window.initMessagesPage = renderMessagesPage;
})();
