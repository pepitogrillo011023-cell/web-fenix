require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const session = require('express-session'); 
const path = require('path');
const bcrypt = require('bcryptjs');


// Importar modelos
const slotRoutes = require('./routes/slot'); 
console.log("CONTENIDO DE SLOTROUTES:", slotRoutes); // <--- AGREGA ESTO
const Minigame = require('./models/Minigame');
const User = require('./models/User');
const eventosRouter = require('./routes/eventos');
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // O el dominio específico de tu app si lo tenés restringido
        methods: ["GET", "POST"]
    },
    transports: ['websocket'] // 🔥 Obliga al servidor a hablar solo por WebSocket
});

// ==============================================================
// 1. MODELOS DE DATOS
// ==============================================================
const clienteSchema = new mongoose.Schema({
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
    ultimaMoneda: { type: Date, default: null },
    lastWithdrawal: { type: Date, default: null },
    
    // --- CAMPOS NUEVOS ---
    referralCode: { type: String, unique: true, index: true }, 
    referredBy: { type: String, default: null }
});

// Middleware automático: Crea el código al guardar
clienteSchema.pre('save', function(next) {
    if (!this.referralCode) {
        const prefijo = this.usuarioCasino.substring(0, 3).toUpperCase();
        const aleatorio = Math.floor(1000 + Math.random() * 9000);
        this.referralCode = `${prefijo}${aleatorio}`;
    }
    next();
});

const Cliente = mongoose.model('Cliente', clienteSchema);


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
    tienda: { type: Array, default: [] } // <-- Agregado para que MongoDB lo guarde
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
            try {
                const sinCodigo = await Cliente.find({ referralCode: { $exists: false } });
                for (const user of sinCodigo) {
                    const prefijo = user.usuarioCasino.substring(0, 3).toUpperCase();
                    const aleatorio = Math.floor(1000 + Math.random() * 9000);
                    user.referralCode = `${prefijo}${aleatorio}`;
                    await user.save();
                }
                if(sinCodigo.length > 0) {
                    console.log(`✅ ${sinCodigo.length} usuarios actualizados con código de referido.`);
                }
            } catch (err) {
                console.error("❌ Error en la migración de referidos:", err);
            }
            await inicializarDatosDePrueba();
        })
        .catch(err => console.log('🔴 ERROR DE MONGODB:', err));
}

// ==============================================================
// 3. MIDDLEWARES, SESIÓN Y SEGURIDAD
// ==============================================================

// Configuración robusta para Render (Proxy) - DEBE IR ANTES DE LA SESIÓN
app.set('trust proxy', 1); 

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use((req, res, next) => {
    console.log(`Petición recibida: ${req.method} ${req.path}`);
    next();
});
app.use('/eventos', eventosRouter);
app._router.stack.forEach(function(r){
  if (r.route && r.route.path){
    console.log("Ruta definida: " + r.route.path);
  } else if (r.name === 'router') {
    r.handle.stack.forEach(function(handler){
      if (handler.route) {
        console.log("Ruta en router: " + handler.route.path);
      }
    });
  }
});
// UNA SOLA CONFIGURACIÓN DE SESIÓN (Producción / Render lista)
app.use(session({
    secret: 'CasinoFenix2026_Seguro', // Tu secreto definitivo
    name: 'sessionId',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: true,      // OBLIGATORIO: Para HTTPS en Render
        sameSite: 'lax',  // OBLIGATORIO: Permite comunicación cross-site en Render
        maxAge: 1000 * 60 * 60 * 24 // 24 horas de duración máxima
    }
}));

// Middleware de protección de rutas
const requireLogin = (req, res, next) => {
    if (req.session && req.session.loggedIn) {
        return next();
    }
    
    // Si es un fetch, devolvemos 401, si es navegación normal, redirigimos
    if (req.originalUrl.startsWith('/api/')) {
        return res.status(401).json({ message: "No autorizado" });
    }
    
    res.redirect('/login.html');
};

