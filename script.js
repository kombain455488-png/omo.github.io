const socket = io('https://messenger-4lye.onrender.com');

socket.on('chat message', (msg) => {
    const messagesDiv = document.getElementById('messages');
    const messageElement = document.createElement('div');
    messageElement.textContent = msg;
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

function sendMessage() {
    const input = document.getElementById('messageInput');
    const msg = input.value.trim();
    
    if (msg) {
        socket.emit('chat message', msg);
        
        const messagesDiv = document.getElementById('messages');
        const messageElement = document.createElement('div');
        messageElement.textContent = 'Вы: ' + msg;
        messageElement.className = 'self';
        messagesDiv.appendChild(messageElement);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        
        input.value = '';
    }
}

document.getElementById('messageInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});
