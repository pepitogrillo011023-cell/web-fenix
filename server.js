require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const express = require('express');
const app = express();

// --- AQUÍ VA EL CÓDIGO DE PROTECCIÓN QUE TE PASÉ ---
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

// --- RUTA PROTEGIDA ---
app.get('/admin.html', auth, (req, res) => {
    res.sendFile(__dirname + '/public/admin.html');
});

app.use(express.static('Public'));

// --------------------------------------------------------
// 🟢 CONEXIÓN A LA BASE DE DATOS MONGODB
// --------------------------------------------------------
if(process.env.MONGO_URI && process.env.MONGO_URI !== 'AQUI_VA_TU_ENLACE_DE_MONGODB') {
    mongoose.connect(process.env.MONGO_URI, { family: 4 })
        .then(async () => {
            console.log('🟢 CONECTADO A MONGODB (Base de Datos Activa y Grabando)');
            // Creamos datos simulados de prueba si la base de datos está vacía para llenar tus pestañas
            await inicializarDatosDePrueba();
        })
        .catch(err => console.log('🔴 ERROR DE MONGODB:', err));
} else {
    console.log('🟡 MONGODB EN ESPERA: Falta configurar el enlace real en el archivo .env');
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
    
    // Al conectar el Admin, le traemos todo desde MongoDB en tiempo real
    socket.on('identificar_admin', async () => {
        adminSocketId = socket.id;
        socket.emit('lista_usuarios_actualizada', usuariosConectados);
        
        // Enviamos los datos reales guardados en la base de datos al panel administrador
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
                
                // Guardamos la lectura reflejada en MongoDB
                await Cliente.updateOne({ usuarioCasino: usuario.nombre }, { historialChat: usuario.historial });
                if (usuario.id) io.to(usuario.id).emit('tus_mensajes_fueron_leidos');
            }
        }
        if (adminSocketId) io.to(adminSocketId).emit('lista_usuarios_actualizada', usuariosConectados);
    });

    // Identificación y persistencia de Chat del Cliente con MongoDB
    socket.on('identificar_usuario', async (datos) => {
        socket.username = datos.usuario;
        
        // 1. Buscamos si el cliente ya existe en la base de datos de MongoDB
        let clienteDB = await Cliente.findOne({ usuarioCasino: datos.usuario });
        
        if (!clienteDB) {
            // Si es nuevo, lo creamos e insertamos el mensaje inicial
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
            usuarioExistente.historial = clienteDB.historialChat; // Recupera chat viejo de la DB
        }
        
        socket.emit('resultado_validacion', { exito: true, usuario: datos.usuario, historial: clienteDB.historialChat });
        if (adminSocketId) {
            io.to(adminSocketId).emit('lista_usuarios_actualizada', usuariosConectados);
            // Actualizamos la tabla de clientes en vivo por si cambió su última conexión
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

            // Guardamos el nuevo mensaje en MongoDB de forma permanente
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

            // Guardamos el texto libre del cliente en MongoDB
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
            
            // Guardamos la respuesta del admin en MongoDB
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

// Función auxiliar para sembrar datos reales en tu panel desde MongoDB si está en blanco
async function inicializarDatosDePrueba() {
    const countCl = await Cliente.countDocuments();
    if(countCl === 0) {
        await new Cliente({ usuarioCasino: 'joniz115', saldo: 60000, wager: 10000, estado: 'Activo' }).save();
        await new Cliente({ usuarioCasino: 'axel032704', saldo: 3000, wager: 0, estado: 'Activo' }).save();
        await new Cliente({ usuarioCasino: 'camilta', saldo: 0, wager: 0, estado: 'Soporte' }).save();
    }
    const countRet = await Retiro.countDocuments();
    if(countRet === 0) {
        await new Retiro({ cliente: 'yanina21667', monto: 30900, cbuAlias: '0000013000032318656943', titular: 'YANINA PATRICIA GALLARDO', estado: 'Aprobado (Enviado)' }).save();
        await new Retiro({ cliente: 'Alexz33515', monto: 17400, cbuAlias: '0000003100061568003829', titular: 'ALEXIS SANCHEZ', estado: 'Rechazado (Error saldo)', procesadoPor: 'Admin (Manual)' }).save();
    }
    const countUs = await UsuarioInterno.countDocuments();
    if(countUs === 0) {
        await new UsuarioInterno({ nombre: 'Admin clubzeus', usuario: 'admin', email: 'admin@clubzeus.local', rol: 'Master' }).save();
        await new UsuarioInterno({ nombre: 'Flor Cajera', usuario: 'jorgue33', email: 'jorge@gmail.com', rol: 'Usuario' }).save();
    }
}

const PUERTO = process.env.PUERTO || 3000;
server.listen(PUERTO, () => {
    console.log('=============================================');
    console.log(`🚀 SERVIDOR VINCULADO AL PANEL EN PUERTO ${PUERTO}`);
    console.log('=============================================');
});
