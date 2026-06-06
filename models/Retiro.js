const mongoose = require('mongoose');

const RetiroSchema = new mongoose.Schema({
    fecha: String,
    turno: String,
    retiros: Array,
    fechaCreacion: { type: Date, default: Date.now }
}, { strict: false }); // <--- LA MAGIA ESTÁ ACÁ: Desactiva el modo caprichoso de Mongoose

module.exports = mongoose.models.Retiro || mongoose.model('Retiro', RetiroSchema);
