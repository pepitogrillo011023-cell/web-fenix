const mongoose = require('mongoose');

module.exports = function(app, requireLogin, io, sharedState) {
    const Cliente = mongoose.model('Cliente');
    const PanelConfig = mongoose.model('PanelConfig');

    // ==============================================================
    // 👤 NUEVA RUTA: REGISTRO DE CLIENTES (SIGN UP)
    // ==============================================================
    app.post('/api/registrar-cliente', async (req, res) => {
        try {
            const { usuario, password } = req.body;
            
            // 1. Verificamos si el usuario ya existe
            const existe = await Cliente.findOne({ usuarioCasino: usuario });
            if (existe) {
                return res.json({ exito: false, mensaje: 'Ese usuario ya existe. Por favor, elegí otro nombre.' });
            }

            // 2. Creamos el nuevo cliente en MongoDB
            const nuevoCliente = new Cliente({
                usuarioCasino: usuario,
                password: password,
                saldo: 0,
                estado: 'Activo',
                historialChat: [{ emisor: 'bot', mensaje: `¡Bienvenido a Casino Fénix, ${usuario}! Ya podés jugar y comunicarte con el soporte.`, leido: true }]
            });
            
            await nuevoCliente.save();

            // 3. Avisamos al panel de Admin que hay un usuario nuevo para que actualice la tabla en vivo
            if (sharedState && sharedState.adminSocketId && io) {
                const clientesDB = await Cliente.find();
                io.to(sharedState.adminSocketId).emit('cargar_datos_tablas', { clientes: clientesDB });
            }

            res.json({ exito: true, mensaje: 'Usuario creado exitosamente.' });
        } catch (error) {
            res.status(500).json({ exito: false, mensaje: 'Error al registrar el usuario.' });
        }
    });

    // ==============================================================
    // 🔐 RUTAS EXISTENTES DE CLIENTES Y CONFIGURACIÓN
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

    // ==============================================================
    // ✏️ NUEVA RUTA: EDITAR CLIENTE (PANEL ADMIN)
    // ==============================================================
    app.post('/api/editar-cliente', requireLogin, async (req, res) => {
        try {
            const { id, nuevoUser, nuevaPass } = req.body;
            
            // 1. Verificar que no se intente usar un nombre que ya pertenece a otro
            const existeUser = await Cliente.findOne({ usuarioCasino: nuevoUser, _id: { $ne: id } });
            if (existeUser) {
                return res.status(400).json({ success: false, message: 'El nombre de usuario ya está en uso por otro cliente.' });
            }

            // 2. Preparar los datos a actualizar
            const updateData = { usuarioCasino: nuevoUser };
            
            // Si el admin escribió una contraseña nueva, la actualizamos
            if (nuevaPass && nuevaPass.trim() !== '') {
                updateData.password = nuevaPass.trim(); 
            }

            // 3. Guardar en base de datos
            await Cliente.findByIdAndUpdate(id, updateData);
            
            // 4. Actualizar las tablas del panel en tiempo real (si está conectado)
            if (sharedState && sharedState.adminSocketId && io) {
                const clientesDB = await Cliente.find();
                io.to(sharedState.adminSocketId).emit('cargar_datos_tablas', { clientes: clientesDB });
            }

            res.json({ success: true, message: 'Cliente actualizado correctamente.' });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error interno al actualizar el cliente.', error: error.message });
        }
    });
};
