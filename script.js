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
const searchInput = document.getElementById('search-users');
const searchResults = document.getElementById('search-results');

// ==================== АУТЕНТИФИКАЦИЯ ====================

// Проверка авторизации (из localStorage)
async function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
        const res = await fetch(SERVER_URL + '/api/me', {
            headers: { 'Authorization': 'Bearer ' + token },
            credentials: 'include'
        });
        if (res.ok) {
            const data = await res.json();
            currentUser = data.username;
            showChatPage();
        } else {
            localStorage.removeItem('token');
        }
    } catch (err) {
        console.error('❌ Ошибка checkAuth:', err);
    }
}

// РЕГИСТРАЦИЯ (с email)
document.getElementById('register-btn').addEventListener('click', async () => {
    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;
    const email = document.getElementById('register-email').value;
    
    if (!username || !password) {
        showAuthError('Заполните логин и пароль');
        return;
    }
    
    if (email && !email.includes('@')) {
        showAuthError('Введите корректный email');
        return;
    }
    
    try {
        const res = await fetch(SERVER_URL + '/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, email }),
            credentials: 'include'
        });
        
        const data = await res.json();
        if (data.success) {
            showLoginForm();
            showAuthError('✅ Регистрация успешна! Теперь войдите.');
        } else {
            showAuthError('❌ ' + (data.error || 'Ошибка регистрации'));
        }
    } catch (err) {
        console.error('❌ Ошибка регистрации:', err);
        showAuthError('❌ Ошибка подключения к серверу');
    }
});

// ВХОД (сохраняем токен в localStorage)
document.getElementById('login-btn').addEventListener('click', async () => {
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    
    if (!username || !password) {
        showAuthError('Заполните все поля');
        return;
    }
    
    console.log('📤 Отправка запроса на вход для:', username);
    
    try {
        const res = await fetch(SERVER_URL + '/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
            credentials: 'include'
        });
        
        const data = await res.json();
        console.log('📦 Данные ответа:', data);
        
        if (data.success && data.token) {
            // СОХРАНЯЕМ ТОКЕН В localStorage
            localStorage.setItem('token', data.token);
            console.log('✅ Токен сохранён в localStorage');
            
            currentUser = data.username;
            showChatPage();
        } else {
            showAuthError('❌ ' + (data.error || 'Ошибка входа'));
        }
    } catch (err) {
        console.error('❌ Ошибка при входе:', err);
        showAuthError('❌ Ошибка подключения к серверу');
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
    localStorage.removeItem('token');
    if (socket) socket.disconnect();
    currentUser = null;
    currentChatId = null;
    authPage.style.display = 'flex';
    chatPage.style.display = 'none';
    chatList.innerHTML = '';
    messagesDiv.innerHTML = '';
});

// ==================== WEBSOCKET ====================

