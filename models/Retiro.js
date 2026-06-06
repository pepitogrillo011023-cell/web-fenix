const mongoose = require('mongoose');

const RetiroSchema = new mongoose.Schema({
    fecha: String,
    turno: String,
    retiros: Array, // <--- Al poner 'Array' genérico, Mongoose no filtrará ni descartará los datos
    fechaCreacion: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Retiro || mongoose.model('Retiro', RetiroSchema);
