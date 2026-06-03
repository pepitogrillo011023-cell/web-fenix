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

// --- CONFIGURACIÓN DE SESIÓN Y MIDDLEWARES ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); 
app.use(session({
    secret: 'CasinoFenix2026_Seguro',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 } 
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
    // Credenciales de acceso al panel
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

// Protegemos el panel de administrador para que pida login
app.get('/admin.html', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// 👇 LÍNEA MÁGICA REPARADA 👇
// Permitimos que el servidor muestre el resto de los archivos libres (login.html, index.html)
app.use(express.static('public'));

// ==============================================================
// ⚡ RECEPTOR WEBHOOK: MERCADO PAGO EN TIEMPO REAL
// ==============================================================
app.post('/api/webhook/billetera', async (req, res) => {
    // Mercado Pago exige responder HTTP 200 rápido de entrada
    res.status(200).send("OK");

    try {
        const accion = req.body?.action;
        const tipo = req.body?.type;
        const paymentId = req.body?.data?.id;

        if ((accion === 'payment.created' || tipo === 'payment') && paymentId) {
            const configDb = await PanelConfig.findOne({ identificador: 'global' });
            const accessTokenMP = configDb?.apis?.pass; 

            if (!accessTokenMP) {
                console.log("🔴 Webhook recibido pero falta el Access Token de MP en el panel.");
                return;
            }

            // Consultamos los detalles oficiales del pago a la API de Mercado Pago
            const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${accessTokenMP}` }
            });
            const dataMP = await mpResponse.json();

            if (dataMP.status === 'approved') {
                const montoTransferido = dataMP.transaction_amount;
                const saldoFormateado = `$${Number(montoTransferido).toLocaleString('es-AR')} ARS`;

                // Guardamos el registro actualizado del saldo en la configuración de la billetera
                let datosBilleteraActuales = configDb.billetera || {};
                datosBilleteraActuales.monto = saldoFormateado;

                await PanelConfig.updateOne(
                    { identificador: 'global' },
                    { $set: { billetera: datosBilleteraActuales } }
                );

                // Notificamos mediante Sockets al panel de administrador que esté abierto
                if (adminSocketId) {
                    io.to(adminSocketId).emit('billetera_actualizada_en_vivo', {
                        saldoFormateado: saldoFormateado,
                        montoTransferido: montoTransferido,
                        tipoMovimiento: 'ingreso'
                    });
                }
            }
        }
    } catch (error) {
        console.error("🔴 Error procesando el Webhook de Mercado Pago:", error);
    }
});

// --- VALIDACIÓN DE INICIO DE SESIÓN PARA CLIENTES ---
app.post('/api/validar-cliente', async (req, res) => {
    try {
        const { usuario, password } = req.body;
        const cliente = await Cliente.findOne({ usuarioCasino: usuario });
        
        if (cliente) {
            const claveReal = cliente.password ? cliente.password : '1234';
            if (password === claveReal) {
                if (!cliente.password) {
                    await Cliente.updateOne({ usuarioCasino: usuario }, { $set: { password: '1234' } });
                }
                res.json({ exito: true });
            } else {
                res.json({ exito: false }); 
            }
        } else {
            res.json({ exito: false }); 
        }
    } catch (error) {
        console.error("🔴 Error al validar credenciales:", error);
        res.status(500).json({ exito: false, mensaje: 'Error en inicio de sesión.' });
    }
});

// --- RUTA DE GESTIÓN DE SALDOS PANEL ---
app.post('/api/cargar-saldo', requireLogin, async (req, res) => {
    const { usuario, monto } = req.body;
    try {
        await Cliente.updateOne(
            { usuarioCasino: usuario }, 
            { $inc: { saldo: monto } }
        );
        res.json({ exito: true, mensaje: `¡Panel actualizado! Se sumaron $${monto} al cliente ${usuario}.` });
    } catch (error) {
        res.status(500).json({ exito: false, mensaje: 'Hubo un error de base de datos.' });
    }
});

// --- RUTA DE CONFIGURACIONES GENERALES DEL PANEL ---
app.post('/api/guardar-config', requireLogin, async (req, res) => {
    try {
        const { seccion, datos } = req.body;
        await PanelConfig.updateOne(
            { identificador: 'global' },
            { $set: { [seccion]: datos } },
            { upsert: true }
        );
        res.json({ exito: true });
    } catch (error) {
        res.status(500).json({ exito: false });
    }
});

// --- RUTAS DE LA RULETA ---
app.post('/api/guardar-ruleta', requireLogin, async (req, res) => {
    try {
        await Ruleta.deleteMany({});
        await new Ruleta({ configuracion: req.body.configuracion }).save();
        res.json({ exito: true });
    } catch (error) {
        res.json({ exito: false });
    }
});

app.get('/api/ruleta-config', async (req, res) => {
    try {
        const ruletaDb = await Ruleta.findOne();
        const config = ruletaDb ? ruletaDb.configuracion : [];
        res.json({ exito: true, config });
    } catch (error) {
        res.json({ exito: false });
    }
});

app.post('/api/tirar-ruleta-prueba', requireLogin, (req, res) => {
    try {
        const { configuracion } = req.body;
        if (!configuracion || configuracion.length === 0) return res.json({ exito: false });

        const rand = Math.random() * 100;
        let sum = 0;
        let premioGanado = configuracion[configuracion.length - 1]; 

        for (let item of configuracion) {
            sum += item.probabilidad;
            if (rand <= sum) {
                premioGanado = item;
                break;
            }
        }
        res.json({ exito: true, premio: premioGanado });
    } catch (error) {
        res.status(500).json({ exito: false });
    }
});

app.post('/api/tirar-ruleta', async (req, res) => {
    try {
        const { usuario } = req.body;
        const cliente = await Cliente.findOne({ usuarioCasino: usuario });
        if (!cliente) return res.json({ exito: false, mensaje: 'Cliente no encontrado.' });

        const hoy = new Date();
        const ultima = cliente.ultimaRuleta;
        if (ultima && ultima.getDate() === hoy.getDate() && ultima.getMonth() === hoy.getMonth() && ultima.getFullYear() === hoy.getFullYear()) {
            return res.json({ exito: false, mensaje: '❌ Ya usaste tu tiro diario. ¡Volvé mañana con más suerte!' });
        }

        const ruletaDb = await Ruleta.findOne();
        const config = ruletaDb ? ruletaDb.configuracion : [];
        if (config.length === 0) return res.json({ exito: false, mensaje: 'La ruleta está en mantenimiento.' });

        const rand = Math.random() * 100;
        let sum = 0;
        let premioGanado = config[config.length - 1]; 

        for (let item of config) {
            sum += item.probabilidad;
            if (rand <= sum) {
                premioGanado = item;
                break;
            }
        }

        cliente.saldo += premioGanado.valor;
        cliente.ultimaRuleta = hoy;
        
        const msgBot = `🎰 ¡La ruleta frenó en <b>${premioGanado.premio}</b>!<br>Se acreditaron <b>$${premioGanado.valor}</b> a tu cuenta de casino.`;
        cliente.historialChat.push({ emisor: 'bot', mensaje: msgBot, leido: true });
        await cliente.save();

        const usuarioExistente = usuariosConectados.find(u => u.nombre === usuario);
        if (usuarioExistente) {
            usuarioExistente.historial = cliente.historialChat;
            if (adminSocketId) io.to(adminSocketId).emit('actualizar_chat_activo', { nombre: usuario, historial: usuarioExistente.historial });
        }
        if (adminSocketId) {
            const clientesDB = await Cliente.find();
            io.to(adminSocketId).emit('cargar_datos_tablas', { clientes: clientesDB });
        }

        res.json({ exito: true, mensaje: msgBot, premio: premioGanado });
    } catch (error) {
        res.status(500).json({ exito: false });
    }
});

// --- RUTAS DEL RASPA Y GANA ---
app.post('/api/guardar-raspa', requireLogin, async (req, res) => {
    try {
        await Raspa.deleteMany({});
        await new Raspa({ configuracion: req.body.configuracion }).save();
        res.json({ exito: true });
    } catch (error) {
        res.json({ exito: false });
    }
});

app.get('/api/raspa-config', async (req, res) => {
    try {
        const raspaDb = await Raspa.findOne();
        const config = raspaDb ? raspaDb.configuracion : [];
        res.json({ exito: true, config });
    } catch (error) {
        res.json({ exito: false });
    }
});

app.post('/api/tirar-raspa-prueba', requireLogin, (req, res) => {
    try {
        const { configuracion } = req.body;
        if (!configuracion || configuracion.length === 0) return res.json({ exito: false });

        const rand = Math.random() * 100;
        let sum = 0;
        let premioGanado = configuracion[configuracion.length - 1];

        for (let item of configuracion) {
            sum += item.probabilidad;
            if (rand <= sum) {
                premioGanado = item;
                break;
            }
        }
        res.json({ exito: true, premio: premioGanado });
    } catch (error) {
        res.status(500).json({ exito: false });
    }
});

app.post('/api/tirar-raspa', async (req, res) => {
    try {
        const { usuario } = req.body;
        const cliente = await Cliente.findOne({ usuarioCasino: usuario });
        if (!cliente) return res.json({ exito: false, mensaje: 'Cliente no encontrado.' });

        const hoy = new Date();
        const ultima = cliente.ultimaRaspa;
        if (ultima && ultima.getDate() === hoy.getDate() && ultima.getMonth() === hoy.getMonth() && ultima.getFullYear() === hoy.getFullYear()) {
            return res.json({ exito: false, mensaje: '❌ Ya raspaste tu tarjeta de hoy. ¡Volvé mañana!' });
        }

        const raspaDb = await Raspa.findOne();
        const config = raspaDb ? raspaDb.configuracion : [];
        if (config.length === 0) return res.json({ exito: false, mensaje: 'El Raspa y Gana está en mantenimiento.' });

        const rand = Math.random() * 100;
        let sum = 0;
        let premioGanado = config[config.length - 1];

        for (let item of config) {
            sum += item.probabilidad;
            if (rand <= sum) {
                premioGanado = item;
                break;
            }
        }

        cliente.saldo += premioGanado.valor;
        cliente.ultimaRaspa = hoy;

        const msgBot = `🎫 ¡Descubriste una tarjeta de Raspa y Gana!<br>Premio obtenido: <b>${premioGanado.premio}</b>.<br>Se acreditaron <b>$${premioGanado.valor}</b> a tu balance.`;
        cliente.historialChat.push({ emisor: 'bot', mensaje: msgBot, leido: true });
        await cliente.save();

        const usuarioExistente = usuariosConectados.find(u => u.nombre === usuario);
        if (usuarioExistente) {
            usuarioExistente.historial = cliente.historialChat;
            if (adminSocketId) io.to(adminSocketId).emit('actualizar_chat_activo', { nombre: usuario, historial: usuarioExistente.historial });
        }
        if (adminSocketId) {
            const clientesDB = await Cliente.find();
            io.to(adminSocketId).emit('cargar_datos_tablas', { clientes: clientesDB });
        }

        res.json({ exito: true, mensaje: msgBot, premio: premioGanado });
    } catch (error) {
        res.status(500).json({ exito: false });
    }
});

// --- IMPORTADOR DE DATOS ---
app.post('/importar-datos', requireLogin, async (req, res) => {
    try {
        const { datosCrudos } = req.body;
        const lineas = datosCrudos.split('\n').map(l => l.trim()).filter(l => l !== '');
        let actualizados = 0;

        for (let i = 0; i < lineas.length; i++) {
            if (lineas[i].toLowerCase() === 'player') {
                const usuario = lineas[i - 1];
                const saldoString = lineas[i + 1];
                if (usuario && saldoString) {
                    const saldoNumerico = parseFloat(saldoString.replace(/\./g, '').replace(',', '.'));
                    if (!isNaN(saldoNumerico)) {
                        await Cliente.updateOne(
                            { usuarioCasino: usuario }, 
                            { 
                                $set: { saldo: saldoNumerico, estado: 'Activo' },
                                $setOnInsert: { password: '1234' }
                            }, 
                            { upsert: true }
                        );
                        actualizados++;
                    }
                }
            }
        }
        res.json({ mensaje: `¡Se actualizaron ${actualizados} usuarios!` });
    } catch (error) {
        res.status(500).json({ mensaje: 'Hubo un error en el servidor.' });
    }
});

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
// 📝 MODELOS DE DATOS DE MONGODB
// --------------------------------------------------------
const clienteSchema = new mongoose.Schema({
    usuarioCasino: { type: String, required: true, unique: true },
    password: { type: String, default: '1234' },
    saldo: { type: Number, default: 0 },
    wager: { type: Number, default: 0 },
    estado: { type: String, default: 'Activo' },
    historialChat: { type: Array, default: [] },
    ultimaConexion: { type: Date, default: Date.now },
    ultimaRuleta: { type: Date, default: null },
    ultimaRaspa: { type: Date, default: null } 
});
const Cliente = mongoose.model('Cliente', clienteSchema);

const ruletaSchema = new mongoose.Schema({ configuracion: Array });
const Ruleta = mongoose.model('Ruleta', ruletaSchema);

const raspaSchema = new mongoose.Schema({ configuracion: Array });
const Raspa = mongoose.model('Raspa', raspaSchema);

const panelConfigSchema = new mongoose.Schema({
    identificador: { type: String, default: 'global', unique: true },
    retencion: { type: Array, default: [] },
    apis: { type: Object, default: {} },
    push: { type: Object, default: {} },
    billetera: { type: Object, default: {} }
});
const PanelConfig = mongoose.model('PanelConfig', panelConfigSchema);

const retiroSchema = new mongoose.Schema({
    fecha: { type: String, default: () => new Date().toLocaleString('es-AR') },
    cliente: String,
    monto: Number,
    cbuAlias: String,
    titular: String,
    estado: { type: String, default: 'Aprobado (Enviado)' },
    procesadoPor: { type: String, default: 'Lambda (Automático)' }
});
const Retiro = mongoose.model('Retiro', retiroSchema);

const usuarioInternoSchema = new mongoose.Schema({
    nombre: String,
    usuario: String,
    email: String,
    rol: String,
    estado: { type: String, default: 'Activo' }
});
const UsuarioInterno = mongoose.model('UsuarioInterno', usuarioInternoSchema);

// --------------------------------------------------------
// VARIABLES EN VIVO PARA SOCKETS
// --------------------------------------------------------
let usuariosConectados = []; 
let adminSocketId = null;
let usuarioSeleccionadoActivoAdmin = null;

io.on('connection', (socket) => {
    
    socket.on('identificar_admin', async () => {
        adminSocketId = socket.id;
        socket.emit('lista_usuarios_actualizada', usuariosConectados);
        
        try {
            const clientesDB = await Cliente.find();
            const retirosDB = await Retiro.find();
            const internosDB = await UsuarioInterno.find();
            const ruletaDB = await Ruleta.findOne();
            const raspaDB = await Raspa.findOne(); 
            const panelConfigDB = await PanelConfig.findOne({ identificador: 'global' }); 
            
            socket.emit('cargar_datos_tablas', {
                clientes: clientesDB,
                retiros: retirosDB,
                usuariosInternos: internosDB,
                ruleta: ruletaDB ? ruletaDB.configuracion : [],
                raspa: raspaDB ? raspaDB.configuracion : [],
                panelConfig: panelConfigDB 
            });
        } catch (e) { console.log(e); }
    });

    socket.on('admin_cambio_chat_activo', async (datos) => {
        usuarioSeleccionadoActivoAdmin = datos.usuario;
        if (usuarioSeleccionadoActivoAdmin) {
            let usuario = usuariosConectados.find(u => u.nombre === usuarioSeleccionadoActivoAdmin);
            if (usuario) {
                usuario.historial.forEach(h => { if (h.emisor === 'cliente') h.leido = true; });
                await Cliente.updateOne({ usuarioCasino: usuario.nombre }, { historialChat: usuario.historial });
                if (usuario.id) io.to(usuario.id).emit('tus_mensajes_fueron_leidos');
            }
        }
        if (adminSocketId) io.to(adminSocketId).emit('lista_usuarios_actualizada', usuariosConectados);
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

        let usuarioExistente = usuariosConectados.find(u => u.nombre === datos.usuario);
        if (!usuarioExistente) {
            usuariosConectados.push({ 
                id: socket.id, 
                nombre: datos.usuario, 
                estado: 'Menú',
                historial: clienteDB.historialChat
            });
        } else {
            usuarioExistente.id = socket.id; 
            usuarioExistente.historial = clienteDB.historialChat; 
        }
        
        socket.emit('resultado_validacion', { exito: true, usuario: datos.usuario, historial: clienteDB.historialChat });
        if (adminSocketId) {
            io.to(adminSocketId).emit('lista_usuarios_actualizada', usuariosConectados);
            const clientesDB = await Cliente.find();
            io.to(adminSocketId).emit('cargar_datos_tablas', { clientes: clientesDB });
        }
    });

    socket.on('cliente_accion', async (datos) => {
        let usuario = usuariosConectados.find(u => u.nombre === socket.username);
        if (usuario) {
            usuario.estado = datos.estado;
            let estaMirandome = (usuarioSeleccionadoActivoAdmin === usuario.nombre);

            if (datos.mensajeCliente) { usuario.historial.push({ emisor: 'cliente', mensaje: datos.mensajeCliente, leido: estaMirandome }); }
            if (datos.mensajeBot) { usuario.historial.push({ emisor: 'bot', mensaje: datos.mensajeBot, leido: true }); }

            await Cliente.updateOne({ usuarioCasino: usuario.nombre }, { historialChat: usuario.historial, estado: datos.estado });

            if (adminSocketId) {
                io.to(adminSocketId).emit('lista_usuarios_actualizada', usuariosConectados);
                io.to(adminSocketId).emit('actualizar_chat_activo', { nombre: usuario.nombre, historial: usuario.historial });
            }
            if (estaMirandome) socket.emit('tus_mensajes_fueron_leidos');
        }
    });

    socket.on('cliente_envia_mensaje_libre', async (datos) => {
        let usuario = usuariosConectados.find(u => u.nombre === socket.username);
        if (usuario) {
            let estaMirandome = (usuarioSeleccionadoActivoAdmin === usuario.nombre);
            usuario.historial.push({ emisor: 'cliente', mensaje: datos.mensaje, leido: estaMirandome });

            await Cliente.updateOne({ usuarioCasino: usuario.nombre }, { historialChat: usuario.historial });

            if (adminSocketId) {
                io.to(adminSocketId).emit('lista_usuarios_actualizada', usuariosConectados);
                io.to(adminSocketId).emit('actualizar_chat_activo', { nombre: usuario.nombre, historial: usuario.historial });
            }
            if (estaMirandome) socket.emit('tus_mensajes_fueron_leidos');
        }
    });

    socket.on('admin_envia_mensaje', async (datos) => {
        let usuario = usuariosConectados.find(u => u.nombre === datos.paraUsuario);
        if (usuario) {
            usuario.historial.push({ emisor: 'admin', mensaje: datos.mensaje, leido: true });
            await Cliente.updateOne({ usuarioCasino: usuario.nombre }, { historialChat: usuario.historial });
            io.to(usuario.id).emit('recibir_mensaje_admin', { mensaje: datos.mensaje });
            socket.emit('actualizar_chat_activo', { nombre: usuario.nombre, historial: usuario.historial });
        }
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            let usuario = usuariosConectados.find(u => u.nombre === socket.username);
            if (usuario) { usuario.id = null; }
            if (usuarioSeleccionadoActivoAdmin === socket.username) usuarioSeleccionadoActivoAdmin = null;
            if (adminSocketId) io.to(adminSocketId).emit('lista_usuarios_actualizada', usuariosConectados);
        }
    });
});

async function inicializarDatosDePrueba() {
    const countCl = await Cliente.countDocuments();
    if(countCl === 0) {
        await new Cliente({ usuarioCasino: 'joniz115', saldo: 60000, wager: 10000, estado: 'Activo' }).save();
    }
    
    const countRuleta = await Ruleta.countDocuments();
    if (countRuleta === 0) {
        await new Ruleta({ configuracion: [
            { id: 0, premio: '🏆 JACKPOT', valor: 50000, probabilidad: 2 },
            { id: 1, premio: '🔥 Premio Mayor', valor: 10000, probabilidad: 8 },
            { id: 2, premio: '⭐ Premio Medio', valor: 5000, probabilidad: 12 },
            { id: 3, premio: '🍀 Premio Chico', valor: 2000, probabilidad: 18 },
            { id: 4, premio: '✨ Consolación', valor: 500, probabilidad: 20 },
            { id: 5, premio: '🎁 Sorpresa', valor: 100, probabilidad: 40 }
        ]}).save();
    }

    const countRaspa = await Raspa.countDocuments();
    if (countRaspa === 0) {
        await new Raspa({ configuracion: [
            { id: 0, premio: '💎 MEGA BONO', valor: 30000, probabilidad: 3 },
            { id: 1, premio: '👑 Premio Alto', valor: 15000, probabilidad: 7 },
            { id: 2, premio: '💵 Premio Intermedio', valor: 4000, probabilidad: 15 },
            { id: 3, premio: '📦 Premio Base', valor: 1500, probabilidad: 25 },
            { id: 4, grid_column: '🪙 Recompensa Menor', valor: 600, probabilidad: 20 },
            { id: 5, premio: '🎈 Suerte Loca', valor: 200, probabilidad: 30 }
        ]}).save();
    }

    const countPanel = await PanelConfig.countDocuments();
    if (countPanel === 0) {
        await new PanelConfig({ identificador: 'global' }).save();
    }
}

const PUERTO = process.env.PORT || 3000;
server.listen(PUERTO, () => {
    console.log('=============================================');
    console.log(`🚀 SERVIDOR VINCULADO AL PANEL EN PUERTO ${PUERTO}`);
    console.log('=============================================');
});
