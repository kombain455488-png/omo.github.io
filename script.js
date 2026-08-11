// ==================== СОСТОЯНИЕ ====================
let currentUser = null;
let currentChatId = null;
let socket = null;
let chatHistory = [];

// DOM-элементы
const authPage = document.getElementById('auth-page');
const chatPage = document.getElementById('chat-page');
const chatList = document.getElementById('chat-list');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('send-btn');
const chatName = document.getElementById('chat-name');
const currentUserSpan = document.getElementById('current-user');
const logoutBtn = document.getElementById('logout-btn');
const modal = document.getElementById('modal');
const newChatName = document.getElementById('new-chat-name');
const createChatBtn = document.getElementById('create-chat-btn');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const newChatBtn = document.getElementById('new-chat-btn');

// ==================== АУТЕНТИФИКАЦИЯ ====================

// Проверка авторизации
async function checkAuth() {
    try {
        const res = await fetch('/api/me');
        if (res.ok) {
            const data = await res.json();
            currentUser = data.username;
            showChatPage();
        }
    } catch {}
}

// Регистрация
document.getElementById('register-btn').addEventListener('click', async () => {
    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;
    
    const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    
    const data = await res.json();
    if (data.success) {
        showLoginForm();
        showAuthError('Регистрация успешна! Теперь войдите.');
    } else {
        showAuthError(data.error);
    }
});

// Вход
document.getElementById('login-btn').addEventListener('click', async () => {
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    
    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    
    const data = await res.json();
    if (data.success) {
        currentUser = data.username;
        showChatPage();
    } else {
        showAuthError(data.error);
    }
});

// Переключение между формами
document.getElementById('show-register').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
    showAuthError('');
});

document.getElementById('show-login').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
    showAuthError('');
});

function showAuthError(msg) {
    document.getElementById('auth-error').textContent = msg;
}

function showLoginForm() {
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
}

// Выход
logoutBtn.addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    if (socket) socket.disconnect();
    currentUser = null;
    currentChatId = null;
    authPage.style.display = 'flex';
    chatPage.style.display = 'none';
    chatList.innerHTML = '';
    messagesDiv.innerHTML = '';
});

// ==================== ЧАТЫ ====================

// ==================== ПОИСК ПОЛЬЗОВАТЕЛЕЙ ====================

const searchInput = document.getElementById('search-users');
const searchResults = document.getElementById('search-results');
let searchTimeout = null;

searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const query = searchInput.value.trim();
    
    if (!query || !query.startsWith('@')) {
        searchResults.classList.remove('show');
        return;
    }
    
    searchTimeout = setTimeout(async () => {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) return;
        
        const data = await res.json();
        renderSearchResults(data.users);
    }, 300);
});

function renderSearchResults(users) {
    searchResults.innerHTML = '';
    
    if (users.length === 0) {
        searchResults.innerHTML = '<div class="no-results">Пользователи не найдены</div>';
        searchResults.classList.add('show');
        return;
    }
    
    users.forEach(user => {
        const div = document.createElement('div');
        div.className = 'search-result-item';
        
        const usernameSpan = document.createElement('span');
        usernameSpan.className = 'username';
        usernameSpan.textContent = user.username;
        
        const actionsDiv = document.createElement('div');
        
        if (user.inChat) {
            const status = document.createElement('span');
            status.className = 'status in-chat';
            status.textContent = 'В чате';
            actionsDiv.appendChild(status);
        } else {
            const addBtn = document.createElement('button');
            addBtn.className = 'add-btn';
            addBtn.textContent = 'Добавить';
            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                addUserToCurrentChat(user.username);
            });
            actionsDiv.appendChild(addBtn);
        }
        
        div.appendChild(usernameSpan);
        div.appendChild(actionsDiv);
        searchResults.appendChild(div);
    });
    
    searchResults.classList.add('show');
}

// Закрыть результаты при клике вне
document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
        searchResults.classList.remove('show');
    }
});

// ==================== ДОБАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯ В ЧАТ ====================