// ==============================================================
// RUTAS DE AUTENTICACIÓN Y MENÚ
// ==============================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        // 1. Caso especial: Admin (si no está en la BD)
        if (username === 'admin' && password === '1234') {
            req.session.loggedIn = true;
            req.session.userId = 'admin';
            return req.session.save(() => res.redirect('/admin.html'));
        }

        // 2. Caso clientes: Buscar en la BD por 'usuarioCasino'
        const user = await User.findOne({ usuarioCasino: username });

        if (user && await bcryptjs.compare(password, user.password)) {
            req.session.loggedIn = true;
            req.session.userId = user._id;
            
            return req.session.save(() => {
                res.redirect('/index.html');
            });
        } else {
            res.send('Usuario o contraseña incorrectos. <a href="/login.html">Volver</a>');
        }
    } catch (error) {
        console.error("Error en login:", error);
        res.status(500).send("Error interno.");
    }
});


// MODIFICADO: Logout seguro con función Callback
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Error al destruir la sesión:", err);
            return res.send("Error al cerrar sesión.");
        }
        // Borramos la cookie del navegador manualmente para mayor seguridad
        res.clearCookie('sessionId'); 
        res.redirect('/login.html');
    });
});
// 🔥 NUEVO: Cierre de sesión exclusivo para los Clientes (Pegalo acá)
app.get('/logout-cliente', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Error al destruir la sesión del cliente:", err);
            return res.send("Error al cerrar sesión.");
        }
        // Borramos la misma cookie
        res.clearCookie('sessionId'); 
        
        // 🚪 Redirigimos al inicio o al login de clientes
        // Si tu pantalla principal de carga/login es la raíz, dejás '/'
        res.redirect('/index.html'); 
    });
});

