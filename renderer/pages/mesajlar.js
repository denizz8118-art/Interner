(() => {
  function renderMessagesPage({
    messages,
    setMessages,
    saveMessages,
    users = [],
    currentUser = null,
    getUserFullName = (u) => u?.ad_soyad || "-",
    getRoleLabel = (r) => String(r || "").toUpperCase(),
    getUserPhotoById = () => ""
  }) {
    const listEl = document.getElementById("conversationList");
    const headerEl = document.getElementById("chatHeader");
    const subHeaderEl = document.getElementById("chatSubHeader");
    const chatUserAvatarEl = document.getElementById("chatUserAvatar");
    const streamEl = document.getElementById("chatStream");
    const searchInput = document.getElementById("conversationSearch");
    const formEl = document.getElementById("messageForm");
    const inputEl = document.getElementById("messageInput");
    const pickerOverlay = document.getElementById("messagesUserPicker");
    const pickerListEl = document.getElementById("messagesUserPickerList");
    const contextMenuEl = document.getElementById("convContextMenu");
    const composeBtn = document.querySelector(".messages-compose-btn");

    if (!listEl || !headerEl || !streamEl || !searchInput || !formEl || !inputEl) return;

    let activeConversationId = null;
    let contextMenuConvId = null;

    function escapeHtml(s) {
      return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    const safeUsers = () => window.__chatUsers || users;
    const safeCurrent = () => window.__chatCurrentUser || currentUser;

    const photoOf = (userId) => {
      if (typeof window.__chatGetUserPhotoById === "function") {
        return String(window.__chatGetUserPhotoById(userId) || "").trim();
      }
      return String(getUserPhotoById(userId) || "").trim();
    };

    const myId = () => String(safeCurrent()?.id ?? "");

    const initials = (name) =>
      String(name || "")
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || "")
        .join("") || "K";

    const formatMsgTime = (ts) => {
      if (!ts) return "";
      try {
        return new Date(ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
      } catch {
        return "";
      }
    };

    const ensureConvShape = (c) => {
      if (!c.unreadByParticipant || typeof c.unreadByParticipant !== "object") c.unreadByParticipant = {};
      if (!c.conversationClearTsByUserId || typeof c.conversationClearTsByUserId !== "object") c.conversationClearTsByUserId = {};
      if (!Array.isArray(c.items)) c.items = [];
      return c;
    };

    const clearTsForViewer = (conv, viewerId) => Number(conv.conversationClearTsByUserId?.[String(viewerId)] || 0);

    /** Kullanıcı kendi geçmişini temizlediyse sadece o zamandan sonraki mesajlar görünür. */
    const itemVisibleForViewer = (it, conv, viewerId) => {
      const t0 = clearTsForViewer(conv, viewerId);
      const ts = Number(it.ts);
      if (!Number.isFinite(ts) || ts <= 0) return t0 === 0;
      return ts > t0;
    };

    const visibleItemsForViewer = (conv, viewerId) =>
      (conv.items || []).filter((it) => itemVisibleForViewer(it, conv, viewerId));

    const getUnread = (conv) => {
      const uid = myId();
      if (conv.unreadByParticipant && uid && conv.unreadByParticipant[uid] != null) {
        return Number(conv.unreadByParticipant[uid]) || 0;
      }
      return Number(conv.unread) || 0;
    };

    const isConvVisible = (conv) => {
      const uid = myId();
      const cu = safeCurrent();
      if (!cu) return visibleItemsForViewer(conv, "").length > 0 || !conv.participantIds?.length;
      if (conv.participantIds?.length) {
        if (!conv.participantIds.map(String).includes(uid)) return false;
      }
      return visibleItemsForViewer(conv, uid).length > 0;
    };

    const threadKeyFor = (a, b) => [String(a), String(b)].sort().join("::");

    const visibleConversations = () => messages.filter(isConvVisible).map(ensureConvShape);

    const sortConversations = (arr) =>
      [...arr].sort((a, b) => {
        const pa = a.pinned ? 1 : 0;
        const pb = b.pinned ? 1 : 0;
        if (pb !== pa) return pb - pa;
        const visA = visibleItemsForViewer(a, myId());
        const visB = visibleItemsForViewer(b, myId());
        const ta = visA.length ? visA[visA.length - 1]?.ts || 0 : 0;
        const tb = visB.length ? visB[visB.length - 1]?.ts || 0 : 0;
        return tb - ta;
      });

    const peerIdFromConv = (conv) => {
      if (!conv.participantIds?.length) return null;
      return conv.participantIds.map(String).find((id) => id !== myId()) || null;
    };

    const findUserById = (id) => safeUsers().find((u) => String(u.id) === String(id));

    const peerDisplayName = (conv) => {
      const pid = peerIdFromConv(conv);
      if (pid) {
        const u = findUserById(pid);
        if (u) return getUserFullName(u);
      }
      return conv.name || "Kullanıcı";
    };

    const isMineMessage = (item) => {
      if (item.senderId != null && item.senderId !== "") return String(item.senderId) === myId();
      return item.from === "me";
    };

    const senderMetaForItem = (it) => {
      const mine = isMineMessage(it);
      const cu = safeCurrent();
      if (mine) {
        const name = getUserFullName(cu);
        const photo = photoOf(cu?.id) || (cu && cu.profilFoto) || "";
        return { name, photo };
      }
      const sid = it.senderId != null && it.senderId !== "" ? String(it.senderId) : "";
      const u = sid ? findUserById(sid) : null;
      const name = u ? getUserFullName(u) : "Kullanıcı";
      const photo = sid ? photoOf(sid) : "";
      return { name, photo };
    };

    const avatarInnerHtml = (displayName, photoUrl) => {
      const p = String(photoUrl || "").trim();
      if (p) {
        const src = p.replace(/"/g, "%22");
        return `<img src="${src}" alt="${escapeHtml(displayName)}" />`;
      }
      return escapeHtml(initials(displayName));
    };

    const convRowAvatarHtml = (m) => {
      const peerId = peerIdFromConv(m);
      const name = peerDisplayName(m);
      const ph = peerId ? photoOf(peerId) : "";
      return avatarInnerHtml(name, ph);
    };

    const hideContextMenu = () => {
      contextMenuConvId = null;
      if (contextMenuEl) {
        contextMenuEl.hidden = true;
        contextMenuEl.innerHTML = "";
      }
    };

    const showContextMenu = (clientX, clientY, convId) => {
      if (!contextMenuEl) return;
      const conv = messages.find((m) => m.id === convId);
      if (!conv) return;
      contextMenuConvId = convId;
      const pinned = !!conv.pinned;
      contextMenuEl.innerHTML = `
        <button type="button" class="conv-context-item" data-action="pin">${pinned ? "Sabitlemeyi kaldır" : "Sohbeti sabitle"}</button>
        <button type="button" class="conv-context-item conv-context-danger" data-action="delete">Sohbeti sil</button>
      `;
      contextMenuEl.hidden = false;
      const pad = 8;
      let x = clientX;
      let y = clientY;
      contextMenuEl.style.left = `${x}px`;
      contextMenuEl.style.top = `${y}px`;
      requestAnimationFrame(() => {
        const rect = contextMenuEl.getBoundingClientRect();
        if (rect.right > window.innerWidth - pad) x = window.innerWidth - rect.width - pad;
        if (rect.bottom > window.innerHeight - pad) y = window.innerHeight - rect.height - pad;
        if (x < pad) x = pad;
        if (y < pad) y = pad;
        contextMenuEl.style.left = `${x}px`;
        contextMenuEl.style.top = `${y}px`;
      });
    };

    const refreshActiveIfHidden = () => {
      if (!activeConversationId) return;
      const c = messages.find((m) => m.id === activeConversationId);
      if (!c || !isConvVisible(c)) activeConversationId = pickInitialActive();
    };

    const drawConversations = () => {
      refreshActiveIfHidden();
      const q = searchInput.value.trim().toLowerCase();
      let view = sortConversations(visibleConversations()).filter((m) => peerDisplayName(m).toLowerCase().includes(q));
      listEl.innerHTML = view
        .map((m) => {
          const unread = getUnread(m);
          const badge = unread > 0 ? `<span class="unread">${unread > 99 ? "+99" : unread}</span>` : "";
          const pinMark = m.pinned ? `<span class="conv-pinned" title="Sabitlendi">📌</span>` : "";
          const vis = visibleItemsForViewer(m, myId());
          const last = vis.length ? vis[vis.length - 1] : null;
          const lastTime = last ? formatMsgTime(last.ts) : m.lastTime || "";
          const preview = last ? last.text : m.preview || "";
          const title = peerDisplayName(m);
          const avatar = `<div class="conv-avatar">${convRowAvatarHtml(m)}</div>`;
          return `<div class="conv-item ${activeConversationId === m.id ? "active" : ""}" data-id="${m.id}">
            ${avatar}
            <div class="conv-main">
              <div class="conv-title-row">
                <span class="conv-title-left">
                  <strong style="${unread > 0 ? "font-weight:800" : "font-weight:600"}">${escapeHtml(title)}</strong>
                  ${pinMark}
                </span>
                <span class="conv-time">${lastTime}</span>
              </div>
              <div class="conv-preview">${escapeHtml(preview)}</div>
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
      ensureConvShape(conv);
      const title = peerDisplayName(conv);
      headerEl.textContent = title;
      const pid = peerIdFromConv(conv);
      const peer = pid ? findUserById(pid) : null;
      const dept = peer?.departman || conv.departman || "—";
      const rol = peer ? peer.sirketUnvan || getRoleLabel(peer.rol) || String(peer.rol || "—") : conv.rol || conv.rolLabel || "—";
      if (subHeaderEl) subHeaderEl.textContent = `${rol} · ${dept}`;
      if (chatUserAvatarEl) {
        const headerPhoto = pid ? photoOf(pid) : "";
        if (headerPhoto) {
          const src = headerPhoto.replace(/"/g, "%22");
          chatUserAvatarEl.innerHTML = `<img src="${src}" alt="${escapeHtml(title)}" />`;
        } else {
          chatUserAvatarEl.innerHTML = "";
          chatUserAvatarEl.textContent = initials(title);
        }
      }
      const dayLabel = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long" }).toUpperCase();
      const vis = visibleItemsForViewer(conv, myId());
      streamEl.innerHTML = `
        <div class="day-chip">BUGÜN · ${dayLabel}</div>
        ${vis
          .map((it) => {
            const mine = isMineMessage(it);
            const t = formatMsgTime(it.ts);
            const { name: senderLabel, photo: senderPhoto } = senderMetaForItem(it);
            const avHtml = avatarInnerHtml(senderLabel, senderPhoto);
            if (mine) {
              return `<div class="msg-row out">
                <div class="msg-col msg-col-out">
                  <div class="msg-sender-name msg-sender-name-out">${escapeHtml(senderLabel)}</div>
                  <div class="bubble out">${escapeHtml(it.text)}</div>
                  <div class="msg-time">${t || "—"} ✓</div>
                </div>
                <div class="msg-avatar msg-avatar-out">${avHtml}</div>
              </div>`;
            }
            return `<div class="msg-row in">
              <div class="msg-avatar">${avHtml}</div>
              <div class="msg-col">
                <div class="msg-sender-name">${escapeHtml(senderLabel)}</div>
                <div class="bubble in">${escapeHtml(it.text)}</div>
                <div class="msg-time">${t || "—"}</div>
              </div>
            </div>`;
          })
          .join("")}
      `;
    };

    const persist = async () => {
      await saveMessages(messages);
      setMessages(messages);
    };

    const findOrCreatePeerConversation = (peer) => {
      const a = myId();
      const b = String(peer.id);
      if (!a || !b || a === b) return null;
      const tKey = threadKeyFor(a, b);
      let conv = messages.find((c) => c.threadKey === tKey);
      if (!conv) {
        conv = {
          id: `thread-${Date.now()}`,
          threadKey: tKey,
          participantIds: [a, b],
          name: getUserFullName(peer),
          departman: peer.departman || "—",
          rol: peer.sirketUnvan || getRoleLabel(peer.rol) || String(peer.rol || "—"),
          items: [],
          pinned: false,
          preview: "",
          lastTime: "",
          unread: 0,
          unreadByParticipant: {},
          conversationClearTsByUserId: {}
        };
        messages.push(conv);
      } else {
        conv.name = getUserFullName(peer);
        conv.departman = peer.departman || conv.departman || "—";
        conv.rol = peer.sirketUnvan || getRoleLabel(peer.rol) || conv.rol;
      }
      ensureConvShape(conv);
      return conv;
    };

    const openPicker = () => {
      if (!pickerOverlay || !pickerListEl || !safeCurrent()) return;
      const others = safeUsers().filter((u) => String(u.id) !== myId());
      pickerListEl.innerHTML = others.length
        ? others
            .map((u) => {
              const name = getUserFullName(u);
              const dept = u.departman || "—";
              const rol = u.sirketUnvan || getRoleLabel(u.rol) || String(u.rol || "—");
              const av = initials(name);
              return `<div class="messages-picker-row" data-user-id="${String(u.id)}">
              <div class="messages-picker-avatar">${av}</div>
              <div class="messages-picker-meta">
                <div class="messages-picker-name">${escapeHtml(name)}</div>
                <div class="messages-picker-sub">${escapeHtml(rol)} · ${escapeHtml(dept)}</div>
              </div>
              <button type="button" class="btn-primary messages-picker-msg-btn" data-user-id="${String(u.id)}">Mesaj</button>
            </div>`;
            })
            .join("")
        : '<p class="messages-picker-empty">Gösterilecek başka kullanıcı yok.</p>';
      pickerOverlay.hidden = false;
      pickerOverlay.setAttribute("aria-hidden", "false");
    };

    const closePicker = () => {
      if (!pickerOverlay) return;
      pickerOverlay.hidden = true;
      pickerOverlay.setAttribute("aria-hidden", "true");
    };

    const pickInitialActive = () => {
      const vis = sortConversations(visibleConversations());
      return vis[0]?.id || null;
    };

    if (!activeConversationId) activeConversationId = pickInitialActive();

    listEl.addEventListener("click", async (event) => {
      const row = event.target.closest(".conv-item");
      if (!row) return;
      activeConversationId = row.dataset.id;
      const conv = messages.find((m) => m.id === activeConversationId);
      if (conv) {
        ensureConvShape(conv);
        if (myId()) conv.unreadByParticipant[myId()] = 0;
        conv.unread = 0;
      }
      await persist();
      drawConversations();
      drawStream();
    });

    listEl.addEventListener("contextmenu", (event) => {
      const row = event.target.closest(".conv-item");
      if (!row) return;
      event.preventDefault();
      showContextMenu(event.clientX, event.clientY, row.dataset.id);
    });

    if (contextMenuEl) {
      contextMenuEl.addEventListener("click", async (event) => {
        const btn = event.target.closest("[data-action]");
        if (!btn || !contextMenuConvId) return;
        const action = btn.getAttribute("data-action");
        const conv = messages.find((m) => m.id === contextMenuConvId);
        hideContextMenu();
        if (!conv) return;
        if (action === "pin") {
          conv.pinned = !conv.pinned;
          await persist();
          drawConversations();
          drawStream();
        }
        if (action === "delete") {
          ensureConvShape(conv);
          const uid = myId();
          if (uid) {
            conv.conversationClearTsByUserId[uid] = Date.now();
            conv.unreadByParticipant[uid] = 0;
          }
          if (activeConversationId === conv.id) activeConversationId = pickInitialActive();
          await persist();
          drawConversations();
          drawStream();
        }
      });
    }

    document.addEventListener("click", (e) => {
      if (contextMenuEl && !contextMenuEl.hidden && !contextMenuEl.contains(e.target)) hideContextMenu();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        hideContextMenu();
        closePicker();
      }
    });

    if (pickerOverlay) {
      pickerOverlay.addEventListener("click", (e) => {
        if (e.target?.getAttribute?.("data-close-picker") === "1") closePicker();
      });
    }

    if (pickerListEl) {
      pickerListEl.addEventListener("click", async (e) => {
        const btn = e.target.closest(".messages-picker-msg-btn");
        if (!btn) return;
        const uid = btn.getAttribute("data-user-id");
        const peer = safeUsers().find((u) => String(u.id) === uid);
        if (!peer) return;
        const conv = findOrCreatePeerConversation(peer);
        if (!conv) return;
        activeConversationId = conv.id;
        if (myId()) {
          ensureConvShape(conv);
          conv.unreadByParticipant[myId()] = 0;
        }
        conv.unread = 0;
        await persist();
        closePicker();
        drawConversations();
        drawStream();
        inputEl.focus();
      });
    }

    if (composeBtn) composeBtn.onclick = () => openPicker();

    searchInput.oninput = drawConversations;

    formEl.onsubmit = async (event) => {
      event.preventDefault();
      const text = inputEl.value.trim();
      if (!text || !activeConversationId || !safeCurrent()) return;
      const conv = messages.find((m) => m.id === activeConversationId);
      if (!conv) return;
      ensureConvShape(conv);
      const ts = Date.now();
      conv.items.push({ senderId: myId(), text, ts });
      conv.preview = text;
      conv.lastTime = formatMsgTime(ts);
      const peer = peerIdFromConv(conv);
      if (peer) {
        conv.unreadByParticipant[peer] = (Number(conv.unreadByParticipant[peer]) || 0) + 1;
      } else {
        conv.unread = (Number(conv.unread) || 0) + 1;
      }
      if (myId()) conv.unreadByParticipant[myId()] = 0;
      inputEl.value = "";
      await persist();
      drawConversations();
      drawStream();
    };

    drawConversations();
    drawStream();

    window.__messagesPageRefresh = () => {
      refreshActiveIfHidden();
      drawConversations();
      drawStream();
    };
  }

  window.initMessagesPage = renderMessagesPage;
})();
