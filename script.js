// ==================== АДРЕС СЕРВЕРА ====================
const SERVER_URL = 'https://messenger-4lye.onrender.com';

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
        const res = await fetch(SERVER_URL + '/api/me', { credentials: 'include' });
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
    
    const res = await fetch(SERVER_URL + '/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        credentials: 'include'
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
    
    const res = await fetch(SERVER_URL + '/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        credentials: 'include'
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
    await fetch(SERVER_URL + '/api/logout', { method: 'POST', credentials: 'include' });
    if (socket) socket.disconnect();
    currentUser = null;
    currentChatId = null;
    authPage.style.display = 'flex';
    chatPage.style.display = 'none';
    chatList.innerHTML = '';
    messagesDiv.innerHTML = '';
});

// ==================== ЧАТЫ ====================

async function showChatPage() {
    authPage.style.display = 'none';
    chatPage.style.display = 'flex';
    currentUserSpan.textContent = currentUser;
    
    connectSocket();
    await loadChats();
}

function connectSocket() {
    if (socket) socket.disconnect();
    
    const token = document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1];
    
    socket = io(SERVER_URL, {
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
    const res = await fetch(SERVER_URL + '/api/chats', { credentials: 'include' });
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
    
    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
    const items = document.querySelectorAll('.chat-item');
    for (let i = 0; i < items.length; i++) {
        if (items[i].textContent.includes(name)) {
            items[i].classList.add('active');
            break;
        }
    }
    
    if (socket) {
        socket.emit('join chat', chatId);
    }
    
    messageInput.disabled = false;
    sendBtn.disabled = false;
    messageInput.focus();
}

// ==================== СОЗДАНИЕ ЧАТА ====================

newChatBtn.addEventListener('click', () => {
    console.log('➕ Нажата кнопка создания чата');
    modal.classList.add('show');
    newChatName.value = '';
    newChatName.focus();
});

modalCancelBtn.addEventListener('click', () => {
    modal.classList.remove('show');
});

createChatBtn.addEventListener('click', async () => {
    const name = newChatName.value.trim();
    if (!name) {
        alert('Введите название чата');
        return;
    }
    
    console.log('📤 Создаю чат:', name);
    
    try {
        const res = await fetch(SERVER_URL + '/api/chats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
            credentials: 'include'
        });
        
        const data = await res.json();
        console.log('📨 Ответ сервера:', data);
        
        if (res.ok) {
            modal.classList.remove('show');
            await loadChats();
        } else {
            alert('❌ Ошибка: ' + (data.error || 'Неизвестная ошибка'));
        }
    } catch (err) {
        console.error('❌ Ошибка создания чата:', err);
        alert('❌ Ошибка подключения к серверу');
    }
});

modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('show');
});

newChatName.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') createChatBtn.click();
});

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
        const res = await fetch(SERVER_URL + `/api/users/search?q=${encodeURIComponent(query)}`, { credentials: 'include' });
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
        const res = await fetch(SERVER_URL + `/api/chats/${currentChatId}/members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ member: username }),
            credentials: 'include'
        });
        
        const data = await res.json();
        if (data.success) {
            alert(`✅ ${username} добавлен в чат!`);
            searchResults.classList.remove('show');
            searchInput.value = '';
            await loadChats();
        } else {
            alert(`❌ Ошибка: ${data.error}`);
        }
    } catch {
        alert('❌ Ошибка при добавлении пользователя');
    }
}

// ==================== СООБЩЕНИЯ ====================

function renderMessage(msg, isOwn) {
    const div = document.createElement('div');
    div.className = `message ${isOwn ? 'message-own' : 'message-other'}`;
    
    const time = new Date(msg.timestamp * 1000).toLocaleTimeString();
    const from = isOwn ? 'Вы' : (msg.username || msg.from || 'Неизвестный');
    
    div.innerHTML = `
        <div>${msg.text}</div>
        <div class="message-info">${from} • ${time}</div>
    `;
    
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function sendMessage() {
    if (!currentChatId || !socket) return;
    
    const text = messageInput.value.trim();
    if (!text) return;
    
    socket.emit('chat message', { chatId: currentChatId, message: text });
    messageInput.value = '';
}

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

sendBtn.addEventListener('click', sendMessage);

// ==================== WEBSOCKET СОБЫТИЯ ====================
// Добавляем обработчик для Socket.IO (добавьте в connectSocket)
// socket.on('user joined', (data) => {
//     console.log(`👤 ${data.username} присоединился к чату`);
// });

// ==================== ЗАПУСК ====================
checkAuth();
