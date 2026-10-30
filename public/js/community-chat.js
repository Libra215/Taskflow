
(function () {
    'use strict';

    const root = document.getElementById('communityChat');
    if (!root) return;

    const currentUserId = String(root.dataset.userId || '');
    const messagesEl = document.getElementById('communityMessages');
    const form = document.getElementById('communityForm');
    const input = document.getElementById('communityInput');
    const sendButton = document.getElementById('communitySend');
    const connectionEl = document.getElementById('communityConnection');
    const onlineEl = document.getElementById('communityOnline');
    const feedbackEl = document.getElementById('communityFeedback');
    const loadingEl = document.getElementById('communityLoading');
    const replyEl = document.getElementById('communityReply');
    const replyTextEl = document.getElementById('communityReplyText');
    const cancelReplyButton = document.getElementById('communityCancelReply');

    let replyToId = null;
    let connected = false;

    const messageElements = new Map();
    const messageData = new Map();

    if (typeof window.io !== 'function') {
        connectionEl.textContent = 'Socket.IO tidak tersedia';
        feedbackEl.textContent = 'Muat ulang halaman atau hubungi administrator.';
        return;
    }

    const socket = window.io({
        transports: ['websocket', 'polling']
    });

    function setFeedback(message, isError) {
        feedbackEl.textContent = message || '';
        feedbackEl.classList.toggle('text-danger', Boolean(isError));
        feedbackEl.classList.toggle('text-muted', !isError);
    }

    function formatTime(value) {
        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return '';
        }

        return new Intl.DateTimeFormat('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: 'short'
        }).format(date);
    }

    function scrollToBottom() {
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function clearReply() {
        replyToId = null;
        replyEl.style.display = 'none';
        replyTextEl.textContent = '';
    }

    function setReply(message) {
        replyToId = message.id;
        replyTextEl.textContent =
            ' — ' + String(message.userName || 'Pengguna') +
            ': ' + String(message.message || '').slice(0, 100);

        replyEl.style.display = 'block';
        input.focus();
    }

    function createAction(label, action) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.addEventListener('click', action);
        return button;
    }

    function renderMessage(message) {
        if (!message || !message.id) return;

        const id = String(message.id);
        messageData.set(id, message);

        let card = messageElements.get(id);

        if (!card) {
            card = document.createElement('article');
            card.className = 'community-message';
            card.dataset.messageId = id;

            const meta = document.createElement('div');
            meta.className = 'community-message-meta';

            const author = document.createElement('span');
            author.className = 'community-message-author';

            const time = document.createElement('time');

            const edited = document.createElement('span');
            edited.className = 'community-edited';

            meta.append(author, time, edited);

            const replyQuote = document.createElement('div');
            replyQuote.className = 'small text-muted mb-2';

            const text = document.createElement('p');
            text.className = 'community-message-text';

            const actions = document.createElement('div');
            actions.className = 'community-actions';

            card.append(meta, replyQuote, text, actions);
            messageElements.set(id, card);
        }

        const meta = card.querySelector('.community-message-meta');
        const author = meta.querySelector('.community-message-author');
        const time = meta.querySelector('time');
        const edited = meta.querySelector('.community-edited');
        const replyQuote = card.querySelector('.community-message-meta + div');
        const text = card.querySelector('.community-message-text');
        const actions = card.querySelector('.community-actions');

        const ownMessage = String(message.userId) === currentUserId;

        card.classList.toggle('own-message', ownMessage);

        author.textContent = String(message.userName || 'Pengguna');
        time.textContent = formatTime(message.createdAt);
        time.dateTime = message.createdAt || '';

        edited.textContent = message.editedAt ? '(diedit)' : '';

        replyQuote.textContent = '';

        if (message.replyToId) {
            const parent = messageData.get(String(message.replyToId));

            replyQuote.textContent = parent
                ? 'Membalas ' + String(parent.userName || 'Pengguna') +
                  ': ' + String(parent.message || '').slice(0, 100)
                : 'Membalas pesan sebelumnya';
        }

        text.textContent = message.deletedAt
            ? 'Pesan ini telah dihapus.'
            : String(message.message || '');

        actions.replaceChildren();

        if (!message.deletedAt) {
            actions.appendChild(
                createAction('Balas', () => setReply(message))
            );

            if (ownMessage) {
                actions.appendChild(
                    createAction('Edit', () => {
                        const newMessage = window.prompt(
                            'Edit pesan:',
                            String(message.message || '')
                        );

                        if (newMessage === null) return;

                        socket.emit('chat:edit', {
                            id,
                            message: newMessage
                        }, handleAck);
                    })
                );

                actions.appendChild(
                    createAction('Hapus', () => {
                        if (!window.confirm('Hapus pesan ini?')) return;

                        socket.emit('chat:delete', { id }, handleAck);
                    })
                );
            } else {
                actions.appendChild(
                    createAction('Laporkan', () => {
                        const reason = window.prompt(
                            'Jelaskan alasan laporan:'
                        );

                        if (!reason || !reason.trim()) return;

                        socket.emit('chat:report', {
                            messageId: id,
                            reason: reason.trim()
                        }, handleAck);
                    })
                );
            }
        }

        // Pertahankan posisi pesan yang sudah ada saat diedit.
        if (!card.isConnected) {
            messagesEl.appendChild(card);
        }
    }

    function handleAck(result) {
        if (!result || !result.ok) {
            setFeedback(
                result?.error || 'Permintaan gagal diproses.',
                true
            );
            return;
        }

        setFeedback(result.message || '', false);
    }

    socket.on('connect', function () {
        connected = true;
        connectionEl.textContent = 'Terhubung';
        sendButton.disabled = false;
        setFeedback('', false);
    });

    socket.on('disconnect', function () {
        connected = false;
        connectionEl.textContent = 'Terputus';
        sendButton.disabled = true;
    });

    socket.on('connect_error', function (error) {
        connectionEl.textContent = 'Gagal terhubung';

        if (error.message === 'AUTH_REQUIRED') {
            setFeedback('Sesi login berakhir. Silakan login kembali.', true);
        } else {
            setFeedback('Tidak dapat terhubung ke ruang chat.', true);
        }
    });

    socket.on('chat:online', function (count) {
        onlineEl.textContent = String(Number(count) || 0);
    });

    socket.on('chat:history', function (messages) {
        loadingEl?.remove();

        if (!Array.isArray(messages)) return;

        messages.forEach(renderMessage);
        scrollToBottom();
    });

    socket.on('chat:new', function (message) {
        loadingEl?.remove();
        renderMessage(message);
        scrollToBottom();
    });

    socket.on('chat:updated', function (message) {
        renderMessage(message);
    });

    socket.on('chat:deleted', function (data) {
        if (!data?.id) return;

        const existing = messageData.get(String(data.id));
        if (!existing) return;

        existing.deletedAt = new Date().toISOString();
        existing.message = '';

        renderMessage(existing);
    });

    socket.on('chat:error', function (message) {
        setFeedback(String(message || 'Terjadi kesalahan chat.'), true);
    });

    form.addEventListener('submit', function (event) {
        event.preventDefault();

        if (!connected) {
            setFeedback('Belum terhubung ke server chat.', true);
            return;
        }

        const message = input.value.trim();

        if (!message) {
            setFeedback('Pesan tidak boleh kosong.', true);
            return;
        }

        if (message.length > 2000) {
            setFeedback('Pesan maksimal 2000 karakter.', true);
            return;
        }

        sendButton.disabled = true;

        socket.emit('chat:send', {
            message,
            replyToId
        }, function (result) {
            sendButton.disabled = false;

            if (!result || !result.ok) {
                handleAck(result);
                return;
            }

            input.value = '';
            clearReply();
            setFeedback('', false);
            input.focus();
        });
    });

    input.addEventListener('keydown', function (event) {
        if (
            event.key === 'Enter' &&
            !event.shiftKey &&
            !event.isComposing
        ) {
            event.preventDefault();
            form.requestSubmit();
        }
    });

    cancelReplyButton.addEventListener('click', clearReply);

    sendButton.disabled = true;
})();
