const express = require('express');
const app = express();
const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

const server = http.createServer(app);
const io = new Server(server);

// --- CONFIGURACIÓN DE SEGURIDAD ---
const ADMIN_USER = "admin";
const ADMIN_PASS = "1234";

const auth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.setHeader('WWW-Authenticate', 'Basic');
        return res.status(401).send('Se requiere autenticación');
    }
    const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
    if (auth[0] === ADMIN_USER && auth[1] === ADMIN_PASS) {
        next();
    } else {
        res.status(401).send('Usuario o contraseña incorrectos');
    }
};

// --- RUTAS ---
app.get('/admin.html', auth, (req, res) => {
    res.sendFile(__dirname + '/public/admin.html');
});

app.use(express.static('public'));

// --- CONEXIÓN MONGODB ---
if(process.env.MONGO_URI) {
    mongoose.connect(process.env.MONGO_URI, { family: 4 })
        .then(async () => {
            console.log('🟢 CONECTADO A MONGODB');
            await inicializarDatosDePrueba();
        })
        .catch(err => console.log('🔴 ERROR MONGODB:', err));
}

// --- MODELOS ---
const Cliente = mongoose.model('Cliente', new mongoose.Schema({ usuarioCasino: String, saldo: Number, wager: Number, estado: String, historialChat: Array }));
const Retiro = mongoose.model('Retiro', new mongoose.Schema({ fecha: String, cliente: String, monto: Number, cbuAlias: String, titular: String, estado: String, procesadoPor: String }));
const UsuarioInterno = mongoose.model('UsuarioInterno', new mongoose.Schema({ nombre: String, usuario: String, email: String, rol: String, estado: String }));

// --- SOCKETS ---
let usuariosConectados = [];
let adminSocketId = null;
let usuarioSeleccionadoActivoAdmin = null;

io.on('connection', (socket) => {
    socket.on('identificar_admin', async () => {
        adminSocketId = socket.id;
        const clientesDB = await Cliente.find();
        socket.emit('cargar_datos_tablas', { clientes: clientesDB });
    });
    // ... resto de tu lógica de sockets aquí
});

async function inicializarDatosDePrueba() {
    if(await Cliente.countDocuments() === 0) {
        await new Cliente({ usuarioCasino: 'joniz115', saldo: 60000 }).save();
    }
}

const PUERTO = process.env.PUERTO || 3000;
server.listen(PUERTO, () => {
    console.log(`🚀 SERVIDOR EN PUERTO ${PUERTO}`);
});
