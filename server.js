require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const session = require('express-session'); 
const path = require('path');

// Importar modelos
const Minigame = require('./models/Minigame');
const User = require('./models/User');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ==============================================================
// 1. MODELOS DE DATOS
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

const PanelConfig = mongoose.model('PanelConfig', new mongoose.Schema({
    identificador: { type: String, default: 'global', unique: true },
    retencion: { type: Array, default: [] },
    apis: { type: Object, default: {} },
    push: { type: Object, default: {} },
    billetera: { type: Object, default: {} },
    tienda: { type: Array, default: [] }
}));

const CierreCaja = mongoose.model('CierreCaja', new mongoose.Schema({
    fecha: String, hora: String, inicio: String, fin: String, turno: String, cajero: String,
    fechaInicio: String, fechaFin: String, horaInicio: String, horaFin: String,
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
// 2. CONEXIÓN A MONGODB
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
// 3. MIDDLEWARES, SESIÓN Y SEGURIDAD
// ==============================================================
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); 
app.use(session({
    secret: 'CasinoFenix2026_Seguro',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

const requireLogin = (req, res, next) => {
    if (req.session.loggedIn) { next(); } else { res.redirect('/login.html'); }
};

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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

app.use(express.static(path.join(__dirname, 'public')));

// ==============================================================
// 4. MEMORIA COMPARTIDA Y WEBHOOKS
// ==============================================================
const sharedState = {
    usuariosConectados: [],
    adminSocketId: null,
    usuarioSeleccionadoActivoAdmin: null
};

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

// --- RUTA PARA OBTENER TIENDA ---
app.get('/api/tienda', async (req, res) => {
    try {
        const config = await PanelConfig.findOne({ identificador: 'global' });
        res.json(config.tienda && config.tienda.length > 0 ? config.tienda : [
            { nombre: 'Bono 10%', costo: 500 },
            { nombre: '10 Tiradas', costo: 1000 },
            { nombre: 'Bono 20%', costo: 2000 },
            { nombre: 'Bono 50%', costo: 5000 }
        ]);
    } catch (e) { res.status(500).json([]); }
});

// --- RUTA PARA GUARDAR TIENDA DESDE ADMIN ---
app.post('/api/admin/actualizar-tienda', requireLogin, async (req, res) => {
    try {
        const { productos } = req.body; 
        await PanelConfig.updateOne({ identificador: 'global' }, { $set: { tienda: productos } }, { upsert: true });
        res.json({ exito: true, mensaje: "Tienda actualizada" });
    } catch (e) { res.status(500).json({ exito: false }); }
});

// --- RUTAS FALTANTES AGREGADAS (CONFIGURACIONES Y CIERRES) ---
app.post(['/api/guardar-config', '/api/configuracion'], requireLogin, async (req, res) => {
    try {
        // Captura el tipo de config (apis, billetera, push, retencion)
        const tipo = req.body.tipo || req.body.seccion; 
        const datos = req.body.datos || req.body.configuracion || req.body;
        
        if (!tipo) return res.status(400).json({ exito: false, mensaje: "Falta el tipo de configuración" });
        
        let updateQuery = {};
        updateQuery[tipo] = datos;
        
        await PanelConfig.updateOne({ identificador: 'global' }, { $set: updateQuery }, { upsert: true });
        res.json({ exito: true, mensaje: `Configuración de ${tipo} guardada.` });
    } catch (error) {
        console.error("Error al guardar configuración:", error);
        res.status(500).json({ exito: false, mensaje: "Error del servidor" });
    }
});

app.post('/api/guardar-cierre', requireLogin, async (req, res) => {
    try {
        const nuevoCierre = new CierreCaja(req.body);
        await nuevoCierre.save();
        res.json({ exito: true, mensaje: "Cierre de caja guardado con éxito" });
    } catch (error) {
        res.status(500).json({ exito: false, mensaje: "Error al guardar el cierre de caja" });
    }
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

app.post('/api/actualizar-costo-minijuego-nombre', requireLogin, async (req, res) => {
    try {
        const { name, nuevoCosto } = req.body;
        const minijuego = await Minigame.findOneAndUpdate({ name: name }, { creditCost: nuevoCosto }, { new: true });
        
        if (!minijuego) {
            return res.status(404).json({ success: false, message: `Minijuego '${name}' no encontrado en la base de datos.` });
        }
        res.json({ success: true, message: `El costo de ${name} ha sido actualizado a ${nuevoCosto} Créditos.` });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error interno al actualizar el costo.', error: error.message });
    }
});

app.post('/api/canjear-producto', async (req, res) => {
    try {
        const { usuario, nombre, costo } = req.body;
        const cliente = await Cliente.findOne({ usuarioCasino: usuario });
        
        if (!cliente) return res.status(404).json({ exito: false, mensaje: "Usuario no encontrado" });
        if (cliente.creditos < costo) return res.status(400).json({ exito: false, mensaje: "Créditos insuficientes" });

        cliente.creditos -= costo;
        await cliente.save();

        console.log(`Canje exitoso para ${usuario}: ${nombre}`);
        res.json({ exito: true, nuevoSaldo: cliente.creditos });
    } catch (error) {
        console.error("Error en canje:", error);
        res.status(500).json({ exito: false, mensaje: "Error al canjear el producto" });
    }
});
// ==============================================================
// 5. MOTOR DEL SLOT PREMIUM (FÉNIX SLOTS)
// ==============================================================
const todosLosSimbolos = ['laud', 'bufon', 'zapatos', 'bonus', 'clavas', 'esfera'];
const tablaPremios = {
    'bufon': 10, 'laud': 8, 'clavas': 6, 'zapatos': 3, 'esfera': 1
};

app.get('/api/obtener-saldo', async (req, res) => {
    try {
        const { usuario } = req.query;
        const cliente = await Cliente.findOne({ usuarioCasino: usuario }); 
        if (!cliente) return res.status(404).json({ exito: false, mensaje: "Usuario no encontrado" });
        res.json({ exito: true, saldo: cliente.creditos });
    } catch (error) { res.status(500).json({ exito: false, mensaje: "Error del servidor" }); }
});

app.post('/api/jugar-slot', async (req, res) => {
    try {
        const { usuario, apuestaGasto, apuestaCalculoPremio, esGiroGratis } = req.body;
        const cliente = await Cliente.findOne({ usuarioCasino: usuario });
        if (!cliente) return res.status(404).json({ exito: false, mensaje: "Usuario no encontrado" });
        if (!esGiroGratis && cliente.creditos < apuestaGasto) return res.status(400).json({ exito: false, mensaje: "Créditos insuficientes" });
        
        cliente.creditos -= apuestaGasto;
        const rodillos = [
            todosLosSimbolos[Math.floor(Math.random() * todosLosSimbolos.length)],
            todosLosSimbolos[Math.floor(Math.random() * todosLosSimbolos.length)],
            todosLosSimbolos[Math.floor(Math.random() * todosLosSimbolos.length)]
        ];
        const esIgual = (rodillos[0] === rodillos[1] && rodillos[1] === rodillos[2]);
        const simbolo = rodillos[0];
        let premio = (esIgual && simbolo !== 'bonus' && tablaPremios[simbolo]) ? apuestaCalculoPremio * tablaPremios[simbolo] : 0;
        
        if (!esGiroGratis && premio > 0) cliente.creditos += premio;
        await cliente.save();
        res.json({ exito: true, rodillos, nuevoSaldo: cliente.creditos, premioGanado: premio });
    } catch (error) { res.status(500).json({ exito: false, mensaje: "Error procesando la jugada" }); }
});

app.post('/api/sumar-premio-bonus', async (req, res) => {
    try {
        const { usuario, premio } = req.body;
        if (premio <= 0) return res.json({ exito: true });
        const cliente = await Cliente.findOne({ usuarioCasino: usuario });
        if (!cliente) return res.status(404).json({ exito: false, mensaje: "Usuario no encontrado" });
        cliente.creditos += premio;
        await cliente.save();
        res.json({ exito: true, nuevoSaldo: cliente.creditos });
    } catch (error) { res.status(500).json({ exito: false, mensaje: "Error sumando bonus" }); }
});

// ==============================================================
// 6. IMPORTACIÓN DE RUTAS MODULARES
// ==============================================================
require('./routes/finanzas')(app, requireLogin, io, sharedState);
require('./routes/clientes')(app, requireLogin, io, sharedState);
require('./routes/eventos')(app, requireLogin, io, sharedState);

// ==============================================================
// 7. COMUNICACIÓN EN VIVO (SOCKETS)
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
                clientes: clientesDB, retiros: retirosDB, usuariosInternos: internosDB,
                ruleta: ruletaDB ? ruletaDB.configuracion : [], raspa: raspaDB ? raspaDB.configuracion : [],
                tragamonedas: tragaDB ? tragaDB.configuracion : [], cartas: cartasDB ? cartasDB.configuracion : [],
                moneda: monedaDB ? monedaDB.configuracion : [], panelConfig: panelConfigDB 
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
            exito: true, usuario: datos.usuario, historial: clienteDB.historialChat, creditos: clienteDB.creditos || 0
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
// 8. INICIALIZADOR DE DATOS
// ==============================================================
async function inicializarDatosDePrueba() {
    const juegos = ['Ruleta', 'Raspa', 'Tragamonedas', 'Cartas', 'Moneda'];
    for (let nombre of juegos) {
        const existe = await Minigame.findOne({ name: nombre });
        if (!existe) await new Minigame({ name: nombre, creditCost: 10 }).save();
    }
    const countCl = await Cliente.countDocuments();
    if(countCl === 0) { await new Cliente({ usuarioCasino: 'joniz115', saldo: 60000, creditos: 5000, wager: 10000, estado: 'Activo' }).save(); }
    
    if (await Ruleta.countDocuments() === 0) {
        await new Ruleta({ configuracion: [
            { id: 0, premio: '🏆 JACKPOT', valor: 50000, probabilidad: 2 }, { id: 1, premio: '🔥 Premio Mayor', valor: 10000, probabilidad: 8 },
            { id: 2, premio: '⭐ Premio Medio', valor: 5000, probabilidad: 12 }, { id: 3, premio: '🍀 Premio Chico', valor: 2000, probabilidad: 18 },
            { id: 4, premio: '✨ Consolación', valor: 500, probabilidad: 20 }, { id: 5, premio: '🎁 Sorpresa', valor: 100, probabilidad: 40 }
        ]}).save();
    }
    if (await Raspa.countDocuments() === 0) {
        await new Raspa({ configuracion: [
            { id: 0, premio: '💎 MEGA BONO', valor: 30000, probabilidad: 3 }, { id: 1, premio: '👑 Premio Alto', valor: 15000, probabilidad: 7 },
            { id: 2, premio: '💵 Premio Intermedio', valor: 4000, probabilidad: 15 }, { id: 3, premio: '📦 Premio Base', valor: 1500, probabilidad: 25 },
            { id: 4, premio: '🪙 Recompensa Menor', valor: 600, probabilidad: 20 }, { id: 5, premio: '🎈 Suerte Loca', valor: 200, probabilidad: 30 }
        ]}).save();
    }
    if (await Tragamonedas.countDocuments() === 0) {
        await new Tragamonedas({ configuracion: [
            { id: 0, premio: '🎰 PLENO 777', valor: 50000, probabilidad: 2 }, { id: 1, premio: '💎 Diamantes', valor: 15000, probabilidad: 8 },
            { id: 2, premio: '🔔 Campanas', valor: 5000, probabilidad: 15 }, { id: 3, premio: '🍋 Limones', valor: 1500, probabilidad: 25 },
            { id: 4, premio: '🍒 Cerezas', valor: 500, probabilidad: 30 }, { id: 5, premio: '❌ Sin Suerte', valor: 0, probabilidad: 20 }
        ]}).save();
    }
    if (await Cartas.countDocuments() === 0) {
        await new Cartas({ configuracion: [
            { id: 0, premio: '🃏 AS (Jackpot)', valor: 25000, probabilidad: 5 }, { id: 1, premio: '🤴 Rey (Alto)', valor: 10000, probabilidad: 10 },
            { id: 2, premio: '👸 Reina (Medio)', valor: 5000, probabilidad: 20 }, { id: 3, premio: '🃋 10 de Trébol', valor: 2000, probabilidad: 25 },
            { id: 4, premio: '🃈 7 Diamantes', valor: 500, probabilidad: 30 }, { id: 5, premio: '🃂 2 Corazones', valor: 100, probabilidad: 10 }
        ]}).save();
    }
    if (await Moneda.countDocuments() === 0) {
        await new Moneda({ configuracion: [
            { id: 0, premio: '🟡 Cara Dorada', valor: 10000, probabilidad: 5 }, { id: 1, premio: '⚪ Cruz Plata', valor: 5000, probabilidad: 15 },
            { id: 2, premio: '🪙 Cara Normal', valor: 2000, probabilidad: 30 }, { id: 3, premio: '🪙 Cruz Normal', valor: 1000, probabilidad: 30 },
            { id: 4, premio: '💥 Moneda Caída', valor: 200, probabilidad: 20 }
        ]}).save();
    }

    if (await PanelConfig.countDocuments() === 0) { await new PanelConfig({ identificador: 'global' }).save(); }
}

const PUERTO = process.env.PORT || 3000;
server.listen(PUERTO, () => { console.log(`🚀 Servidor en puerto ${PUERTO}`); });
