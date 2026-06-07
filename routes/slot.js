const express = require('express');
const router = express.Router();

// 1. CONFIGURACIÓN DEL JUEGO
const tablaPremios = { 'bufon': 10, 'laud': 8, 'clavas': 6, 'zapatos': 3, 'esfera': 1 };

const pesosSimbolos = [
    { nombre: 'esfera', peso: 1 },
    { nombre: 'zapatos', peso: 1 },
    { nombre: 'clavas', peso: 1 },
    { nombre: 'laud', peso: 1 },
    { nombre: 'bufon', peso: 95 },
    { nombre: 'bonus', peso: 1 }
];

// Simulador temporal de Base de Datos (luego lo conectarás a tu base real)
let usuariosDB = {
    'invitado': { saldo: 5000 }
};

// 2. EL MOTOR MATEMÁTICO
function tirarRodillo() {
    let totalPeso = pesosSimbolos.reduce((acc, simbolo) => acc + simbolo.peso, 0);
    let random = Math.floor(Math.random() * totalPeso);
    
    for (let s of pesosSimbolos) {
        if (random < s.peso) return s.nombre;
        random -= s.peso;
    }
}

// 3. LA RUTA DEL JUEGO
// Nota que usamos router.post en lugar de app.post
router.post('/api/jugar-slot', (req, res) => {
    const { usuario, apuestaGasto, apuestaCalculoPremio, esGiroGratis } = req.body;

    // Validación de usuario
    if (!usuariosDB[usuario]) {
        return res.status(400).json({ exito: false, mensaje: "Usuario no encontrado" });
    }

    let saldoActual = usuariosDB[usuario].saldo;

    // Verificamos que el saldo sea suficiente
    if (saldoActual < apuestaGasto) {
        return res.status(400).json({ exito: false, mensaje: "Saldo insuficiente" });
    }

    // Cobramos la apuesta
    saldoActual -= apuestaGasto;

    // Generamos los rodillos
    const rodillos = [tirarRodillo(), tirarRodillo(), tirarRodillo()];

    // Calculamos el premio
    let premio = 0;
    const esGanador = (rodillos[0] === rodillos[1] && rodillos[1] === rodillos[2]);
    const simboloGanador = rodillos[0];

    if (esGanador && tablaPremios[simboloGanador]) {
        premio = apuestaCalculoPremio * tablaPremios[simboloGanador];
        saldoActual += premio; 
    }

    // Actualizamos la "base de datos"
    usuariosDB[usuario].saldo = saldoActual;

    // Respondemos al frontend
    res.json({
        exito: true,
        rodillos: rodillos,
        premioGanado: premio,
        nuevoSaldo: saldoActual,
        esBonus: esGanador && simboloGanador === 'bonus'
    });
});

// 4. EXPORTAMOS EL ROUTER (Muy importante para que server.js lo pueda leer)
module.exports = router;
