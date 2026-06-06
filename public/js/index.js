const socket = io();
const msgArea = document.getElementById('messages-area');
window.usuarioLogueado = null; 

// VARIABLES GLOBALES DE ESTADO
let ruletaConfig = []; let raspaConfig = [];
let currentRotation = 0; let raspaYaJugada = false;
let tragaJugado = false; let cartasJugado = false; let monedaJugado = false;
let misCreditos = 0;
let costosMinijuegosCache = { "Ruleta": 0, "Raspa": 0, "Tragamonedas": 0, "Cartas": 0, "Moneda": 0 };

// AUTO-LOGIN AL INICIAR
window.onload = function() {
    const savedUser = localStorage.getItem('casino_fenix_user');
    const savedPass = localStorage.getItem('casino_fenix_pass');
    if (savedUser && savedPass) {
        document.getElementById('login-user').value = savedUser;
        document.getElementById('login-pass').value = savedPass;
        validarAcceso(true); 
    }
};

// ==========================================
// VISTAS Y NAVEGACIÓN
// ==========================================
function cambiarVista(vista) {
    document.getElementById('vista-login').classList.add('hidden');
    document.getElementById('vista-registro').classList.add('hidden');
    document.getElementById('vista-chat').classList.add('hidden');
    document.getElementById('btn-cerrar-sesion').classList.add('hidden');

    if (vista === 'login') document.getElementById('vista-login').classList.remove('hidden');
    if (vista === 'registro') document.getElementById('vista-registro').classList.remove('hidden');
    if (vista === 'chat') {
        document.getElementById('vista-chat').classList.remove('hidden');
        document.getElementById('vista-chat').style.display = 'flex';
        document.getElementById('btn-cerrar-sesion').classList.remove('hidden');
    }
}

function irAlMenuPrincipal() {
    document.getElementById('container-deposit-options').style.display = 'none';
    document.getElementById('container-chat-input').style.display = 'none';
    document.getElementById('container-games-options').style.display = 'none';
    document.getElementById('messages-area').style.display = 'none';
    document.getElementById('hero-welcome-container').style.display = 'block';
    document.getElementById('container-menu-options').style.display = 'grid';
}

function mostrarChat() {
    document.getElementById('container-menu-options').style.display = 'none';
    document.getElementById('container-games-options').style.display = 'none';
    document.getElementById('hero-welcome-container').style.display = 'none';
    document.getElementById('messages-area').style.display = 'flex';
    document.getElementById('container-chat-input').style.display = 'flex';
    msgArea.scrollTop = msgArea.scrollHeight;
}

function mostrarSubMenuMinijuegos() {
    document.getElementById('container-menu-options').style.display = 'none';
    document.getElementById('messages-area').style.display = 'none'; 
    document.getElementById('container-games-options').style.display = 'grid';
}

function volverYLimpiarChat() {
    msgArea.innerHTML = '<div style="text-align: center; color: #64748b; font-size: 12px; margin-top: 20px;">Conectando...</div>';
    irAlMenuPrincipal();
}

// ==========================================
// AUTENTICACIÓN Y SOCKETS
// ==========================================
function validarAcceso(esAutoLogin) {
    const u = document.getElementById('login-user').value.trim(); 
    const p = document.getElementById('login-pass').value.trim();
    if (!u || !p) { if(!esAutoLogin) alert('Ingresá usuario y contraseña.'); return; }
    
    fetch('/api/validar-cliente', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({usuario: u, password: p}) })
    .then(r => r.json()).then(data => {
        if(data.exito) {
            localStorage.setItem('casino_fenix_user', u);
            localStorage.setItem('casino_fenix_pass', p);
            window.usuarioLogueado = u;
            socket.emit('identificar_usuario', { usuario: u });
        } else if(!esAutoLogin) alert('Credenciales incorrectas');
    }).catch(e => console.error("Error validando:", e));
}

