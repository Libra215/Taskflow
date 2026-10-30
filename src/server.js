
require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');

const app = require('./app');
const routes = require('./routes');

const {
    startNotificationScheduler
} = require('./notifications');

const PORT = Number(process.env.PORT) || 3100;
const HOST = process.env.HOST || '127.0.0.1';

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: false
    }
});

// Integrasikan session Express agar Socket.IO mengenali
// pengguna yang sudah login.
const sessionMiddleware = app.get('sessionMiddleware');

if (!sessionMiddleware) {
    throw new Error(
        'Session middleware belum tersedia. Periksa konfigurasi src/app.js.'
    );
}

io.engine.use(sessionMiddleware);

// Inisialisasi fitur chat jika fungsi sudah ditambahkan
// pada src/routes.js.
if (typeof routes.initCommunityChat === 'function') {
    routes.initCommunityChat(io, sessionMiddleware);
}

server.listen(PORT, HOST, () => {
    console.log(`TaskFlow berjalan di http://${HOST}:${PORT}`);
    startNotificationScheduler();
});

server.on('error', error => {
    console.error('Server gagal dijalankan:', error.message);
    process.exitCode = 1;
});
