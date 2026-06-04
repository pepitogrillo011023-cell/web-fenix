const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// Importamos nuestras nuevas rutas
const rutasClientes = require('./routes/clientes');
const rutasFinanzas = require('./routes/finanzas');
const rutasEventos = require('./routes/eventos');

// Middleware para procesar JSON
app.use(express.json());
app.use(express.static('public'));

// Conectamos las rutas
app.use('/api/clientes', rutasClientes);
app.use('/api/finanzas', rutasFinanzas);
app.use('/api/eventos', rutasEventos);

// Socket.io (aquí dejarás lo que sea de tiempo real)
io.on('connection', (socket) => {
    console.log('Usuario conectado');
});

http.listen(3000, () => console.log('Casino Fénix corriendo en puerto 3000'));
