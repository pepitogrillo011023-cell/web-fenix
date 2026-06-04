require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const session = require('express-session'); 
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ==============================================================
// 📝 1. MODELOS DE DATOS
// ==============================================================
const Cliente = mongoose.model('Cliente', new mongoose.Schema({
    usuarioCasino: { type: String, required: true, unique: true },
    password: { type: String, default: '1234' },
    saldo: { type: Number, default: 0 },
    creditos: { type: Number, default: 0 },
    wager: { type: Number, default: 0 },
    estado: { type: String, default: 'Activo' },
    historialChat: { type: Array, default: [] },
    ultimaConexion: { type: Date, default: Date.now },
    ultimaRuleta: { type: Date, default: null },
    ultimaRaspa: { type: Date, default: null },
    ultimaTragamonedas: { type: Date, default: null },
    ultimaCarta: { type: Date, default: null },
    ultimaMoneda: { type: Date, default: null }
}));

const Ruleta = mongoose.model('Ruleta', new mongoose.Schema({ configuracion: Array }));
const Raspa = mongoose.model('Raspa', new mongoose.Schema({ configuracion: Array }));
const Tragamonedas = mongoose.model('Tragamonedas', new mongoose.Schema({ configuracion: Array }));
const Cartas = mongoose.model('Cartas', new mongoose.Schema({ configuracion: Array }));
const Moneda = mongoose.model('Moneda', new mongoose.Schema({ configuracion: Array }));

// Modelo Minigame para los costos de créditos
const Minigame = mongoose.model('Minigame', new mongoose.Schema({ 
    name: { type: String, unique: true }, 
    creditCost: { type: Number, default: 10 } 
}));

const PanelConfig = mongoose.model('PanelConfig', new mongoose.Schema({
    identificador: { type: String, default: 'global', unique: true },
    retencion: { type: Array, default: [] },
    apis: { type: Object, default: {} },
    push: { type: Object, default: {} },
    billetera: { type: Object, default: {} }
}));

const CierreCaja = mongoose.model('CierreCaja', new mongoose.Schema({
    fecha: String, hora: String, inicio: String, fin: String, turno: String, cajero: String,
    ingreso: Number, saldoOro: Number, saldoGanamos: Number, egreso: Number,
    montoEsperado: Number, montoRealFinal: Number, sobranteFaltante: Number, reserva: Number,
    gastos: Array, propinas: Array
}));

const Retiro = mongoose.model('Retiro', new mongoose.Schema({
    fecha: { type: String, default: () => new Date().toLocaleString('es-AR') },
    cliente: String, monto: Number, cbuAlias: String, titular: String,
    estado: { type: String, default: 'Aprobado (Enviado)' },
    procesadoPor: { type: String, default: 'Lambda (Automático)' }
}));

const UsuarioInterno = mongoose.model('UsuarioInterno', new mongoose.Schema({
    nombre: String, usuario: String, email: String, rol: String, estado: { type: String, default: 'Activo' }
}));

// ==============================================================
// 🟢 2. CONEXIÓN A MONGODB
// ==============================================================
if(process.env.MONGO_URI && process.env.MONGO_URI !== 'AQUI_VA_TU_ENLACE_DE_MONGODB') {
    mongoose.connect(process.env.MONGO_URI, { family: 4 })
        .then(async () => {
            console.log('🟢 CONECTADO A MONGODB');
            await inicializarDatosDePrueba();
        })
        .catch(err => console.log('🔴 ERROR DE MONGODB:', err));
}

// ==============================================================
// ⚙️ 3. MIDDLEWARES Y ARCHIVOS ESTÁTICOS
// ==============================================================
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); 
app.use(session({
    secret: 'CasinoFenix2026_Seguro',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 } 
}));

const requireLogin = (req, res, next) => {
    if (req.session.loggedIn) { next(); } else { res.redirect('/login.html'); }
};

// ==============================================================
// 🔐 4. RUTAS DE ACCESO (LOGIN / LOGOUT)
// ==============================================================
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

app.get('/admin.html', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ==============================================================
// 📦 5. MEMORIA COMPARTIDA (SHARED STATE)
// ==============================================================
const sharedState = {
    usuariosConectados: [],
    adminSocketId: null,
    usuarioSeleccionadoActivoAdmin: null
};

// ==============================================================
// 💳 6. BILLETERA WEBHOOK
// ==============================================================
app.post('/api/webhook/billetera', async (req, res) => {
    res.status(200).send("OK");
    try {
        const accion = req.body?.action; const tipo = req.body?.type; const paymentId = req.body?.data?.id;
        if ((accion === 'payment.created' || tipo === 'payment') && paymentId) {
            const configDb = await PanelConfig.findOne({ identificador: 'global' });
            const accessTokenMP = configDb?.apis?.pass; 
            if (!accessTokenMP) return;

            const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                method: 'GET', headers: { 'Authorization': `Bearer ${accessTokenMP}` }
            });
            const dataMP = await mpResponse.json();

            if (dataMP.status === 'approved') {
                const montoTransferido = dataMP.transaction_amount;
                const saldoFormateado = `$${Number(montoTransferido).toLocaleString('es-AR')} ARS`;

                let datosBilleteraActuales = configDb.billetera || {};
                datosBilleteraActuales.monto = saldoFormateado;
                await PanelConfig.updateOne({ identificador: 'global' }, { $set: { billetera: datosBilleteraActuales } });

                if (sharedState.adminSocketId) {
                    io.to(sharedState.adminSocketId).emit('billetera_actualizada_en_vivo', {
                        saldoFormateado: saldoFormateado, montoTransferido: montoTransferido, tipoMovimiento: 'ingreso'
                    });
                }
            }
        }
    } catch (error) { console.error("🔴 Error procesando Webhook:", error); }
});

