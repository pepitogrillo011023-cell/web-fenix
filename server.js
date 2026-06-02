require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const session = require('express-session'); 
const puppeteer = require('puppeteer'); // NUEVO: Librería del Bot Invisible

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- CONFIGURACIÓN DE SESIÓN (LOGIN) Y MIDDLEWARES ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); 
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

// --------------------------------------------------------
// 🤖 BOT INVISIBLE: CONEXIÓN EN TIEMPO REAL CON GANAMOS.NET
// --------------------------------------------------------
async function operarGanamosNet(usuarioJugador, monto) {
    // 1. Abrimos el Chrome Fantasma
    const browser = await puppeteer.launch({ 
        headless: true, // Cambiá a 'false' si querés ver cómo lo hace en vivo en tu pantalla
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    
    try {
        const page = await browser.newPage();
        
        // 2. IR AL LOGIN (⚠️ IMPORTANTÍSIMO: Cambiá esta URL por la página real de login de Ganamos)
        await page.goto('https://agents.ganamosnet.org/'); 
        
        // Suponemos que los campos se llaman "username" y "password". 
        // Si fallara el login, hay que inspeccionar esos casilleros también.
        await page.waitForSelector('input[name="Usuario"]', { timeout: 5000 }); 
        await page.type('input[name="Usuario"]', process.env.GANAMOS_USER || 'Fenix80');
        await page.type('input[name="Contraseña"]', process.env.GANAMOS_PASS || 'Cipriano123');
        await page.keyboard.press('Enter');
        
        await page.waitForNavigation(); // Esperamos que cargue el inicio
        
        // 3. IR A LA SECCIÓN DE USUARIOS (⚠️ Cambiá por la URL donde ves la tabla de jugadores)
        await page.goto('https://agents.ganamosnet.org/users/all'); 
        
        // 4. BUSCAR AL USUARIO (Código que vos me pasaste)
        await page.waitForSelector('input[placeholder="Buscar Usuario"]');
        await page.type('input[placeholder="Buscar Usuario"]', usuarioJugador);
        
        // Esperamos 2 segundos para que la tabla filtre al usuario correcto
        await new Promise(r => setTimeout(r, 2000));
        
        // 5. HACER CLIC EN DEPOSITAR (Busca href dinámico)
        await page.waitForSelector('a[href^="/user/deposit/"]');
        await page.click('a[href^="/user/deposit/"]');
        
        // 6. ESCRIBIR EL MONTO
        await page.waitForSelector('input[name="amount"]');
        await page.type('input[name="amount"]', monto.toString());
        
        // 7. CONFIRMAR LA CARGA
        await page.waitForSelector('button[type="submit"]');
        await page.click('button[type="submit"]');
        
        // Esperamos 2 segundos para que Ganamos procese la transacción
        await new Promise(r => setTimeout(r, 2000));
        
        await browser.close();
        return { exito: true };
        
    } catch (error) {
        console.error("🔴 Error en el bot de Ganamos:", error);
        await browser.close();
        return { exito: false, error: error.message };
    }
}

// --- RUTA PARA QUE TU PANEL LE ORDENE AL BOT CARGAR FICHAS ---
app.post('/api/cargar-saldo', requireLogin, async (req, res) => {
    const { usuario, monto } = req.body;
    
    // Disparamos el bot invisible
    const resultado = await operarGanamosNet(usuario, monto);
    
    if (resultado.exito) {
        // Le sumamos el saldo en tu MongoDB local
        await Cliente.updateOne(
            { usuarioCasino: usuario }, 
            { $inc: { saldo: monto } }
        );
        res.json({ exito: true, mensaje: `¡Acreditados $${monto} a ${usuario} en tiempo real!` });
    } else {
        res.status(500).json({ exito: false, mensaje: 'El bot falló al entrar a Ganamos.net.' });
    }
});

// --- RUTA DE IMPORTACIÓN DE DATOS MASIVA (La que ya andaba perfecto) ---
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
                            { $set: { saldo: saldoNumerico, estado: 'Activo' } }, 
                            { upsert: true }
                        );
                        actualizados++;
                    }
                }
            }
        }
        res.json({ mensaje: `¡Se actualizaron ${actualizados} usuarios de Casino Fénix!` });
    } catch (error) {
        res.status(500).json({ mensaje: 'Hubo un error en el servidor.' });
    }
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
// 📝 MODELOS DE DATOS DE MONGODB
// --------------------------------------------------------
const clienteSchema = new mongoose.Schema({
    usuarioCasino: { type: String, required: true, unique: true },
    saldo: { type: Number, default: 0 },
    wager: { type: Number, default: 0 },
    estado: { type: String, default: 'Activo' },
    historialChat: { type: Array, default: [] },
    ultimaConexion: { type: Date, default: Date.now }
});
const Cliente = mongoose.model('Cliente', clienteSchema);

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
            
            socket.emit('cargar_datos_tablas', {
                clientes: clientesDB,
                retiros: retirosDB,
                usuariosInternos: internosDB
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
}

const PUERTO = process.env.PUERTO || 3000;
server.listen(PUERTO, () => {
    console.log('=============================================');
    console.log(`🚀 SERVIDOR VINCULADO AL PANEL EN PUERTO ${PUERTO}`);
    console.log('=============================================');
});
