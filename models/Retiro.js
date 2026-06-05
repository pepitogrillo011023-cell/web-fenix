// models/Retiro.js
const mongoose = require('mongoose');

const RetiroSchema = new mongoose.Schema({
    fecha: { type: String, required: true }, // Ejemplo: "2026-06-05"
    turno: { type: String, required: true }, // "Mañana", "Tarde", "Noche"
    retiros: [{
        cliente: String,
        monto: Number,
        hora: String,
        verificado: Boolean
    }],
    fechaCreacion: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Retiro', RetiroSchema);
