const mongoose = require('mongoose');

module.exports = function(app, requireLogin, io, sharedState) {
    const Cliente = mongoose.model('Cliente');
    const PanelConfig = mongoose.model('PanelConfig');

    // Función auxiliar para generar códigos únicos
    function generarCodigoReferido(usuario) {
        const cleanUser = usuario ? usuario.toString() : "USR";
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `${cleanUser.substring(0, 3).toUpperCase()}${random}`;
    }

    // ==============================================================
    // 👤 NUEVA RUTA: REGISTRO DE CLIENTES (SIGN UP)
    // ==============================================================
    app.post('/api/registrar-cliente', async (req, res) => {
        try {
            const { usuario, password, codigoReferido } = req.body;
            
            // 1. Verificamos si el usuario ya existe
            const existe = await Cliente.findOne({ usuarioCasino: usuario });
            if (existe) {
                return res.json({ exito: false, mensaje: 'Ese usuario ya existe. Por favor, elegí otro nombre.' });
            }

            // 2. BUSCAMOS AL PADRINO (Si hay un código)
            let referidoPor = null;
            if (codigoReferido) {
                const padrino = await Cliente.findOne({ referralCode: codigoReferido });
                if (padrino) {
                    referidoPor = padrino.usuarioCasino;
                }
            }

            // 3. GENERAMOS EL CÓDIGO PROPIO DEL NUEVO USUARIO
            const miCodigo = generarCodigoReferido(usuario);

            // 4. Creamos el nuevo cliente
            const nuevoCliente = new Cliente({
                usuarioCasino: usuario,
                password: password,
                saldo: 0,
                estado: 'Activo',
                referralCode: miCodigo, // <--- CÓDIGO ÚNICO DEL USUARIO
                referredBy: referidoPor,
                historialChat: [{ 
                    emisor: 'bot', 
                    mensaje: `¡Bienvenido a Casino Fénix, ${usuario}! Ya podés invitar amigos con tu código: ${miCodigo}`, 
                    leido: true 
                }]
            });
            
            await nuevoCliente.save();

            // 5. Avisamos al panel de Admin
            if (sharedState && sharedState.adminSocketId && io) {
                const clientesDB = await Cliente.find();
                io.to(sharedState.adminSocketId).emit('cargar_datos_tablas', { clientes: clientesDB });
            }

            res.json({ exito: true, mensaje: 'Usuario creado exitosamente.' });
        } catch (error) {
            console.error("Error en registro:", error);
            res.status(500).json({ exito: false, mensaje: 'Error al registrar el usuario.' });
        }
    });
    // ==============================================================
    // 👤 RUTA: OBTENER PERFIL PARA REFERIDOS
    // ==============================================================
    app.get('/api/mi-perfil', async (req, res) => {
        try {
            // 2. Verificamos manualmente la sesión aquí adentro
        if (!req.session || !req.session.usuario) {
            return res.status(401).json({ exito: false, mensaje: "No has iniciado sesión" });
        }
            // Asegúrate de usar la variable donde guardas el usuario al loguearse
            const usuarioLogueado = req.session.usuario; 
            
            const cliente = await Cliente.findOne({ usuarioCasino: usuarioLogueado });
            
            if (cliente) {
                res.json({ 
                    exito: true, 
                    referralCode: cliente.referralCode,
                    usuario: cliente.usuarioCasino
                });
            } else {
                res.status(404).json({ exito: false, mensaje: "Usuario no encontrado" });
            }
        } catch (error) {
            console.error("Error al obtener perfil:", error);
            res.status(500).json({ exito: false, mensaje: "Error interno" });
        }
    });

    // ==============================================================
    // 🔐 RUTAS EXISTENTES
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
                    
                    // --- AQUÍ ESTÁ EL CAMBIO ---
                    // 1. Guardamos al usuario en la sesión para que el servidor lo recuerde
                    req.session.usuario = usuario; 
                    
                    // 2. Guardamos la sesión explícitamente y luego respondemos
                    req.session.save(() => {
                        res.json({ exito: true });
                    });
                    // ---------------------------
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
            // 1. Actualizamos los créditos y pedimos que nos devuelva el cliente ya actualizado con { new: true }
            // IMPORTANTE: Cambié 'saldo' por 'creditos' para que coincida con el campo que lee tu UI en el index.html
            const clienteActualizado = await Cliente.findOneAndUpdate(
                { usuarioCasino: usuario }, 
                { $inc: { creditos: monto } },
                { new: true } 
            );

            if (!clienteActualizado) {
                return res.status(404).json({ exito: false, mensaje: 'Usuario no encontrado.' });
            }

            // 2. Buscamos al usuario en la lista de conectados en vivo
            const usuarioEnVivo = sharedState.usuariosConectados.find(u => 
                u.nombre.toLowerCase() === usuario.toLowerCase()
            );

            // 3. Si el usuario está conectado, le disparamos el evento
            if (usuarioEnVivo && usuarioEnVivo.id) {
                io.to(usuarioEnVivo.id).emit('actualizar_creditos_en_vivo', { 
                    creditos: clienteActualizado.creditos 
                });
                console.log(`✅ Créditos actualizados en vivo para: ${usuario}`);
            }

            res.json({ exito: true, mensaje: `¡Panel actualizado! Se sumaron ${monto} al cliente ${usuario}.` });
        } catch (error) {
            console.error("Error al cargar saldo:", error);
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
                            // Al importar, también generamos código si no existe
                            await Cliente.updateOne(
                                { usuarioCasino: usuario }, 
                                { 
                                    $set: { saldo: saldoNumerico, estado: 'Activo' },
                                    $setOnInsert: { password: '1234', referralCode: generarCodigoReferido(usuario) }
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

    app.post('/api/editar-cliente', requireLogin, async (req, res) => {
        try {
            const { id, nuevoUser, nuevaPass } = req.body;
            
            const existeUser = await Cliente.findOne({ usuarioCasino: nuevoUser, _id: { $ne: id } });
            if (existeUser) {
                return res.status(400).json({ success: false, message: 'El nombre de usuario ya está en uso por otro cliente.' });
            }

            const updateData = { usuarioCasino: nuevoUser };
            if (nuevaPass && nuevaPass.trim() !== '') {
                updateData.password = nuevaPass.trim(); 
            }

            await Cliente.findByIdAndUpdate(id, updateData);
            
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
