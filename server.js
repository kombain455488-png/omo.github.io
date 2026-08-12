const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

const app = express();
const server = http.createServer(app);

// ==================== БАЗА ДАННЫХ ====================
const dbPath = path.join(__dirname, 'messenger.db');
console.log(`📁 Путь к базе данных: ${dbPath}`);

if (!fs.existsSync(dbPath)) {
    console.log('⚠️ База данных не найдена. Создаём новую...');
    fs.writeFileSync(dbPath, '');
}

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    console.log('🔄 Создаю таблицы...');
    
    // ============ ТАБЛИЦА USERS (с email) ============
    db.run(`CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        password_hash TEXT NOT NULL,
        email TEXT,
        reset_code TEXT,
        reset_code_expires INTEGER
    )`, (err) => {
        if (err) console.error('❌ Ошибка users:', err.message);
        else console.log('✅ Таблица users создана');
    });
    
    db.run(`CREATE TABLE IF NOT EXISTS chats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        creator TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )`, (err) => {
        if (err) console.error('❌ Ошибка chats:', err.message);
        else console.log('✅ Таблица chats создана');
    });
    
    db.run(`CREATE TABLE IF NOT EXISTS chat_members (
        chat_id INTEGER,
        username TEXT,
        PRIMARY KEY (chat_id, username),
        FOREIGN KEY (chat_id) REFERENCES chats(id),
        FOREIGN KEY (username) REFERENCES users(username)
    )`, (err) => {
        if (err) console.error('❌ Ошибка chat_members:', err.message);
        else console.log('✅ Таблица chat_members создана');
    });
    
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER,
        username TEXT,
        text TEXT NOT NULL,
        timestamp INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (chat_id) REFERENCES chats(id),
        FOREIGN KEY (username) REFERENCES users(username)
    )`, (err) => {
        if (err) console.error('❌ Ошибка messages:', err.message);
        else console.log('✅ Таблица messages создана');
    });
});

// ==================== НАСТРОЙКИ EXPRESS ====================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(__dirname));

// ==================== НАСТРОЙКИ CORS ====================
app.use((req, res, next) => {
    const allowedOrigins = [
        'http://localhost:3000',
        'https://kombain455488-png.github.io',
        'https://omo.github.io',
        'https://messenger-4lye.onrender.com'
    ];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// ==================== WEBSOCKET CORS ====================
const io = new Server(server, {
    cors: {
        origin: [
            'http://localhost:3000',
            'https://kombain455488-png.github.io',
            'https://omo.github.io',
            'https://messenger-4lye.onrender.com'
        ],
        methods: ['GET', 'POST'],
        credentials: true
    }
});

const JWT_SECRET = 'my-super-secret-key-change-it';

// ==================== НАСТРОЙКИ EMAIL ====================
// Для теста используем ethereal.email (бесплатный фейковый SMTP)
// Замените на реальные данные для отправки писем
const transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    auth: {
        user: 'your-ethereal-email@ethereal.email',
        pass: 'your-ethereal-password'
    }
});

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function getOneQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

// ==================== АУТЕНТИФИКАЦИЯ ====================

// РЕГИСТРАЦИЯ (с email)
app.post('/api/register', async (req, res) => {
    const { username, password, email } = req.body;
    
    console.log('📝 Попытка регистрации:', username, email);
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }
    
    try {
        const existing = await getOneQuery('SELECT username FROM users WHERE username = ?', [username]);
        if (existing) {
            return res.status(400).json({ error: 'Пользователь уже существует' });
        }
        
        const passwordHash = await bcrypt.hash(password, 10);
        
        await runQuery(
            'INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)',
            [username, passwordHash, email || null]
        );
        
        console.log('✅ Пользователь создан:', username);
        res.json({ success: true, message: 'Регистрация успешна' });
    } catch (err) {
        console.error('❌ Ошибка регистрации:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ВХОД
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    console.log('🔑 Попытка входа:', username);
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }
    
    try {
        const user = await getOneQuery('SELECT username, password_hash FROM users WHERE username = ?', [username]);
        if (!user) {
            return res.status(400).json({ error: 'Пользователь не найден' });
        }
        
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(400).json({ error: 'Неверный пароль' });
        }
        
        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
        
        res.cookie('token', token, {
            httpOnly: true,
            maxAge: 7 * 24 * 60 * 60 * 1000,
            secure: true,
            sameSite: 'none',
            path: '/'
        });
        
        res.json({ success: true, username, token });
    } catch (err) {
        console.error('❌ Ошибка входа:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ПРОВЕРКА АВТОРИЗАЦИИ
app.get('/api/me', (req, res) => {
    let token = req.cookies.token;
    if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.slice(7);
        }
    }
    
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        res.json({ username: decoded.username });
    } catch {
        res.status(401).json({ error: 'Не авторизован' });
    }
});

// ВЫХОД
app.post('/api/logout', (req, res) => {
    res.clearCookie('token', {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/'
    });
    res.json({ success: true });
});

// ==================== ВОССТАНОВЛЕНИЕ ПАРОЛЯ ====================

// ЗАПРОС ВОССТАНОВЛЕНИЯ (отправляем код на email)
app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ error: 'Email обязателен' });
    }
    
    try {
        const user = await getOneQuery('SELECT username FROM users WHERE email = ?', [email]);
        if (!user) {
            return res.status(404).json({ error: 'Пользователь с таким email не найден' });
        }
        
        // Генерируем 6-значный код
        const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 час
        
        await runQuery(
            'UPDATE users SET reset_code = ?, reset_code_expires = ? WHERE email = ?',
            [resetCode, expiresAt, email]
        );
        
        // Отправляем email
        const mailOptions = {
            from: 'noreply@messenger.com',
            to: email,
            subject: 'Восстановление пароля в Мессенджере',
            text: `Ваш код для восстановления пароля: ${resetCode}\nКод действителен 1 час.`
        };
        
        await transporter.sendMail(mailOptions);
        console.log(`📧 Код отправлен на ${email}: ${resetCode}`);
        
        res.json({ success: true, message: 'Код отправлен на email' });
    } catch (err) {
        console.error('❌ Ошибка восстановления:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ПРОВЕРКА КОДА И СМЕНА ПАРОЛЯ
app.post('/api/reset-password', async (req, res) => {
    const { email, code, newPassword } = req.body;
    
    if (!email || !code || !newPassword) {
        return res.status(400).json({ error: 'Все поля обязательны' });
    }
    
    try {
        const user = await getOneQuery(
            'SELECT username FROM users WHERE email = ? AND reset_code = ? AND reset_code_expires > ?',
            [email, code, Math.floor(Date.now() / 1000)]
        );
        
        if (!user) {
            return res.status(400).json({ error: 'Неверный код или код истёк' });
        }
        
        const passwordHash = await bcrypt.hash(newPassword, 10);
        await runQuery(
            'UPDATE users SET password_hash = ?, reset_code = NULL, reset_code_expires = NULL WHERE email = ?',
            [passwordHash, email]
        );
        
        console.log(`✅ Пароль обновлён для ${user.username}`);
        res.json({ success: true, message: 'Пароль успешно изменён' });
    } catch (err) {
        console.error('❌ Ошибка сброса пароля:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ==================== АДМИН-ПАНЕЛЬ ====================
app.get('/api/admin/users', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.username !== 'admin') {
            return res.status(403).json({ error: 'Доступ запрещён' });
        }
        
        const users = await getQuery('SELECT username, email FROM users ORDER BY username');
        const chats = await getQuery('SELECT id, name, creator FROM chats ORDER BY id DESC');
        const messages = await getQuery('SELECT COUNT(*) as total FROM messages');
        
        res.json({
            users: users,
            chats: chats,
            total_messages: messages[0]?.total || 0
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ==================== ЧАТЫ ====================

// ПОЛУЧИТЬ СПИСОК ЧАТОВ
app.get('/api/chats', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const username = decoded.username;
        
        const chats = await getQuery(`
            SELECT c.id, c.name, 
                   GROUP_CONCAT(cm.username) as members
            FROM chats c
            JOIN chat_members cm ON c.id = cm.chat_id
            WHERE c.id IN (
                SELECT chat_id FROM chat_members WHERE username = ?
            )
            GROUP BY c.id, c.name
        `, [username]);
        
        const result = chats.map(c => ({
            id: c.id,
            name: c.name,
            members: c.members ? c.members.split(',') : []
        }));
        
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// СОЗДАТЬ НОВЫЙ ЧАТ
app.post('/api/chats', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const username = decoded.username;
        const { name } = req.body;
        
        if (!name) return res.status(400).json({ error: 'Имя чата обязательно' });
        
        const result = await runQuery(
            'INSERT INTO chats (name, creator) VALUES (?, ?)',
            [name, username]
        );
        const chatId = result.lastID;
        
        await runQuery(
            'INSERT INTO chat_members (chat_id, username) VALUES (?, ?)',
            [chatId, username]
        );
        
        res.json({ success: true, chatId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ==================== ПОИСК ПОЛЬЗОВАТЕЛЕЙ ====================

app.get('/api/users/search', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const currentUser = decoded.username;
        const query = req.query.q || '';
        
        const searchTerm = query.startsWith('@') ? query.slice(1) : query;
        
        if (!searchTerm) {
            return res.json({ users: [] });
        }
        
        const users = await getQuery(
            `SELECT username FROM users 
             WHERE username != ? AND LOWER(username) LIKE LOWER(?) 
             LIMIT 20`,
            [currentUser, `%${searchTerm}%`]
        );
        
        const chatIds = await getQuery(
            'SELECT chat_id FROM chat_members WHERE username = ?',
            [currentUser]
        );
        const userChatIds = chatIds.map(c => c.chat_id);
        
        const results = await Promise.all(users.map(async (user) => {
            const inChat = await getOneQuery(
                `SELECT 1 FROM chat_members 
                 WHERE username = ? AND chat_id IN (${userChatIds.length ? userChatIds.join(',') : '0'})`,
                [user.username]
            );
            return {
                username: user.username,
                inChat: !!inChat
            };
        }));
        
        res.json({ users: results });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ДОБАВИТЬ ПОЛЬЗОВАТЕЛЯ В ЧАТ
app.post('/api/chats/:chatId/members', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Не авторизован' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const username = decoded.username;
        const chatId = parseInt(req.params.chatId);
        const { member } = req.body;
        
        const userExists = await getOneQuery('SELECT username FROM users WHERE username = ?', [member]);
        if (!userExists) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        const existing = await getOneQuery(
            'SELECT 1 FROM chat_members WHERE chat_id = ? AND username = ?',
            [chatId, member]
        );
        if (existing) {
            return res.status(400).json({ error: 'Пользователь уже в чате' });
        }
        
        const isMember = await getOneQuery(
            'SELECT 1 FROM chat_members WHERE chat_id = ? AND username = ?',
            [chatId, username]
        );
        if (!isMember) {
            return res.status(403).json({ error: 'Вы не участник этого чата' });
        }
        
        await runQuery(
            'INSERT INTO chat_members (chat_id, username) VALUES (?, ?)',
            [chatId, member]
        );
        
        io.to(`chat-${chatId}`).emit('user joined', { username: member });
        
        res.json({ success: true, message: 'Пользователь добавлен' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ==================== WEBSOCKET ====================

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    console.log('🔑 WebSocket токен:', token ? 'есть' : 'нет');
    
    if (!token) {
        return next(new Error('Не авторизован'));
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.username = decoded.username;
        console.log('✅ WebSocket авторизован:', socket.username);
        next();
    } catch (err) {
        console.error('❌ Ошибка WebSocket токена:', err);
        next(new Error('Не авторизован'));
    }
});

io.on('connection', (socket) => {
    const username = socket.username;
    console.log(`✅ ${username} подключился`);
    
    socket.on('join chat', async (chatId) => {
        try {
            const isMember = await getOneQuery(
                'SELECT 1 FROM chat_members WHERE chat_id = ? AND username = ?',
                [chatId, username]
            );
            if (!isMember) return;
            
            socket.join(`chat-${chatId}`);
            console.log(`📌 ${username} присоединился к чату ${chatId}`);
            
            const messages = await getQuery(
                'SELECT username, text, timestamp FROM messages WHERE chat_id = ? ORDER BY timestamp ASC LIMIT 100',
                [chatId]
            );
            socket.emit('chat history', messages);
        } catch (err) {
            console.error('Ошибка join chat:', err);
        }
    });
    
    socket.on('chat message', async ({ chatId, message }) => {
        try {
            const isMember = await getOneQuery(
                'SELECT 1 FROM chat_members WHERE chat_id = ? AND username = ?',
                [chatId, username]
            );
            if (!isMember) return;
            
            const msg = {
                username: username,
                text: message,
                timestamp: Math.floor(Date.now() / 1000)
            };
            
            await runQuery(
                'INSERT INTO messages (chat_id, username, text, timestamp) VALUES (?, ?, ?, ?)',
                [chatId, username, message, msg.timestamp]
            );
            
            io.to(`chat-${chatId}`).emit('chat message', msg);
        } catch (err) {
            console.error('Ошибка отправки сообщения:', err);
        }
    });
    
    socket.on('disconnect', () => {
        console.log(`❌ ${username} отключился`);
    });
});

// ==================== ЗАПУСК ====================

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    console.log(`✅ База данных: ${dbPath}`);
});