app.post('/api/simular-pago-test', requireLogin, (req, res) => {
    if (sharedState.adminSocketId) {
        io.to(sharedState.adminSocketId).emit('billetera_actualizada_en_vivo', {
            saldoFormateado: "$500,00 ARS (Simulado)", montoTransferido: 500, tipoMovimiento: 'ingreso'
        });
        res.json({ exito: true });
    } else {
        res.status(500).json({ exito: false, mensaje: 'No hay administrador conectado.' });
    }
});

// ==============================================================
// 🚀 7. IMPORTACIÓN DE RUTAS MODULARES
// ==============================================================
// PASAMOS IO Y SHAREDSTATE A TODOS
require('./routes/finanzas')(app, requireLogin, io, sharedState);
require('./routes/clientes')(app, requireLogin, io, sharedState);
require('./routes/eventos')(app, requireLogin, io, sharedState);

// ==============================================================
// 🔌 8. COMUNICACIÓN EN VIVO (SOCKETS)
// ==============================================================
io.on('connection', (socket) => {
    
    socket.on('identificar_admin', async () => {
        sharedState.adminSocketId = socket.id;
        socket.emit('lista_usuarios_actualizada', sharedState.usuariosConectados);
        
        try {
            const clientesDB = await Cliente.find();
            const retirosDB = await Retiro.find();
            const internosDB = await UsuarioInterno.find();
            const panelConfigDB = await PanelConfig.findOne({ identificador: 'global' }); 
            
            const ruletaDB = await Ruleta.findOne();
            const raspaDB = await Raspa.findOne(); 
            const tragaDB = await Tragamonedas.findOne();
            const cartasDB = await Cartas.findOne();
            const monedaDB = await Moneda.findOne();
            
            socket.emit('cargar_datos_tablas', {
                clientes: clientesDB,
                retiros: retirosDB,
                usuariosInternos: internosDB,
                ruleta: ruletaDB ? ruletaDB.configuracion : [],
                raspa: raspaDB ? raspaDB.configuracion : [],
                tragamonedas: tragaDB ? tragaDB.configuracion : [],
                cartas: cartasDB ? cartasDB.configuracion : [],
                moneda: monedaDB ? monedaDB.configuracion : [],
                panelConfig: panelConfigDB 
            });
        } catch (e) { console.log(e); }
    });

    socket.on('admin_cambio_chat_activo', async (datos) => {
        sharedState.usuarioSeleccionadoActivoAdmin = datos.usuario;
        if (sharedState.usuarioSeleccionadoActivoAdmin) {
            let usuario = sharedState.usuariosConectados.find(u => u.nombre === sharedState.usuarioSeleccionadoActivoAdmin);
            if (usuario) {
                usuario.historial.forEach(h => { if (h.emisor === 'cliente') h.leido = true; });
                await Cliente.updateOne({ usuarioCasino: usuario.nombre }, { historialChat: usuario.historial });
                if (usuario.id) io.to(usuario.id).emit('tus_mensajes_fueron_leidos');
            }
        }
        if (sharedState.adminSocketId) io.to(sharedState.adminSocketId).emit('lista_usuarios_actualizada', sharedState.usuariosConectados);
    });

    socket.on('identificar_usuario', async (datos) => {
        socket.username = datos.usuario;
        let clienteDB = await Cliente.findOne({ usuarioCasino: datos.usuario });
        
        if (!clienteDB) {
            clienteDB = new Cliente({
                usuarioCasino: datos.usuario,
                historialChat: [{ emisor: 'bot', mensaje: 'Volviste al menú principal. ¿En qué te podemos ayudar?', leido: true }]
            });
            await clienteDB.save();
        }

        let usuarioExistente = sharedState.usuariosConectados.find(u => u.nombre === datos.usuario);
        if (!usuarioExistente) {
            sharedState.usuariosConectados.push({ id: socket.id, nombre: datos.usuario, estado: 'Menú', historial: clienteDB.historialChat });
        } else {
            usuarioExistente.id = socket.id; 
            usuarioExistente.historial = clienteDB.historialChat; 
        }
        
        socket.emit('resultado_validacion', { 
            exito: true, 
            usuario: datos.usuario, 
            historial: clienteDB.historialChat,
            creditos: clienteDB.creditos || 0 // Enviamos los créditos al login
        });
        
        if (sharedState.adminSocketId) {
            io.to(sharedState.adminSocketId).emit('lista_usuarios_actualizada', sharedState.usuariosConectados);
            const clientesDB = await Cliente.find();
            io.to(sharedState.adminSocketId).emit('cargar_datos_tablas', { clientes: clientesDB });
        }
    });

    socket.on('cliente_accion', async (datos) => {
        let usuario = sharedState.usuariosConectados.find(u => u.nombre === socket.username);
        if (usuario) {
            usuario.estado = datos.estado;
            let estaMirandome = (sharedState.usuarioSeleccionadoActivoAdmin === usuario.nombre);

            if (datos.mensajeCliente) { usuario.historial.push({ emisor: 'cliente', mensaje: datos.mensajeCliente, leido: estaMirandome }); }
            if (datos.mensajeBot) { usuario.historial.push({ emisor: 'bot', mensaje: datos.mensajeBot, leido: true }); }

            await Cliente.updateOne({ usuarioCasino: usuario.nombre }, { historialChat: usuario.historial, estado: datos.estado });

            if (sharedState.adminSocketId) {
                io.to(sharedState.adminSocketId).emit('lista_usuarios_actualizada', sharedState.usuariosConectados);
                io.to(sharedState.adminSocketId).emit('actualizar_chat_activo', { nombre: usuario.nombre, historial: usuario.historial });
            }
            if (estaMirandome) socket.emit('tus_mensajes_fueron_leidos');
        }
    });

    socket.on('cliente_envia_mensaje_libre', async (datos) => {
        let usuario = sharedState.usuariosConectados.find(u => u.nombre === socket.username);
        if (usuario) {
            let estaMirandome = (sharedState.usuarioSeleccionadoActivoAdmin === usuario.nombre);
            usuario.historial.push({ emisor: 'cliente', mensaje: datos.mensaje, leido: estaMirandome });

            await Cliente.updateOne({ usuarioCasino: usuario.nombre }, { historialChat: usuario.historial });

            if (sharedState.adminSocketId) {
                io.to(sharedState.adminSocketId).emit('lista_usuarios_actualizada', sharedState.usuariosConectados);
                io.to(sharedState.adminSocketId).emit('actualizar_chat_activo', { nombre: usuario.nombre, historial: usuario.historial });
            }
            if (estaMirandome) socket.emit('tus_mensajes_fueron_leidos');
        }
    });

    socket.on('admin_envia_mensaje', async (datos) => {
        let usuario = sharedState.usuariosConectados.find(u => u.nombre === datos.paraUsuario);
        if (usuario) {
            usuario.historial.push({ emisor: 'admin', mensaje: datos.mensaje, leido: true });
            await Cliente.updateOne({ usuarioCasino: usuario.nombre }, { historialChat: usuario.historial });
            if(usuario.id) io.to(usuario.id).emit('recibir_mensaje_admin', { mensaje: datos.mensaje });
            socket.emit('actualizar_chat_activo', { nombre: usuario.nombre, historial: usuario.historial });
        }
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            let usuario = sharedState.usuariosConectados.find(u => u.nombre === socket.username);
            if (usuario) { usuario.id = null; }
            if (sharedState.usuarioSeleccionadoActivoAdmin === socket.username) sharedState.usuarioSeleccionadoActivoAdmin = null;
            if (sharedState.adminSocketId) io.to(sharedState.adminSocketId).emit('lista_usuarios_actualizada', sharedState.usuariosConectados);
        }
    });
});

// ==============================================================
// 🛠️ INICIALIZADOR DE DATOS
// ==============================================================
async function inicializarDatosDePrueba() {
    const juegos = ['Ruleta', 'Raspa', 'Tragamonedas', 'Cartas', 'Moneda'];
    for (let nombre of juegos) {
        const existe = await Minigame.findOne({ name: nombre });
        if (!existe) await new Minigame({ name: nombre, creditCost: 10 }).save();
    }
    // ... resto de tu inicialización original (Ruleta, Raspa, etc) ...
    const countCl = await Cliente.countDocuments();
    if(countCl === 0) { await new Cliente({ usuarioCasino: 'joniz115', saldo: 60000, wager: 10000, estado: 'Activo' }).save(); }
    
    // Aquí puedes incluir la inicialización de configuraciones de Ruleta, etc. que ya tenías
}

const PUERTO = process.env.PORT || 3000;
server.listen(PUERTO, () => {
    console.log('=============================================');
    console.log(`🚀 SERVIDOR VINCULADO AL PANEL EN PUERTO ${PUERTO}`);
    console.log('=============================================');
});
