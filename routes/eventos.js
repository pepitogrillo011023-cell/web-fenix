const mongoose = require('mongoose');

module.exports = function(app, requireLogin, io, sharedState) {
    const Cliente = mongoose.model('Cliente');
    const Ruleta = mongoose.model('Ruleta');
    const Raspa = mongoose.model('Raspa');
    const Tragamonedas = mongoose.model('Tragamonedas');
    const Cartas = mongoose.model('Cartas');
    const Moneda = mongoose.model('Moneda');

    // Función auxiliar reutilizable para avisar al panel
    const notificarPanelAdmin = async (usuario, cliente) => {
        const usuarioExistente = sharedState.usuariosConectados.find(u => u.nombre === usuario);
        if (usuarioExistente) {
            usuarioExistente.historial = cliente.historialChat;
            if (sharedState.adminSocketId) io.to(sharedState.adminSocketId).emit('actualizar_chat_activo', { nombre: usuario, historial: usuarioExistente.historial });
        }
        if (sharedState.adminSocketId) {
            const clientesDB = await Cliente.find();
            io.to(sharedState.adminSocketId).emit('cargar_datos_tablas', { clientes: clientesDB });
        }
    };

    // Función auxiliar para sacar el premio según probabilidad
    const calcularPremio = (configuracion) => {
        const rand = Math.random() * 100;
        let sum = 0;
        let premioGanado = configuracion[configuracion.length - 1];
        for (let item of configuracion) {
            sum += item.probabilidad;
            if (rand <= sum) { return item; }
        }
        return premioGanado;
    };

    // ==============================================================
    // 🎯 1. RULETA
    // ==============================================================
    app.post('/api/guardar-ruleta', requireLogin, async (req, res) => {
        try { await Ruleta.deleteMany({}); await new Ruleta({ configuracion: req.body.configuracion }).save(); res.json({ exito: true }); } catch (e) { res.json({ exito: false }); }
    });
    app.get('/api/ruleta-config', async (req, res) => {
        try { const db = await Ruleta.findOne(); res.json({ exito: true, config: db ? db.configuracion : [] }); } catch (e) { res.json({ exito: false }); }
    });
    app.post('/api/tirar-ruleta-prueba', requireLogin, (req, res) => {
        try { res.json({ exito: true, premio: calcularPremio(req.body.configuracion) }); } catch (e) { res.status(500).json({ exito: false }); }
    });
    app.post('/api/tirar-ruleta', async (req, res) => {
        try {
            const { usuario } = req.body; const cliente = await Cliente.findOne({ usuarioCasino: usuario });
            if (!cliente) return res.json({ exito: false, mensaje: 'Cliente no encontrado.' });
            
            const hoy = new Date(); const ult = cliente.ultimaRuleta;
            if (ult && ult.getDate() === hoy.getDate() && ult.getMonth() === hoy.getMonth() && ult.getFullYear() === hoy.getFullYear()) return res.json({ exito: false, mensaje: '❌ Ya usaste tu tiro diario.' });
            
            const db = await Ruleta.findOne();
            if (!db || db.configuracion.length === 0) return res.json({ exito: false, mensaje: 'En mantenimiento.' });

            const premio = calcularPremio(db.configuracion);
            cliente.saldo += premio.valor; cliente.ultimaRuleta = hoy;
            
            const msgBot = `🎰 ¡La ruleta frenó en <b>${premio.premio}</b>!<br>Se acreditaron <b>$${premio.valor}</b>.`;
            cliente.historialChat.push({ emisor: 'bot', mensaje: msgBot, leido: true });
            await cliente.save();
            await notificarPanelAdmin(usuario, cliente);
            res.json({ exito: true, mensaje: msgBot, premio: premio });
        } catch (e) { res.status(500).json({ exito: false }); }
    });

    // ==============================================================
    // 🎫 2. RASPA Y GANA
    // ==============================================================
    app.post('/api/guardar-raspa', requireLogin, async (req, res) => {
        try { await Raspa.deleteMany({}); await new Raspa({ configuracion: req.body.configuracion }).save(); res.json({ exito: true }); } catch (e) { res.json({ exito: false }); }
    });
    app.get('/api/raspa-config', async (req, res) => {
        try { const db = await Raspa.findOne(); res.json({ exito: true, config: db ? db.configuracion : [] }); } catch (e) { res.json({ exito: false }); }
    });
    app.post('/api/tirar-raspa-prueba', requireLogin, (req, res) => {
        try { res.json({ exito: true, premio: calcularPremio(req.body.configuracion) }); } catch (e) { res.status(500).json({ exito: false }); }
    });
    app.post('/api/tirar-raspa', async (req, res) => {
        try {
            const { usuario } = req.body; const cliente = await Cliente.findOne({ usuarioCasino: usuario });
            if (!cliente) return res.json({ exito: false, mensaje: 'Cliente no encontrado.' });
            
            const hoy = new Date(); const ult = cliente.ultimaRaspa;
            if (ult && ult.getDate() === hoy.getDate() && ult.getMonth() === hoy.getMonth() && ult.getFullYear() === hoy.getFullYear()) return res.json({ exito: false, mensaje: '❌ Ya raspaste hoy.' });
            
            const db = await Raspa.findOne();
            if (!db || db.configuracion.length === 0) return res.json({ exito: false, mensaje: 'En mantenimiento.' });

            const premio = calcularPremio(db.configuracion);
            cliente.saldo += premio.valor; cliente.ultimaRaspa = hoy;
            
            const msgBot = `🎫 ¡Descubriste una tarjeta de Raspa y Gana!<br>Premio: <b>${premio.premio}</b>.<br>Se acreditaron <b>$${premio.valor}</b>.`;
            cliente.historialChat.push({ emisor: 'bot', mensaje: msgBot, leido: true });
            await cliente.save();
            await notificarPanelAdmin(usuario, cliente);
            res.json({ exito: true, mensaje: msgBot, premio: premio });
        } catch (e) { res.status(500).json({ exito: false }); }
    });

    // ==============================================================
    // 🍒 3. TRAGAMONEDAS
    // ==============================================================
    app.post('/api/guardar-tragamonedas', requireLogin, async (req, res) => {
        try { await Tragamonedas.deleteMany({}); await new Tragamonedas({ configuracion: req.body.configuracion }).save(); res.json({ exito: true }); } catch (e) { res.json({ exito: false }); }
    });
    app.get('/api/tragamonedas-config', async (req, res) => {
        try { const db = await Tragamonedas.findOne(); res.json({ exito: true, config: db ? db.configuracion : [] }); } catch (e) { res.json({ exito: false }); }
    });
    app.post('/api/tirar-tragamonedas-prueba', requireLogin, (req, res) => {
        try { res.json({ exito: true, premio: calcularPremio(req.body.configuracion) }); } catch (e) { res.status(500).json({ exito: false }); }
    });
    app.post('/api/tirar-tragamonedas', async (req, res) => {
        try {
            const { usuario } = req.body; const cliente = await Cliente.findOne({ usuarioCasino: usuario });
            if (!cliente) return res.json({ exito: false, mensaje: 'Cliente no encontrado.' });
            
            const hoy = new Date(); const ult = cliente.ultimaTragamonedas;
            if (ult && ult.getDate() === hoy.getDate() && ult.getMonth() === hoy.getMonth() && ult.getFullYear() === hoy.getFullYear()) return res.json({ exito: false, mensaje: '❌ Ya giraste los rodillos hoy.' });
            
            const db = await Tragamonedas.findOne();
            if (!db || db.configuracion.length === 0) return res.json({ exito: false, mensaje: 'En mantenimiento.' });

            const premio = calcularPremio(db.configuracion);
            cliente.saldo += premio.valor; cliente.ultimaTragamonedas = hoy;
            
            const msgBot = `🍒 ¡El Tragamonedas formó la línea ganadora!<br>Salió: <b>${premio.premio}</b>.<br>Sumaste <b>$${premio.valor}</b>.`;
            cliente.historialChat.push({ emisor: 'bot', mensaje: msgBot, leido: true });
            await cliente.save();
            await notificarPanelAdmin(usuario, cliente);
            res.json({ exito: true, mensaje: msgBot, premio: premio });
        } catch (e) { res.status(500).json({ exito: false }); }
    });

    // ==============================================================
    // 🃏 4. CARTA DE LA SUERTE
    // ==============================================================
    app.post('/api/guardar-cartas', requireLogin, async (req, res) => {
        try { await Cartas.deleteMany({}); await new Cartas({ configuracion: req.body.configuracion }).save(); res.json({ exito: true }); } catch (e) { res.json({ exito: false }); }
    });
    app.get('/api/cartas-config', async (req, res) => {
        try { const db = await Cartas.findOne(); res.json({ exito: true, config: db ? db.configuracion : [] }); } catch (e) { res.json({ exito: false }); }
    });
    app.post('/api/tirar-cartas-prueba', requireLogin, (req, res) => {
        try { res.json({ exito: true, premio: calcularPremio(req.body.configuracion) }); } catch (e) { res.status(500).json({ exito: false }); }
    });
    app.post('/api/tirar-cartas', async (req, res) => {
        try {
            const { usuario } = req.body; const cliente = await Cliente.findOne({ usuarioCasino: usuario });
            if (!cliente) return res.json({ exito: false, mensaje: 'Cliente no encontrado.' });
            
            const hoy = new Date(); const ult = cliente.ultimaCarta;
            if (ult && ult.getDate() === hoy.getDate() && ult.getMonth() === hoy.getMonth() && ult.getFullYear() === hoy.getFullYear()) return res.json({ exito: false, mensaje: '❌ Ya elegiste tu carta hoy.' });
            
            const db = await Cartas.findOne();
            if (!db || db.configuracion.length === 0) return res.json({ exito: false, mensaje: 'En mantenimiento.' });

            const premio = calcularPremio(db.configuracion);
            cliente.saldo += premio.valor; cliente.ultimaCarta = hoy;
            
            const msgBot = `🃏 ¡Diste vuelta tu Carta de la Suerte!<br>Sacaste: <b>${premio.premio}</b>.<br>Ganaste <b>$${premio.valor}</b>.`;
            cliente.historialChat.push({ emisor: 'bot', mensaje: msgBot, leido: true });
            await cliente.save();
            await notificarPanelAdmin(usuario, cliente);
            res.json({ exito: true, mensaje: msgBot, premio: premio });
        } catch (e) { res.status(500).json({ exito: false }); }
    });

    // ==============================================================
    // 🪙 5. CARA O CRUZ
    // ==============================================================
    app.post('/api/guardar-moneda', requireLogin, async (req, res) => {
        try { await Moneda.deleteMany({}); await new Moneda({ configuracion: req.body.configuracion }).save(); res.json({ exito: true }); } catch (e) { res.json({ exito: false }); }
    });
    app.get('/api/moneda-config', async (req, res) => {
        try { const db = await Moneda.findOne(); res.json({ exito: true, config: db ? db.configuracion : [] }); } catch (e) { res.json({ exito: false }); }
    });
    app.post('/api/tirar-moneda-prueba', requireLogin, (req, res) => {
        try { res.json({ exito: true, premio: calcularPremio(req.body.configuracion) }); } catch (e) { res.status(500).json({ exito: false }); }
    });
    app.post('/api/tirar-moneda', async (req, res) => {
        try {
            const { usuario } = req.body; const cliente = await Cliente.findOne({ usuarioCasino: usuario });
            if (!cliente) return res.json({ exito: false, mensaje: 'Cliente no encontrado.' });
            
            const hoy = new Date(); const ult = cliente.ultimaMoneda;
            if (ult && ult.getDate() === hoy.getDate() && ult.getMonth() === hoy.getMonth() && ult.getFullYear() === hoy.getFullYear()) return res.json({ exito: false, mensaje: '❌ Ya lanzaste la moneda hoy.' });
            
            const db = await Moneda.findOne();
            if (!db || db.configuracion.length === 0) return res.json({ exito: false, mensaje: 'En mantenimiento.' });

            const premio = calcularPremio(db.configuracion);
            cliente.saldo += premio.valor; cliente.ultimaMoneda = hoy;
            
            const msgBot = `🪙 ¡La moneda cayó!<br>Lado ganador: <b>${premio.premio}</b>.<br>Se acreditaron <b>$${premio.valor}</b>.`;
            cliente.historialChat.push({ emisor: 'bot', mensaje: msgBot, leido: true });
            await cliente.save();
            await notificarPanelAdmin(usuario, cliente);
            res.json({ exito: true, mensaje: msgBot, premio: premio });
        } catch (e) { res.status(500).json({ exito: false }); }
    });
};
