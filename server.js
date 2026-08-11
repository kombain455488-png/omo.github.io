const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

app.use(express.static(__dirname));

io.on('connection', (socket) => {
    console.log('✅ Пользователь подключился');
    
    socket.on('chat message', (msg) => {
        console.log('📩 Сообщение:', msg);
        io.emit('chat message', msg);
    });
    
    socket.on('disconnect', () => {
        console.log('❌ Пользователь отключился');
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log( Сервер запущен на http://localhost:);
});
