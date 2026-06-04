const mongoose = require('mongoose');

module.exports = function(app, requireLogin) {
    const CierreCaja = mongoose.model('CierreCaja');

    // ==============================================================
    // 📊 RUTAS DE CIERRE DE CAJA, RESÚMENES E HISTORIAL
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
};
