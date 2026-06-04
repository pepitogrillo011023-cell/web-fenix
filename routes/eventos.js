const mongoose = require('mongoose');
const Minigame = require('../models/Minigame'); // Importamos el modelo para los costos de créditos

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
            
            // Lógica de Tiro Diario o Cobro de Créditos
            const hoy = new Date(); const ult = cliente.ultimaRuleta;
            let esTiroGratis = true;
            if (ult && ult.getDate() === hoy.getDate() && ult.getMonth() === hoy.getMonth() && ult.getFullYear() === hoy.getFullYear()) {
                esTiroGratis = false;
            }

            if (!esTiroGratis) {
                const gameInfo = await Minigame.findOne({ name: 'Ruleta' });
                const costo = gameInfo ? gameInfo.creditCost : 10;
                if (!cliente.creditos || cliente.creditos < costo) {
                    return res.json({ exito: false, mensaje: `❌ Ya usaste tu tiro gratis. Necesitas ${costo} Créditos para jugar otra vez.` });
                }
                cliente.creditos -= costo;
            } else {
                cliente.ultimaRuleta = hoy;
            }
            
            const db = await Ruleta.findOne();
            if (!db || db.configuracion.length === 0) return res.json({ exito: false, mensaje: 'En mantenimiento.' });

            const premio = calcularPremio(db.configuracion);
            cliente.saldo += premio.valor; 
            
            const msgExtra = !esTiroGratis ? " (Tirada con Créditos)" : " (Tiro Gratis)";
            const msgBot = `🎰 ¡La ruleta frenó en <b>${premio.premio}</b>!${msgExtra}<br>Se acreditaron <b>$${premio.valor}</b>.`;
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
            
            // Lógica de Tiro Diario o Cobro de Créditos
            const hoy = new Date(); const ult = cliente.ultimaRaspa;
            let esTiroGratis = true;
            if (ult && ult.getDate() === hoy.getDate() && ult.getMonth() === hoy.getMonth() && ult.getFullYear() === hoy.getFullYear()) {
                esTiroGratis = false;
            }

            if (!esTiroGratis) {
                const gameInfo = await Minigame.findOne({ name: 'Raspa' });
                const costo = gameInfo ? gameInfo.creditCost : 5;
                if (!cliente.creditos || cliente.creditos < costo) {
                    return res.json({ exito: false, mensaje: `❌ Ya raspaste gratis hoy. Necesitas ${costo} Créditos para raspar de nuevo.` });
                }
                cliente.creditos -= costo;
            } else {
                cliente.ultimaRaspa = hoy;
            }
            
            const db = await Raspa.findOne();
            if (!db || db.configuracion.length === 0) return res.json({ exito: false, mensaje: 'En mantenimiento.' });

            const premio = calcularPremio(db.configuracion);
            cliente.saldo += premio.valor; 
            
            const msgExtra = !esTiroGratis ? " (Jugada con Créditos)" : " (Tiro Gratis)";
            const msgBot = `🎫 ¡Descubriste una tarjeta de Raspa y Gana!${msgExtra}<br>Premio: <b>${premio.premio}</b>.<br>Se acreditaron <b>$${premio.valor}</b>.`;
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
            
            // Lógica de Tiro Diario o Cobro de Créditos
            const hoy = new Date(); const ult = cliente.ultimaTragamonedas;
            let esTiroGratis = true;
            if (ult && ult.getDate() === hoy.getDate() && ult.getMonth() === hoy.getMonth() && ult.getFullYear() === hoy.getFullYear()) {
                esTiroGratis = false;
            }

            if (!esTiroGratis) {
                const gameInfo = await Minigame.findOne({ name: 'Tragamonedas' });
                const costo = gameInfo ? gameInfo.creditCost : 10;
                if (!cliente.creditos || cliente.creditos < costo) {
                    return res.json({ exito: false, mensaje: `❌ Ya giraste gratis hoy. Necesitas ${costo} Créditos para otra ronda.` });
                }
                cliente.creditos -= costo;
            } else {
                cliente.ultimaTragamonedas = hoy;
            }
            
            const db = await Tragamonedas.findOne();
            if (!db || db.configuracion.length === 0) return res.json({ exito: false, mensaje: 'En mantenimiento.' });

            const premio = calcularPremio(db.configuracion);
            cliente.saldo += premio.valor; 
            
            const msgExtra = !esTiroGratis ? " (Jugada con Créditos)" : " (Tiro Gratis)";
            const msgBot = `🍒 ¡El Tragamonedas formó la línea ganadora!${msgExtra}<br>Salió: <b>${premio.premio}</b>.<br>Sumaste <b>$${premio.valor}</b>.`;
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
            
            // Lógica de Tiro Diario o Cobro de Créditos
            const hoy = new Date(); const ult = cliente.ultimaCarta;
            let esTiroGratis = true;
            if (ult && ult.getDate() === hoy.getDate() && ult.getMonth() === hoy.getMonth() && ult.getFullYear() === hoy.getFullYear()) {
                esTiroGratis = false;
            }

            if (!esTiroGratis) {
                const gameInfo = await Minigame.findOne({ name: 'Cartas' });
                const costo = gameInfo ? gameInfo.creditCost : 5;
                if (!cliente.creditos || cliente.creditos < costo) {
                    return res.json({ exito: false, mensaje: `❌ Ya elegiste carta gratis hoy. Necesitas ${costo} Créditos para sacar otra.` });
                }
                cliente.creditos -= costo;
            } else {
                cliente.ultimaCarta = hoy;
            }
            
            const db = await Cartas.findOne();
            if (!db || db.configuracion.length === 0) return res.json({ exito: false, mensaje: 'En mantenimiento.' });

            const premio = calcularPremio(db.configuracion);
            cliente.saldo += premio.valor; 
            
            const msgExtra = !esTiroGratis ? " (Jugada con Créditos)" : " (Tiro Gratis)";
            const msgBot = `🃏 ¡Diste vuelta tu Carta de la Suerte!${msgExtra}<br>Sacaste: <b>${premio.premio}</b>.<br>Ganaste <b>$${premio.valor}</b>.`;
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
            
            // Lógica de Tiro Diario o Cobro de Créditos
            const hoy = new Date(); const ult = cliente.ultimaMoneda;
            let esTiroGratis = true;
            if (ult && ult.getDate() === hoy.getDate() && ult.getMonth() === hoy.getMonth() && ult.getFullYear() === hoy.getFullYear()) {
                esTiroGratis = false;
            }

            if (!esTiroGratis) {
                const gameInfo = await Minigame.findOne({ name: 'Moneda' });
                const costo = gameInfo ? gameInfo.creditCost : 2;
                if (!cliente.creditos || cliente.creditos < costo) {
                    return res.json({ exito: false, mensaje: `❌ Ya lanzaste la moneda gratis hoy. Necesitas ${costo} Créditos para volver a lanzar.` });
                }
                cliente.creditos -= costo;
            } else {
                cliente.ultimaMoneda = hoy;
            }
            
            const db = await Moneda.findOne();
            if (!db || db.configuracion.length === 0) return res.json({ exito: false, mensaje: 'En mantenimiento.' });

            const premio = calcularPremio(db.configuracion);
            cliente.saldo += premio.valor; 
            
            const msgExtra = !esTiroGratis ? " (Lanzamiento con Créditos)" : " (Tiro Gratis)";
            const msgBot = `🪙 ¡La moneda cayó!${msgExtra}<br>Lado ganador: <b>${premio.premio}</b>.<br>Se acreditaron <b>$${premio.valor}</b>.`;
            cliente.historialChat.push({ emisor: 'bot', mensaje: msgBot, leido: true });
            
            await cliente.save();
            await notificarPanelAdmin(usuario, cliente);
            res.json({ exito: true, mensaje: msgBot, premio: premio });
        } catch (e) { res.status(500).json({ exito: false }); }
    });

    // ==============================================================
    // ⚙️ 6. CONFIGURACIÓN DE COSTOS DE MINIJUEGOS (NUEVO BLOQUE ADMIN)
    // ==============================================================
    app.get('/api/configuracion-minijuegos', requireLogin, async (req, res) => {
        try {
            const minijuegos = await Minigame.find();
            res.json({ success: true, minijuegos });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al obtener la configuración de los minijuegos.', error });
        }
    });

    app.post('/api/actualizar-costo-minijuego', requireLogin, async (req, res) => {
        try {
            const { minigameId, nuevoCosto } = req.body;
            const minijuego = await Minigame.findById(minigameId);
            if (!minijuego) {
                return res.status(404).json({ success: false, message: 'Minijuego no encontrado.' });
            }
            minijuego.creditCost = nuevoCosto;
            await minijuego.save();
            res.json({ success: true, message: `Costo de ${minijuego.name} actualizado. Nuevo costo: ${nuevoCosto} créditos.` });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al actualizar el costo del minijuego.', error });
        }
    });

    app.post('/api/crear-minijuego', requireLogin, async (req, res) => {
        try {
            const { name, creditCost } = req.body;
            const nuevoMinijuego = new Minigame({ name, creditCost });
            await nuevoMinijuego.save();
            res.json({ success: true, message: 'Minijuego registrado exitosamente.', minijuego: nuevoMinijuego });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al crear el minijuego.', error });
        }
    });
};
