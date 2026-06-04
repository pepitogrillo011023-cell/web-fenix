const mongoose = require('mongoose');

module.exports = function(app, requireLogin, io, sharedState) {
    const Cliente = mongoose.model('Cliente');
    const Ruleta = mongoose.model('Ruleta');
    const Raspa = mongoose.model('Raspa');

    // ==============================================================
    // 🎲 RUTAS DE EVENTOS (RULETA / RASPA)
    // ==============================================================
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

            const usuarioExistente = sharedState.usuariosConectados.find(u => u.nombre === usuario);
            if (usuarioExistente) {
                usuarioExistente.historial = cliente.historialChat;
                if (sharedState.adminSocketId) io.to(sharedState.adminSocketId).emit('actualizar_chat_activo', { nombre: usuario, historial: usuarioExistente.historial });
            }
            if (sharedState.adminSocketId) {
                const clientesDB = await Cliente.find();
                io.to(sharedState.adminSocketId).emit('cargar_datos_tablas', { clientes: clientesDB });
            }

            res.json({ exito: true, mensaje: msgBot, premio: premioGanado });
        } catch (error) {
            res.status(500).json({ exito: false });
        }
    });

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

            const usuarioExistente = sharedState.usuariosConectados.find(u => u.nombre === usuario);
            if (usuarioExistente) {
                usuarioExistente.historial = cliente.historialChat;
                if (sharedState.adminSocketId) io.to(sharedState.adminSocketId).emit('actualizar_chat_activo', { nombre: usuario, historial: usuarioExistente.historial });
            }
            if (sharedState.adminSocketId) {
                const clientesDB = await Cliente.find();
                io.to(sharedState.adminSocketId).emit('cargar_datos_tablas', { clientes: clientesDB });
            }

            res.json({ exito: true, mensaje: msgBot, premio: premioGanado });
        } catch (error) {
            res.status(500).json({ exito: false });
        }
    });
};
