const express = require('express');
const router = express.Router();
// Importamos tu modelo (ajusta la ruta si el archivo User.js está en otra carpeta)
const User = require('../models/User'); 

// (Mantenemos tu lógica de premios y motor matemático aquí arriba)
const tablaPremios = { 'bufon': 10, 'laud': 8, 'clavas': 6, 'zapatos': 3, 'esfera': 1 };
const pesosSimbolos = [
    { nombre: 'esfera', peso: 40 },
    { nombre: 'zapatos', peso: 30 },
    { nombre: 'clavas', peso: 15 },
    { nombre: 'laud', peso: 7 },
    { nombre: 'bufon', peso: 2 },
    { nombre: 'bonus', peso: 6 }
];


// 2. EL MOTOR MATEMÁTICO
function tirarRodillo() {
    let totalPeso = pesosSimbolos.reduce((acc, simbolo) => acc + simbolo.peso, 0);
    let random = Math.floor(Math.random() * totalPeso);
    
    for (let s of pesosSimbolos) {
        if (random < s.peso) return s.nombre;
        random -= s.peso;
    }
}


// LA RUTA AHORA ES ASÍNCRONA
router.post('/api/jugar-slot', async (req, res) => {
    const { usuario, apuestaGasto, apuestaCalculoPremio } = req.body;

    try {
        // 1. BUSCAR USUARIO EN MONGODB
        const user = await User.findOne({ username: usuario });
        
        if (!user) {
            return res.status(404).json({ exito: false, mensaje: "Usuario no encontrado" });
        }

        // 2. VALIDAR SALDO (Usamos el campo 'credits' de tu modelo)
        if (user.credits < apuestaGasto) {
            return res.status(400).json({ exito: false, mensaje: "Saldo insuficiente" });
        }

        // 3. PROCESAR APUESTA
        user.credits -= apuestaGasto;

        // 4. GENERAR RESULTADO
        const rodillos = [tirarRodillo(), tirarRodillo(), tirarRodillo()];
        let premio = 0;
        const esGanador = (rodillos[0] === rodillos[1] && rodillos[1] === rodillos[2]);
        const simboloGanador = rodillos[0];

        if (esGanador && tablaPremios[simboloGanador]) {
            premio = apuestaCalculoPremio * tablaPremios[simboloGanador];
            user.credits += premio;
        }

        // 5. GUARDAR CAMBIOS EN MONGODB
        await user.save();

        // 6. RESPONDER
        res.json({
            exito: true,
            rodillos: rodillos,
            premioGanado: premio,
            nuevoSaldo: user.credits,
            esBonus: esGanador && simboloGanador === 'bonus'
        });

    } catch (error) {
        console.error("Error en el juego:", error);
        res.status(500).json({ exito: false, mensaje: "Error interno del servidor" });
    }
});

module.exports = router;