function connectSocket() {
    if (socket) socket.disconnect();
    
    const token = localStorage.getItem('token');
    console.log('🔑 Токен для WebSocket:', token ? 'есть' : 'нет');
    
    if (!token) {
        console.error('❌ Токен не найден в localStorage');
        return;
    }
    
    socket = io(SERVER_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
        withCredentials: true
    });
    
    socket.on('connect', () => {
        console.log('🔌 WebSocket подключён');
    });
    
    socket.on('connect_error', (error) => {
        console.error('❌ Ошибка WebSocket:', error);
    });
    
    socket.on('chat message', (msg) => {
    console.log('📩 Получено сообщение:', msg);
    // Показываем все сообщения, которые пришли от сервера
    renderMessage(msg, msg.username === currentUser);
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

async function showChatPage() {
    authPage.style.display = 'none';
    chatPage.style.display = 'flex';
    currentUserSpan.textContent = currentUser;
    connectSocket();
    await loadChats();
}

async function loadChats() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(SERVER_URL + '/api/chats', {
            headers: { 'Authorization': 'Bearer ' + token },
            credentials: 'include'
        });
        if (!res.ok) {
            console.error('❌ Ошибка загрузки чатов:', res.status);
            return;
        }
        
        const chats = await res.json();
        renderChatList(chats);
    } catch (err) {
        console.error('❌ Ошибка loadChats:', err);
    }
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
        const token = localStorage.getItem('token');
        const res = await fetch(SERVER_URL + '/api/chats', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
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

let searchTimeout = null;

searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const query = searchInput.value.trim();
    
    if (!query || !query.startsWith('@')) {
        searchResults.classList.remove('show');
        return;
    }
    
    searchTimeout = setTimeout(async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(SERVER_URL + `/api/users/search?q=${encodeURIComponent(query)}`, {
                headers: { 'Authorization': 'Bearer ' + token },
                credentials: 'include'
            });
            if (!res.ok) return;
            
            const data = await res.json();
            renderSearchResults(data.users);
        } catch (err) {
            console.error('❌ Ошибка поиска:', err);
        }
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
        const token = localStorage.getItem('token');
        const res = await fetch(SERVER_URL + `/api/chats/${currentChatId}/members`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
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
    } catch (err) {
        console.error('❌ Ошибка добавления пользователя:', err);
        alert('❌ Ошибка подключения к серверу');
    }
}

// ==================== СООБЩЕНИЯ ====================

function renderMessage(msg, isOwn) {
    console.log('📩 Рендер сообщения:', msg, 'isOwn:', isOwn);
    
    const div = document.createElement('div');
    div.className = `message ${isOwn ? 'message-own' : 'message-other'}`;
    
    const from = isOwn ? 'Вы' : (msg.username || msg.from || 'Неизвестный');
    
    let time = 'только что';
    if (msg.timestamp) {
        const date = new Date(msg.timestamp * 1000);
        if (!isNaN(date.getTime())) {
            time = date.toLocaleTimeString();
        }
    }
    
    div.innerHTML = `
        <div><strong>${from}</strong>: ${msg.text}</div>
        <div class="message-info">${time}</div>
    `;
    
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function sendMessage() {
    if (!currentChatId || !socket) {
        console.warn('⚠️ Нет чата или сокета');
        return;
    }
    
    const text = messageInput.value.trim();
    if (!text) return;
    
    console.log('📤 Отправляю сообщение в чат', currentChatId, ':', text);
    
    // Отправляем на сервер — сервер сам разошлёт всем
    socket.emit('chat message', { chatId: currentChatId, message: text });
    
    // НЕ рендерим здесь — ждём ответ от сервера
    messageInput.value = '';
}

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

sendBtn.addEventListener('click', sendMessage);

// ==================== ВОССТАНОВЛЕНИЕ ПАРОЛЯ ====================

const resetForm = document.getElementById('reset-form');
const resetEmail = document.getElementById('reset-email');
const resetCode = document.getElementById('reset-code');
const resetNewPassword = document.getElementById('reset-new-password');
const resetSendCodeBtn = document.getElementById('reset-send-code-btn');
const resetConfirmBtn = document.getElementById('reset-confirm-btn');
const resetBackToLogin = document.getElementById('reset-back-to-login');
const resetError = document.getElementById('reset-error');
const resetStep1 = document.getElementById('reset-step-1');
const resetStep2 = document.getElementById('reset-step-2');

// Показать форму восстановления
if (document.getElementById('show-reset')) {
    document.getElementById('show-reset').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('login-form').style.display = 'none';
        resetForm.style.display = 'block';
        resetStep1.style.display = 'block';
        resetStep2.style.display = 'none';
        resetError.textContent = '';
    });
}

resetBackToLogin.addEventListener('click', (e) => {
    e.preventDefault();
    resetForm.style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
    resetError.textContent = '';
});

