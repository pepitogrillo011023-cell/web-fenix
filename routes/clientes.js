const mongoose = require('mongoose');

module.exports = function(app, requireLogin) {
    const Cliente = mongoose.model('Cliente');
    const PanelConfig = mongoose.model('PanelConfig');

    // ==============================================================
    // 🛠 RUTAS API (CONFIG / VALIDAR CLIENTE / IMPORTADOR)
    // ==============================================================
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
            res.status(500).json({ exito: false, mensaje: 'Error en inicio de sesión.' });
        }
    });

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
};