async function addUserToCurrentChat(username) {
    if (!currentChatId) {
        alert('Сначала выберите чат, в который хотите добавить пользователя');
        return;
    }
    
    try {
        const res = await fetch(`/api/chats/${currentChatId}/members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ member: username })
        });
        
        const data = await res.json();
        if (data.success) {
            alert(`✅ ${username} добавлен в чат!`);
            searchResults.classList.remove('show');
            searchInput.value = '';
            await loadChats(); // Обновляем список чатов
        } else {
            alert(`❌ Ошибка: ${data.error}`);
        }
    } catch {
        alert('❌ Ошибка при добавлении пользователя');
    }
}

// ==================== ОБРАБОТКА WEBSOCKET СОБЫТИЙ ====================

// Добавьте в функцию connectSocket():
socket.on('user joined', (data) => {
    console.log(`👤 ${data.username} присоединился к чату`);
    // Обновляем список участников (можно добавить позже)
});

async function showChatPage() {
    authPage.style.display = 'none';
    chatPage.style.display = 'flex';
    currentUserSpan.textContent = currentUser;
    
    // Подключаем WebSocket
    connectSocket();
    
    // Загружаем чаты
    await loadChats();
}

function connectSocket() {
    if (socket) socket.disconnect();
    
    const token = document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1];
    
    socket = io({
        auth: { token }
    });
    
    socket.on('connect', () => {
        console.log('🔌 WebSocket подключён');
    });
    
    socket.on('chat message', (msg) => {
        renderMessage(msg, false);
    });
    
    socket.on('chat history', (messages) => {
        chatHistory = messages;
        messagesDiv.innerHTML = '';
        messages.forEach(msg => renderMessage(msg, false));
    });
    
    socket.on('disconnect', () => {
        console.log('🔌 WebSocket отключён');
    });
}

async function loadChats() {
    const res = await fetch('/api/chats');
    if (!res.ok) return;
    
    const chats = await res.json();
    renderChatList(chats);
}

function renderChatList(chats) {
    chatList.innerHTML = '';
    
    if (chats.length === 0) {
        chatList.innerHTML = '<div class="empty-state">📭 Нет чатов.<br>Создайте новый!</div>';
        return;
    }
    
    chats.forEach(chat => {
        const div = document.createElement('div');
        div.className = 'chat-item';
        if (chat.id === currentChatId) div.classList.add('active');
        
        div.innerHTML = `
            <div class="chat-item-name">${chat.name}</div>
            <div class="chat-item-members">👥 ${chat.members.length} участников</div>
        `;
        
        div.addEventListener('click', () => joinChat(chat.id, chat.name));
        chatList.appendChild(div);
    });
}

function joinChat(chatId, name) {
    currentChatId = chatId;
    chatName.textContent = name;
    
    // Обновляем активный чат в списке
    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
    const items = document.querySelectorAll('.chat-item');
    for (let i = 0; i < items.length; i++) {
        if (items[i].textContent.includes(name)) {
            items[i].classList.add('active');
            break;
        }
    }
    
    // Присоединяемся к чату через Socket
    if (socket) {
        socket.emit('join chat', chatId);
    }
    
    // Активируем ввод
    messageInput.disabled = false;
    sendBtn.disabled = false;
    messageInput.focus();
}

// Создание нового чата
newChatBtn.addEventListener('click', () => {
    modal.classList.add('show');
    newChatName.value = '';
    newChatName.focus();
});

modalCancelBtn.addEventListener('click', () => {
    modal.classList.remove('show');
});

createChatBtn.addEventListener('click', async () => {
    const name = newChatName.value.trim();
    if (!name) return;
    
    const res = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    });
    
    if (res.ok) {
        modal.classList.remove('show');
        await loadChats();
    } else {
        alert('Ошибка создания чата');
    }
});

// Закрыть модалку по клику вне
modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('show');
});

// Enter в поле создания чата
newChatName.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') createChatBtn.click();
});

// ==================== СООБЩЕНИЯ ====================

function renderMessage(msg, isOwn) {
    const div = document.createElement('div');
    div.className = `message ${isOwn ? 'message-own' : 'message-other'}`;
    
    const time = new Date(msg.timestamp).toLocaleTimeString();
    
    div.innerHTML = `
        <div>${msg.text}</div>
        <div class="message-info">${isOwn ? 'Вы' : msg.from} • ${time}</div>
    `;
    
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function sendMessage() {
    if (!currentChatId || !socket) return;
    
    const text = messageInput.value.trim();
    if (!text) return;
    
    // Отправляем на сервер
    socket.emit('chat message', { chatId: currentChatId, message: text });
    
    // Показываем у себя
    renderMessage({
        from: currentUser,
        text: text,
        timestamp: Date.now()
    }, true);
    
    messageInput.value = '';
}

// Отправка по Enter
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

sendBtn.addEventListener('click', sendMessage);

// ==================== ЗАПУСК ====================
checkAuth();