resetSendCodeBtn.addEventListener('click', async () => {
    const email = resetEmail.value.trim();
    if (!email) {
        resetError.textContent = 'Введите email';
        return;
    }
    
    try {
        const res = await fetch(SERVER_URL + '/api/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        
        const data = await res.json();
        if (data.success) {
            resetStep1.style.display = 'none';
            resetStep2.style.display = 'block';
            resetError.textContent = '✅ Код отправлен на ваш email';
        } else {
            resetError.textContent = '❌ ' + (data.error || 'Ошибка');
        }
    } catch {
        resetError.textContent = '❌ Ошибка подключения к серверу';
    }
});

resetConfirmBtn.addEventListener('click', async () => {
    const email = resetEmail.value.trim();
    const code = resetCode.value.trim();
    const newPassword = resetNewPassword.value.trim();
    
    if (!code || !newPassword) {
        resetError.textContent = 'Заполните все поля';
        return;
    }
    
    try {
        const res = await fetch(SERVER_URL + '/api/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, code, newPassword })
        });
        
        const data = await res.json();
        if (data.success) {
            resetError.textContent = '✅ Пароль изменён! Войдите с новым паролем.';
            resetStep2.style.display = 'none';
            resetForm.style.display = 'none';
            document.getElementById('login-form').style.display = 'block';
        } else {
            resetError.textContent = '❌ ' + (data.error || 'Ошибка');
        }
    } catch {
        resetError.textContent = '❌ Ошибка подключения к серверу';
    }
});

// ==================== ЗАПУСК ====================
console.log('🚀 Запуск мессенджера...');


// ==================== ВЕРИФИКАЦИЯ EMAIL ====================

const verifySection = document.getElementById('verify-section');
const verifyCode = document.getElementById('verify-code');
const verifyBtn = document.getElementById('verify-btn');
const resendCodeBtn = document.getElementById('resend-code-btn');
let pendingUsername = null;

// После успешной регистрации показываем поле для кода
document.getElementById('register-btn').addEventListener('click', async () => {
    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;
    const email = document.getElementById('register-email').value;
    
    if (!username || !password || !email) {
        showAuthError('Заполните все поля');
        return;
    }
    
    if (!email.includes('@')) {
        showAuthError('Введите корректный email');
        return;
    }
    
    try {
        const res = await fetch(SERVER_URL + '/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, email }),
            credentials: 'include'
        });
        
        const data = await res.json();
        if (data.success) {
            pendingUsername = username;
            verifySection.style.display = 'block';
            showAuthError('✅ Код отправлен на почту! Введите его для подтверждения.');
            document.getElementById('register-btn').disabled = true;
        } else {
            showAuthError('❌ ' + (data.error || 'Ошибка регистрации'));
        }
    } catch (err) {
        console.error('❌ Ошибка регистрации:', err);
        showAuthError('❌ Ошибка подключения к серверу');
    }
});

// Подтверждение email
verifyBtn.addEventListener('click', async () => {
    const code = verifyCode.value.trim();
    if (!code || !pendingUsername) {
        showAuthError('Введите код');
        return;
    }
    
    try {
        const res = await fetch(SERVER_URL + '/api/verify-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: pendingUsername, code }),
            credentials: 'include'
        });
        
        const data = await res.json();
        if (data.success) {
            showAuthError('✅ Email подтверждён! Теперь войдите.');
            verifySection.style.display = 'none';
            document.getElementById('register-btn').disabled = false;
            showLoginForm();
        } else {
            showAuthError('❌ ' + (data.error || 'Ошибка подтверждения'));
        }
    } catch {
        showAuthError('❌ Ошибка подключения к серверу');
    }
});

// Повторная отправка кода
resendCodeBtn.addEventListener('click', async () => {
    if (!pendingUsername) return;
    
    try {
        const res = await fetch(SERVER_URL + '/api/resend-verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: pendingUsername }),
            credentials: 'include'
        });
        
        const data = await res.json();
        if (data.success) {
            showAuthError('✅ Новый код отправлен на почту!');
        } else {
            showAuthError('❌ ' + (data.error || 'Ошибка'));
        }
    } catch {
        showAuthError('❌ Ошибка подключения к серверу');
    }
});

checkAuth();
