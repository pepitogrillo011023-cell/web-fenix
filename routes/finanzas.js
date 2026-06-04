const mongoose = require('mongoose');
// Importamos los modelos necesarios
const User = require('../models/User');
const Transaction = require('../models/Transaction');

module.exports = function(app, requireLogin) {
    const CierreCaja = mongoose.model('CierreCaja');

    // ==============================================================
    // 📊 RUTAS DE CIERRE DE CAJA, RESÚMENES E HISTORIAL (EXISTENTES)
    // ==============================================================
    app.post('/api/cierre-caja', requireLogin, async (req, res) => {
        try {
            const filtro = { fecha: req.body.fecha, turno: req.body.turno };
            await CierreCaja.findOneAndUpdate(filtro, req.body, { upsert: true, new: true });
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get('/api/cierre-caja', requireLogin, async (req, res) => {
        try {
            const cierres = await CierreCaja.find().sort({ _id: -1 });
            res.json(cierres);
        } catch (err) {
            res.status(500).json([]);
        }
    });

    app.get('/api/resumen-cajas/:fecha', requireLogin, async (req, res) => {
        try {
            const fechaSelect = req.params.fecha; 
            const mesSelect = fechaSelect.substring(0, 7); 

            const cierresDia = await CierreCaja.find({ fecha: fechaSelect });
            const cierresMes = await CierreCaja.find({ fecha: { $regex: '^' + mesSelect } });

            let dia = {
                manana: { ingreso: 0, oro: 0, ganamos: 0, retiros: 0, real: 0 },
                tarde: { ingreso: 0, oro: 0, ganamos: 0, retiros: 0, real: 0 },
                noche: { ingreso: 0, oro: 0, ganamos: 0, retiros: 0, real: 0 },
                total: { ingreso: 0, oro: 0, ganamos: 0, retiros: 0, real: 0 }
            };

            cierresDia.forEach(c => {
                let t = c.turno.toLowerCase();
                if (t === 'mañana') t = 'manana';
                if (dia[t]) {
                    dia[t].ingreso += (c.ingreso || 0);
                    dia[t].oro += (c.saldoOro || 0);
                    dia[t].ganamos += (c.saldoGanamos || 0);
                    dia[t].retiros += (c.egreso || 0);
                    dia[t].real += (c.montoRealFinal || 0);
                    
                    dia.total.ingreso += (c.ingreso || 0);
                    dia.total.oro += (c.saldoOro || 0);
                    dia.total.ganamos += (c.saldoGanamos || 0);
                    dia.total.retiros += (c.egreso || 0);
                    dia.total.real += (c.montoRealFinal || 0);
                }
            });

            let mes = {
                salidas: { lean: 0, nahue: 0, brai: 0, tati: 0 },
                saldos: { oro: 0, ganamos: 0 },
                fichas: { mega: 0, ganamos: 0, oro: 0 },
                bonos: { bb: { cant: 0, monto: 0 }, br: { cant: 0, monto: 0 } }
            };

            cierresMes.forEach(c => {
                mes.saldos.oro += (c.saldoOro || 0);
                mes.saldos.ganamos += (c.saldoGanamos || 0);

                if (c.gastos && c.gastos.length > 0) {
                    c.gastos.forEach(g => {
                        const monto = Number(g.monto) || 0;
                        if (g.tipo === 'Salida Lean') mes.salidas.lean += monto;
                        if (g.tipo === 'Salida Nahue') mes.salidas.nahue += monto;
                        if (g.tipo === 'Salida Brai') mes.salidas.brai += monto;
                        if (g.tipo === 'Salida Tati') mes.salidas.tati += monto;
                        
                        if (g.tipo === 'Fichas Mega') mes.fichas.mega += monto;
                        if (g.tipo === 'Fichas Ganamos') mes.fichas.ganamos += monto;
                        if (g.tipo === 'Fichas Oro') mes.fichas.oro += monto;

                        if (g.tipo === 'BB') { mes.bonos.bb.cant += 1; mes.bonos.bb.monto += monto; }
                        if (g.tipo === 'BR') { mes.bonos.br.cant += 1; mes.bonos.br.monto += monto; }
                    });
                }
            });

            res.json({ dia, mes });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/historial-cajas/:fecha', requireLogin, async (req, res) => {
        try {
            const cierres = await CierreCaja.find({ fecha: req.params.fecha });
            res.json(cierres);
        } catch (e) {
            res.status(500).json([]);
        }
    });

    // ==============================================================
    // 💳 RUTAS DE GESTIÓN DE CRÉDITOS (NUEVO BLOQUE)
    // ==============================================================

    // RUTA GET: Obtener transacciones pendientes
    app.get('/api/transacciones-pendientes', requireLogin, async (req, res) => {
        try {
            const tipo = req.query.tipo;
            const transacciones = await Transaction.find({ type: tipo, status: 'pending' }).populate('userId', 'username');
            res.json({ transacciones });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // 1. CLIENTE: Solicitar carga de créditos (Reportar pago)
    app.post('/api/solicitar-carga-creditos', requireLogin, async (req, res) => {
        try {
            const { userId, amount, receiptUrl } = req.body;
            
            const nuevaTransaccion = new Transaction({
                userId,
                type: 'credit_charge',
                amount,
                receiptUrl,
                status: 'pending'
            });
            
            await nuevaTransaccion.save();
            res.json({ success: true, message: 'Reporte de pago de créditos enviado. Esperando aprobación del cajero.' });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al procesar la solicitud de créditos.', error: error.message });
        }
    });

    // 2. CAJERO: Aprobar carga de créditos
    app.post('/api/aprobar-carga-creditos', requireLogin, async (req, res) => {
        try {
            const { transactionId, cashierId } = req.body;
            const transaccion = await Transaction.findById(transactionId);
            
            if (!transaccion || transaccion.type !== 'credit_charge' || transaccion.status !== 'pending') {
                return res.status(400).json({ success: false, message: 'Transacción no válida o ya procesada.' });
            }

            // Actualizar estado de la transacción
            transaccion.status = 'approved';
            transaccion.resolvedBy = cashierId;
            transaccion.resolvedAt = new Date();
            await transaccion.save();

            // Sumar créditos al cliente (Cambiamos User por Cliente según tu estructura)
            const Cliente = mongoose.model('Cliente');
            const cliente = await Cliente.findById(transaccion.userId);
            cliente.creditos = (cliente.creditos || 0) + transaccion.amount;
            await cliente.save();

            res.json({ success: true, message: 'Créditos aprobados y cargados al usuario exitosamente.', nuevosCreditos: cliente.creditos });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al aprobar los créditos.', error: error.message });
        }
    });

    // 3. CAJERO/ADMIN: Cargar o retirar créditos manualmente
    app.post('/api/gestion-manual-creditos', requireLogin, async (req, res) => {
        try {
            const { userId, amount, action } = req.body; 
            const Cliente = mongoose.model('Cliente');
            const cliente = await Cliente.findById(userId);

            if (!cliente) {
                return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
            }

            if (action === 'add') {
                cliente.creditos = (cliente.creditos || 0) + amount;
            } else if (action === 'remove') {
                if ((cliente.creditos || 0) < amount) {
                    return res.status(400).json({ success: false, message: 'El usuario no tiene suficientes créditos.' });
                }
                cliente.creditos -= amount;
            } else {
                return res.status(400).json({ success: false, message: 'Acción no válida.' });
            }

            await cliente.save();
            res.json({ success: true, message: `Créditos actualizados. Saldo: ${cliente.creditos} créditos.` });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Error al gestionar los créditos manualmente.', error: error.message });
        }
    });
};