app.get('/admin.html', requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.post('/api/cambiar-contrasena', requireLogin, async (req, res) => {
    try {
        const { nuevaPassword } = req.body;
        const userId = req.session.userId;

        // Validar que el ID sea válido (evitar error con el admin)
        if (!userId || userId === 'admin') {
            return res.status(400).json({ message: "No puedes cambiar contraseña de Admin aquí" });
        }

        // Encriptar la nueva contraseña
        const hashedPassword = await bcryptjs.hash(nuevaPassword, 10);

        // Actualizar en la base de datos
        await User.findByIdAndUpdate(userId, { password: hashedPassword });
        
        res.json({ success: true, message: "Contraseña actualizada" });
    } catch (error) {
        console.error("Error al cambiar contraseña:", error);
        res.status(500).json({ message: "Error al actualizar la contraseña" });
    }
});
// ==========================================
// CONFIGURACIÓN DEL MOTOR MATEMÁTICO DEL SLOT
// ==========================================
const tablaPremios = { 'bufon': 10, 'laud': 8, 'clavas': 6, 'zapatos': 3, 'esfera': 1 };
const pesosSimbolos = [
    { nombre: 'esfera', peso: 35 },
    { nombre: 'zapatos', peso: 25 },
    { nombre: 'clavas', peso: 20 },
    { nombre: 'laud', peso: 12 },
    { nombre: 'bufon', peso: 3 },
    { nombre: 'bonus', peso: 5 }
];

function tirarRodillo() {
    let totalPeso = pesosSimbolos.reduce((acc, simbolo) => acc + simbolo.peso, 0);
    let random = Math.floor(Math.random() * totalPeso);
    
    for (let s of pesosSimbolos) {
        if (random < s.peso) return s.nombre;
        random -= s.peso;
    }
}

// ==========================================
// RUTA DEL SLOT CORREGIDA (Usando Cliente)
// ==========================================
app.post('/api/jugar-slot', async (req, res) => {
    const { usuario, apuestaGasto, apuestaCalculoPremio, esGiroGratis } = req.body;

    try {
        // 1. BUSCAR AL USUARIO en la colección 'Cliente' (donde guardas todo lo demás)
        const cliente = await Cliente.findOne({ usuarioCasino: usuario });
        
        if (!cliente) {
            return res.status(404).json({ exito: false, mensaje: "Usuario no encontrado en Cliente" });
        }

        // 2. VALIDAR SALDO (usando cliente.creditos)
        if (!esGiroGratis && cliente.creditos < apuestaGasto) {
            return res.status(400).json({ exito: false, mensaje: "Créditos insuficientes" });
        }

        // 3. COBRAR
        if (!esGiroGratis) {
            cliente.creditos -= apuestaGasto;
        }

        // 4. GENERAR GIRO
        const rodillos = [tirarRodillo(), tirarRodillo(), tirarRodillo()];
        let premio = 0;
        const esGanador = (rodillos[0] === rodillos[1] && rodillos[1] === rodillos[2]);
        const simboloGanador = rodillos[0];

        // 5. CALCULAR PREMIO
        if (esGanador && tablaPremios[simboloGanador]) {
            premio = apuestaCalculoPremio * tablaPremios[simboloGanador];
            cliente.creditos += premio;
        }

        // 6. GUARDAR
        await cliente.save();

        // 7. RESPUESTA
        res.json({
            exito: true,
            rodillos: rodillos,
            premioGanado: premio,
            nuevoSaldo: cliente.creditos,
            esBonus: esGanador && simboloGanador === 'bonus'
        });

    } catch (error) {
        console.error("Error en la jugada del slot:", error);
        res.status(500).json({ exito: false, mensaje: "Error procesando la jugada" });
    }
});

// ==============================================================
// 5. MOTOR DEL SLOT PREMIUM (FÉNIX SLOTS)
// ==============================================================
const todosLosSimbolos = ['laud', 'bufon', 'zapatos', 'bonus', 'clavas', 'esfera'];

app.get('/api/obtener-saldo', async (req, res) => {
    try {
        const { usuario } = req.query;
        const cliente = await Cliente.findOne({ usuarioCasino: usuario }); 
        if (!cliente) return res.status(404).json({ exito: false, mensaje: "Usuario no encontrado" });
        res.json({ exito: true, saldo: cliente.creditos });
    } catch (error) { res.status(500).json({ exito: false, mensaje: "Error del servidor" }); }
});


/*app.use('/api', slotRoutes); // ESTO MONTA TODO LO QUE SEA /api/jugar-slot*/

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
// --- RUTA PARA CONFIGURACIÓN DE MINIJUEGOS ---
app.get('/api/configuracion-minijuegos', async (req, res) => {
    try {
        const minijuegos = await Minigame.find({});
        res.json({ success: true, minijuegos: minijuegos });
    } catch (e) {
        res.status(500).json({ success: false, message: "Error al cargar costos" });
    }
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

app.post('/api/canjear-producto', async (req, res) => {
    try {
        const { usuario, nombre, costo } = req.body;
        const cliente = await Cliente.findOne({ usuarioCasino: usuario });
        if (!cliente) return res.status(404).json({ exito: false, mensaje: "Usuario no encontrado" });
        if (cliente.creditos < costo) return res.status(400).json({ exito: false, mensaje: "Créditos insuficientes" });

        cliente.creditos -= costo;
        await cliente.save();
        res.json({ exito: true, nuevoSaldo: cliente.creditos });
    } catch (error) { res.status(500).json({ exito: false, mensaje: "Error al canjear el producto" }); }
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
// --- NUEVA RUTA: SOLICITAR RETIRO ---
app.post('/api/solicitar-retiro', async (req, res) => {
    try {
        const { usuario, monto, cbuAlias, titular } = req.body;
        const cliente = await Cliente.findOne({ usuarioCasino: usuario });

        if (!cliente) return res.status(404).json({ exito: false, mensaje: "Usuario no encontrado" });

        // 1. Lógica de las 24hs
        if (cliente.lastWithdrawal) {
            const hace24Horas = new Date(Date.now() - (24 * 60 * 60 * 1000));
            if (cliente.lastWithdrawal > hace24Horas) {
                // Calculamos cuánto tiempo falta para el próximo retiro
                const tiempoRestante = Math.ceil((cliente.lastWithdrawal.getTime() + (24 * 60 * 60 * 1000) - Date.now()) / (1000 * 60));
                const horas = Math.floor(tiempoRestante / 60);
                const minutos = tiempoRestante % 60;
                
                return res.status(400).json({ 
                    exito: false, 
                    mensaje: `⚠️ Recordá que es un retiro cada 24hs. Podrás retirar en ${horas}h ${minutos}m.` 
                });
            }
        }

        // 2. Si pasa la validación, creamos el retiro
        const nuevoRetiro = new Retiro({
            cliente: usuario,
            monto: monto,
            cbuAlias: cbuAlias,
            titular: titular
        });
        await nuevoRetiro.save();

        // 3. Actualizamos la fecha del último retiro del cliente
        cliente.lastWithdrawal = new Date();
        await cliente.save();

        res.json({ exito: true, mensaje: "Retiro solicitado exitosamente. El cajero lo procesará pronto." });

    } catch (error) {
        console.error("Error al solicitar retiro:", error);
        res.status(500).json({ exito: false, mensaje: "Error interno en el servidor" });
    }
});

// ==============================================================
// 6. IMPORTACIÓN DE RUTAS MODULARES
// ==============================================================
// 1. Primero cargamos todos los modelos
require('./models/User');
require('./models/Transaction');
require('./models/Minigame');
require('./models/Retiro'); // <--- Ponelo acá arriba con los otros

// 2. Luego cargamos las rutas y les pasamos los parámetros necesarios
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
            usuario.historial.push({ emisor: 'cliente', mensaje: datos.mensaje, leido: estaMirandome, hora: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
                });
            await Cliente.updateOne({ usuarioCasino: usuario.nombre }, { historialChat: usuario.historial });
            if (sharedState.adminSocketId) {
                io.to(sharedState.adminSocketId).emit('lista_usuarios_actualizada', sharedState.usuariosConectados);
                io.to(sharedState.adminSocketId).emit('actualizar_chat_activo', { nombre: usuario.nombre, historial: usuario.historial });
            }
            if (estaMirandome) socket.emit('tus_mensajes_fueron_leidos');
        }
    });
    socket.on('cliente_cambia_pestaña', async (datos) => {
        let usuario = sharedState.usuariosConectados.find(u => u.nombre === socket.username);
        if (usuario) {
            // Actualizamos el estado del usuario en el servidor con la pestaña que abrió
            usuario.estado = datos.pestaña; 
            
            // Opcional: Si querés guardar en la Base de Datos en qué sección quedó
            await Cliente.updateOne({ usuarioCasino: usuario.nombre }, { estado: datos.pestaña });
            
            // Le enviamos la lista con los estados frescos al Administrador al instante
            if (sharedState.adminSocketId) {
                io.to(sharedState.adminSocketId).emit('lista_usuarios_actualizada', sharedState.usuariosConectados);
            }
        }
    });

    socket.on('admin_envia_mensaje', async (datos) => {
        let usuario = sharedState.usuariosConectados.find(u => u.nombre === datos.paraUsuario);
        if (usuario) {
            usuario.historial.push({ emisor: 'admin', mensaje: datos.mensaje, leido: true, hora: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) });
            await Cliente.updateOne({ usuarioCasino: usuario.nombre }, { historialChat: usuario.historial });
            if(usuario.id) io.to(usuario.id).emit('recibir_mensaje_admin', { mensaje: datos.mensaje });
            socket.emit('actualizar_chat_activo', { nombre: usuario.nombre, historial: usuario.historial });
        }
    });

   socket.on('disconnect', () => {
        if (socket.username) {
            // NUEVO: Lo eliminamos por completo del array de conectados
            sharedState.usuariosConectados = sharedState.usuariosConectados.filter(u => u.nombre !== socket.username);
            
            if (sharedState.usuarioSeleccionadoActivoAdmin === socket.username) sharedState.usuarioSeleccionadoActivoAdmin = null;
            
            // Le avisamos al admin para que su pantalla lo borre al instante sin F5
            if (sharedState.adminSocketId) {
                io.to(sharedState.adminSocketId).emit('lista_usuarios_actualizada', sharedState.usuariosConectados);
            }
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
