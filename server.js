const express = require('express');
const session = require('express-session');
const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- CONFIGURACIÓN ---
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'CasinoFenix2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 30 } // 30 minutos
}));

// --- MIDDLEWARE DE SEGURIDAD ---
const requireLogin = (req, res, next) => {
    if (req.session.loggedIn) {
        next();
    } else {
        res.redirect('/login.html');
    }
};

// --- RUTAS PROTEGIDAS ---
app.get('/admin.html', requireLogin, (req, res) => {
    res.sendFile(__dirname + '/public/admin.html');
});

// --- RUTAS PÚBLICAS ---
app.post('/login', (req, res) => {
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

app.use(express.static('public'));

// --- CONEXIÓN A MONGODB ---
if (process.env.MONGO_URI) {
    mongoose.connect(process.env.MONGO_URI, { family: 4 })
        .then(() => console.log('🟢 MONGODB CONECTADO'))
        .catch(err => console.error('🔴 ERROR MONGODB:', err));
}

// --- SOCKETS ---
io.on('connection', (socket) => {
    console.log('Cliente conectado');
    // ... aquí va el resto de tu lógica de sockets
});

const PUERTO = process.env.PORT || 3000;
server.listen(PUERTO, () => {
    console.log(`🚀 SERVIDOR EN PUERTO ${PUERTO}`);
});
