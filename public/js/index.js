const socket = io();
const msgArea = document.getElementById('messages-area');

// Autenticación Manual
function validarAccesoManual() {
    const u = document.getElementById('login-user').value.trim();
    const p = document.getElementById('login-pass').value.trim();
    
    if (!u || !p) { alert('Completá los campos'); return; }

    fetch('/api/validar-cliente', { 
        method: 'POST', 
        headers: {'Content-Type':'application/json'}, 
        body: JSON.stringify({usuario: u, password: p}) 
    })
    .then(r => r.json())
    .then(data => {
        if(data.exito) {
            socket.emit('identificar_usuario', { usuario: u });
            document.getElementById('vista-login').classList.add('hidden');
            document.getElementById('vista-chat').classList.remove('hidden');
            document.getElementById('btn-cerrar-sesion').classList.remove('hidden');
        } else {
            alert('Usuario o contraseña incorrectos');
        }
    });
}

// Lógica de Selección
function seleccionarOpcion(opcion) {
    document.getElementById('container-menu-options').classList.add('hidden');
    document.getElementById('container-chat-input').classList.remove('hidden');
    
    // Mostrar mensaje enviado por el cliente
    msgArea.innerHTML += `<div style="text-align: right; margin: 10px 0;"><span style="background: #2563eb; padding: 8px 12px; border-radius: 10px;">${opcion}</span></div>`;
    
    socket.emit('cliente_accion', { estado: opcion });
}

function enviarMensajeLibreCliente() {
    const input = document.getElementById('client-raw-input');
    if(!input.value) return;
    
    msgArea.innerHTML += `<div style="text-align: right; margin: 10px 0;"><span style="background: #2563eb; padding: 8px 12px; border-radius: 10px;">${input.value}</span></div>`;
    socket.emit('cliente_envia_mensaje_libre', { mensaje: input.value });
    input.value = '';
}

function cerrarSesion() {
    window.location.reload();
}

function abrirModal(id) {
    document.getElementById('modal-' + id).classList.remove('hidden');
}

function abrirTienda() {
    document.getElementById('modal-tienda').classList.remove('hidden');
}
