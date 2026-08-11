const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: ['http://localhost:3000', 'https://kombain455488-png.github.io'],
        methods: ['GET', 'POST'],
        credentials: true
    }
});

// Секретный ключ для JWT
const JWT_SECRET = 'my-super-secret-key-change-it';

// Хранилище в памяти (для простоты)
const users = {}; // { username: { passwordHash, chats: [] } }
const chats = {}; // { chatId: { name, creator, members: [], messages: [] } }
let chatIdCounter = 1;

// Настройки Express
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(__dirname));

// ==================== АУТЕНТИФИКАЦИЯ ====================

// Регистрация
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }
    
    if (users[username]) {
        return res.status(400).json({ error: 'Пользователь уже существует' });
    }
    
    const passwordHash = await bcrypt.hash(password, 10);
    users[username] = { passwordHash, chats: [] };
    
    res.json({ success: true, message: 'Регистрация успешна' });
});

// Вход
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!users[username]) {
        return res.status(400).json({ error: 'Пользователь не найден' });
    }
    
    const valid = await bcrypt.compare(password, users[username].passwordHash);
    if (!valid) {
        return res.status(400).json({ error: 'Неверный пароль' });
    }
    
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ success: true, username });
});

// Проверка авторизации
app.get('/api/me', (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        res.json({ username: decoded.username });
    } catch {
        res.status(401).json({ error: 'Не авторизован' });
    }
});

// Выход
app.post('/api/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
});

// ==================== ЧАТЫ ====================

// Получить список чатов пользователя
app.get('/api/chats', (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const username = decoded.username;
        
        const userChats = users[username]?.chats || [];
        const chatList = userChats.map(id => ({
            id,
            name: chats[id]?.name || 'Без названия',
            members: chats[id]?.members || []
        }));
        
        res.json(chatList);
    } catch {
        res.status(401).json({ error: 'Не авторизован' });
    }
});

// Создать новый чат
app.post('/api/chats', (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const username = decoded.username;
        const { name } = req.body;
        
        if (!name) return res.status(400).json({ error: 'Имя чата обязательно' });
        
        const chatId = chatIdCounter++;
        chats[chatId] = {
            name,
            creator: username,
            members: [username],
            messages: []
        };
        
        users[username].chats.push(chatId);
        
        res.json({ success: true, chatId });
    } catch {
        res.status(401).json({ error: 'Не авторизован' });
    }
});

// ==================== WEBSOCKET ====================

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Не авторизован'));
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.username = decoded.username;
        next();
    } catch {
        next(new Error('Не авторизован'));
    }
});

io.on('connection', (socket) => {
    const username = socket.username;
    console.log(`✅ ${username} подключился`);
    
    // Присоединиться к чату
    socket.on('join chat', (chatId) => {
        const chat = chats[chatId];
        if (!chat) return;
        if (!chat.members.includes(username)) return;
        
        socket.join(`chat-${chatId}`);
        console.log(`📌 ${username} присоединился к чату ${chatId}`);
        
        // Отправить историю сообщений
        socket.emit('chat history', chat.messages);
    });
    
    // Отправить сообщение
    socket.on('chat message', ({ chatId, message }) => {
        const chat = chats[chatId];
        if (!chat) return;
        if (!chat.members.includes(username)) return;
        
        const msg = {
            from: username,
            text: message,
            timestamp: Date.now()
        };
        
        chat.messages.push(msg);
        io.to(`chat-${chatId}`).emit('chat message', msg);
    });
    
    socket.on('disconnect', () => {
        console.log(`❌ ${username} отключился`);
    });
});

// ==================== ЗАПУСК ====================

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    console.log(`👥 Пользователей: ${Object.keys(users).length}`);
    console.log(`💬 Чатов: ${Object.keys(chats).length}`);
});
