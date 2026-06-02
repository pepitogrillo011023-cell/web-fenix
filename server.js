require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const session = require('express-session'); // Nueva dependencia

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- CONFIGURACIÓN DE SESIÓN (LOGIN) ---
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'CasinoFenix2026_Seguro',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 } // Sesión por 1 hora
}));

// --- MIDDLEWARE DE PROTECCIÓN ---
const requireLogin = (req, res, next) => {
    if (req.session.loggedIn) {
        next();
    } else {
        res.redirect('/login.html');
    }
};

// --- RUTAS DE LOGIN Y LOGOUT ---
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    // Usuario y contraseña de acceso al panel
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

// --- RUTA PROTEGIDA PARA ADMIN ---
app.get('/admin.html', requireLogin, (req, res) => {
    res.sendFile(__dirname + '/public/admin.html');
});

app.use(express.static('public'));

// --------------------------------------------------------
// 🟢 CONEXIÓN A MONGODB
// --------------------------------------------------------
if(process.env.MONGO_URI && process.env.MONGO_URI !== 'AQUI_VA_TU_ENLACE_DE_MONGODB') {
    mongoose.connect(process.env.MONGO_URI, { family: 4 })
        .then(async () => {
            console.log('🟢 CONECTADO A MONGODB');
            await inicializarDatosDePrueba();
        })
        .catch(err => console.log('🔴 ERROR DE MONGODB:', err));
}

// --------------------------------------------------------
// 📝 MODELOS Y LÓGICA DE SOCKETS (Tu código original)
// --------------------------------------------------------
const Cliente = mongoose.model('Cliente', new mongoose.Schema({ 
    usuarioCasino: String, saldo: Number, wager: Number, estado: String, historialChat: Array 
}));
const Retiro = mongoose.model('Retiro', new mongoose.Schema({ 
    fecha: String, cliente: String, monto: Number, cbuAlias: String, titular: String, estado: String, procesadoPor: String 
}));
const UsuarioInterno = mongoose.model('UsuarioInterno', new mongoose.Schema({ 
    nombre: String, usuario: String, email: String, rol: String, estado: String 
}));

let usuariosConectados = []; 
let adminSocketId = null;
let usuarioSeleccionadoActivoAdmin = null;

io.on('connection', (socket) => {
    socket.on('identificar_admin', async () => {
        adminSocketId = socket.id;
        const clientesDB = await Cliente.find();
        socket.emit('cargar_datos_tablas', { clientes: clientesDB });
    });
    
    // ... (El resto de tu lógica de sockets se mantiene igual)
    // socket.on('identificar_usuario', ... y lo demás sigue abajo
});

// (Aquí va tu función inicializarDatosDePrueba y server.listen que ya tenías)
async function inicializarDatosDePrueba() { /* Tu lógica de siembra */ }

const PUERTO = process.env.PORT || 3000;
server.listen(PUERTO, () => {
    console.log(`🚀 SERVIDOR EN PUERTO ${PUERTO}`);
});
