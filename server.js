const express = require('express');
const session = require('express-session');
const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- CONFIGURACIÓN DE SESIÓN (LOGIN) ---
app.use(session({
    secret: 'CasinoFenix2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 30 } // 30 minutos de sesión
}));

// --- MIDDLEWARE DE PROTECCIÓN ---
const requireLogin = (req, res, next) => {
    if (req.session.loggedIn) {
        next();
    } else {
        res.redirect('/login.html');
    }
};

// --- RUTAS DE LOGIN/LOGOUT ---
app.post('/login', express.urlencoded({ extended: true }), (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === '1234') {
        req.session.loggedIn = true;
        res.redirect('/admin.html');
    } else {
        res.send('Usuario o contraseña incorrectos. <a href="/login.html">Volver</a>');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login.html');
});

// --- RUTA PROTEGIDA ---
app.get('/admin.html', requireLogin, (req, res) => {
    res.sendFile(__dirname + '/public/admin.html');
});

// --- ARCHIVOS ESTÁTICOS ---
app.use(express.static('public'));

// --- CONEXIÓN MONGODB ---
if(process.env.MONGO_URI) {
    mongoose.connect(process.env.MONGO_URI, { family: 4 })
        .then(() => console.log('🟢 CONECTADO A MONGODB'))
        .catch(err => console.log('🔴 ERROR MONGODB:', err));
}

// --- MODELOS ---
const Cliente = mongoose.model('Cliente', new mongoose.Schema({ usuarioCasino: String, historialChat: Array }));

// --- SOCKETS ---
let usuariosConectados = [];
let adminSocketId = null;

io.on('connection', (socket) => {
    socket.on('identificar_admin', async () => {
        adminSocketId = socket.id;
        const clientesDB = await Cliente.find();
        socket.emit('cargar_datos_tablas', { clientes: clientesDB });
    });
    // ... resto de tu lógica de sockets
});

const PUERTO = process.env.PUERTO || 3000;
server.listen(PUERTO, () => {
    console.log(`🚀 SERVIDOR EN PUERTO ${PUERTO}`);
});
const PUERTO = process.env.PUERTO || 3000;
server.listen(PUERTO, () => {
    console.log(`🚀 SERVIDOR EN PUERTO ${PUERTO}`);
});
