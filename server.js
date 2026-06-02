require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const session = require('express-session'); 
const fs = require('fs'); // Para manejar la carpeta de la foto
const path = require('path');

// --- LA ARTILLERÍA PESADA: PUPPETEER STEALTH ---
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin()); 

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
    res.sendFile(__dirname + '/public/admin.html');
});

// --------------------------------------------------------
// 🤖 BOT INVISIBLE CON CÁMARA DE SEGURIDAD
// --------------------------------------------------------
async function operarGanamosNet(usuarioJugador, monto) {
    let browser;
    let page; // Lo declaramos acá para poder sacarle foto en el catch si falla
    
    try {
        browser = await puppeteer.launch({ 
            headless: true, // "true" funciona mejor con Stealth en la versión 22
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--window-size=1920,1080'
            ] 
        });
        
        // USAMOS LA PESTAÑA PRINCIPAL (Así el radar no se confunde)
        const pages = await browser.pages();
        page = pages[0];
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // 2. IR AL LOGIN
        await page.goto('https://agents.ganamosnet.org/', { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // --- LOGIN ---
        await page.waitForSelector('input[placeholder="Nombre"], input[type="text"]', { timeout: 15000 }); 
        await page.type('input[placeholder="Nombre"], input[type="text"]', process.env.GANAMOS_USER || 'Fenix80');
        
        await page.waitForSelector('input[type="password"]');
        await page.type('input[type="password"]', process.env.GANAMOS_PASS || 'Cipriano123');
        
        await page.keyboard.press('Enter');
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 });
        
        // 3. IR A LA SECCIÓN DE USUARIOS
        await page.goto('https://agents.ganamosnet.org/users/all', { waitUntil: 'domcontentloaded' });
        
        // 4. BUSCAR AL USUARIO
        await page.waitForSelector('input[placeholder="Buscar Usuario"]');
        await page.type('input[placeholder="Buscar Usuario"]', usuarioJugador);
        await new Promise(r => setTimeout(r, 2000));
        
        // 5. HACER CLIC EN DEPOSITAR
        await page.waitForSelector('a[href^="/user/deposit/"]');
        await page.click('a[href^="/user/deposit/"]');
        
        // 6. ESCRIBIR EL MONTO
        await page.waitForSelector('input[name="amount"]');
        await page.type('input[name="amount"]', monto.toString());
        
        // 7. CONFIRMAR LA CARGA
        await page.waitForSelector('button[type="submit"]');
        await page.click('button[type="submit"]');
        
        await new Promise(r => setTimeout(r, 2000));
        await browser.close();
        return { exito: true };
        
    } catch (error) {
        // --- LA CÁMARA DE SEGURIDAD ---
        if (page) {
            console.log("🔴 TOMANDO FOTO DEL ERROR...");
            try {
                const dir = path.join(__dirname, 'public');
                if (!fs.existsSync(dir)){ fs.mkdirSync(dir); } // Crea la carpeta public si no existe
                
                await page.screenshot({ path: path.join(dir, 'error-bot.png'), fullPage: true });
                console.log("📸 ¡FOTO GUARDADA! Mirala entrando a: https://casino-fenix.onrender.com/error-bot.png");
                console.log("URL DONDE FALLÓ:", page.url());
            } catch(e) {
                console.log("No se pudo sacar la foto:", e);
            }
        }
        if (browser) await browser.close();
        console.error("🔴 Error DETALLADO:", error.message);
        return { exito: false, error: error.message };
    }
}

// --- RUTA PARA QUE TU PANEL LE ORDENE AL BOT CARGAR FICHAS ---
app.post('/api/cargar-saldo', requireLogin, async (req, res) => {
    const { usuario, monto } = req.body;
    const resultado = await operarGanamosNet(usuario, monto);
    
    if (resultado.exito) {
        await Cliente.updateOne(
            { usuarioCasino: usuario }, 
            { $inc: { saldo: monto } }
        );
        res.json({ exito: true, mensaje: `¡Acreditados $${monto} a ${usuario} en tiempo real!` });
    } else {
        res.status(500).json({ exito: false, mensaje: 'El bot falló al entrar a Ganamos.net.' });
    }
});

// --- RUTA DE IMPORTACIÓN DE DATOS MASIVA ---
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

const PUERTO = process.env.PORT || 3000;
server.listen(PUERTO, () => {
    console.log('=============================================');
    console.log(`🚀 SERVIDOR VINCULADO AL PANEL EN PUERTO ${PUERTO}`);
    console.log('=============================================');
});