function cerrarSesion() {
    localStorage.clear();
    socket.disconnect(); 
    window.location.reload();
}

socket.on('resultado_validacion', (res) => {
    if(res.exito) {
        document.getElementById('header-title-text').innerText = "Hola, " + res.usuario;
        document.getElementById('welcome-name').innerText = "¡Hola, " + res.usuario + "!";
        misCreditos = res.creditos || 0;
        document.getElementById('txt-creditos').innerText = misCreditos;
        document.getElementById('badge-creditos').classList.remove('hidden');
        cambiarVista('chat');
        irAlMenuPrincipal();
    }
});
// ==========================================
// CHAT Y ACCIONES
// ==========================================
function seleccionarOpcion(opcion) {
    mostrarChat();
    if (opcion === 'Depósito') document.getElementById('container-deposit-options').style.display = 'grid';
    msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble cliente">${opcion}</div></div>`;
    socket.emit('cliente_accion', { estado: opcion, mensajeCliente: opcion });
    msgArea.scrollTop = msgArea.scrollHeight;
}

function enviarMensajeLibreCliente() {
    const input = document.getElementById('client-raw-input');
    if (input.value.trim() === '') return;
    msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble cliente">${input.value}</div></div>`;
    socket.emit('cliente_envia_mensaje_libre', { mensaje: input.value });
    input.value = '';
    msgArea.scrollTop = msgArea.scrollHeight;
}

socket.on('recibir_mensaje_admin', (datos) => {
    mostrarChat();
    msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble admin"><b>Asesor:</b> ${datos.mensaje}</div></div>`;
    msgArea.scrollTop = msgArea.scrollHeight;
});

// ==========================================
// JUEGOS Y MODALES
// ==========================================
function abrirModal(juego) {
    if (juego === 'cargar-creditos') { document.getElementById('modal-cargar-creditos').style.display = 'block'; return; }
    
    const endpoint = (juego === 'traga') ? 'tragamonedas' : juego;
    fetch(`/api/${endpoint}-config`)
    .then(r => r.json())
    .then(data => {
        if(!data.exito) { alert("Juego en mantenimiento."); return; }
        
        if(juego === 'ruleta') {
            ruletaConfig = data.config; currentRotation = 0;
            const c = document.getElementById('ruleta-canvas'); 
            const ctx = c.getContext('2d');
            ctx.clearRect(0,0,c.width,c.height); 
            // Lógica dibujo ruleta...
        }
        document.getElementById(`modal-${juego}`).style.display = 'block';
    })
    .catch(e => { console.error(e); alert("Error al cargar juego."); });
}

function cerrarModal(juego) { document.getElementById(`modal-${juego}`).style.display = 'none'; }

function anunciarVictoria(emoji, titulo, msg) {
    mostrarChat();
    msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble cliente">${emoji} Jugué: ${titulo}</div></div><div class="bubble-wrapper"><div class="bubble bot">${msg}</div></div>`;
    msgArea.scrollTop = msgArea.scrollHeight;
}

function abrirSlotPremium() { window.open('https://api.whatsapp.com/send?phone=TUNUMERO', '_blank'); }
function abrirTienda() { document.getElementById('modal-tienda').style.display = 'flex'; }

async function canjearProducto(nombre, costo) {
    if (misCreditos < costo) return alert("Créditos insuficientes.");
    if (!confirm(`¿Confirmar canje de ${nombre} por ${costo} CR?`)) return;

    try {
        const res = await fetch('/api/canjear-producto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario: window.usuarioLogueado, nombre, costo })
        });
        const data = await res.json();
        if (data.exito) {
            alert("¡Canje exitoso!");
            cerrarModal('tienda');
            misCreditos = data.nuevoSaldo;
            document.getElementById('txt-creditos').innerText = misCreditos;
        } else alert(data.mensaje);
    } catch (e) { alert("Error de conexión."); }
}
