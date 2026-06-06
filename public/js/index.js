const socket = io();
const msgArea = document.getElementById('messages-area');
window.usuarioLogueado = null; 

// VARIABLES GLOBALES JUEGOS
let ruletaConfig = []; let raspaConfig = [];
let currentRotation = 0; let raspaYaJugada = false;
let tragaJugado = false; let cartasJugado = false; let monedaJugado = false;
let misCreditos = 0;

// Memoria local de costos
let costosMinijuegosCache = {
    "Ruleta": 0, "Raspa": 0, "Tragamonedas": 0, "Cartas": 0, "Moneda": 0
};

// ==========================================
// AUTO-LOGIN AL INICIAR
// ==========================================
window.onload = function() {
    const savedUser = localStorage.getItem('casino_fenix_user');
    const savedPass = localStorage.getItem('casino_fenix_pass');

    if (savedUser && savedPass) {
        document.getElementById('login-user').value = savedUser;
        document.getElementById('login-pass').value = savedPass;
        validarAcceso(true); 
    }
};

async function cargarCostosMinijuegos() {
    try {
        const res = await fetch('/api/configuracion-minijuegos');
        const data = await res.json();
        if(data.success && data.minijuegos) {
            data.minijuegos.forEach(j => {
                const n = j.name.toLowerCase();
                let btnId = ''; let keyCache = '';

                if(n.includes('ruleta')) { btnId = 'btn-spin-ruleta'; keyCache = 'Ruleta'; }
                else if(n.includes('raspa')) keyCache = 'Raspa'; 
                else if(n.includes('traga') || n.includes('slot')) { btnId = 'btn-spin-traga'; keyCache = 'Tragamonedas'; }
                else if(n.includes('carta')) keyCache = 'Cartas';
                else if(n.includes('moneda')) keyCache = 'Moneda';

                if(keyCache) costosMinijuegosCache[keyCache] = j.creditCost;

                if(btnId) {
                    const btn = document.getElementById(btnId);
                    if(btn) btn.innerText = `GIRAR POR ${j.creditCost} CR`;
                }
            });
        }
    } catch(e) { console.error("Error al cargar costos:", e); }
}

// ==========================================
// VISTAS Y AUTENTICACIÓN
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
        // Mostrar el banner de bienvenida al loguear
        document.getElementById('hero-welcome-container').classList.remove('hidden');
    }
}

async function registrarUsuario() {
    const u = document.getElementById('reg-user').value.trim(); const p = document.getElementById('reg-pass').value.trim();
    if(!u || !p) return alert("Por favor, completá ambos campos.");
    const btn = document.getElementById('btn-registro'); btn.innerText = 'Creando...'; btn.disabled = true;

    try {
        const res = await fetch('/api/registrar-cliente', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: u, password: p }) });
        const data = await res.json();
        btn.innerText = 'Crear Cuenta y Entrar'; btn.disabled = false;
        if (data.exito) {
            alert("¡Cuenta creada con éxito! Ingresando al chat...");
            document.getElementById('login-user').value = u; document.getElementById('login-pass').value = p;
            validarAccesoManual(); 
        } else alert(data.mensaje);
    } catch (e) { btn.innerText = 'Crear Cuenta y Entrar'; btn.disabled = false; alert("Error al registrarse."); }
}

function validarAccesoManual() { validarAcceso(false); }

function validarAcceso(esAutoLogin) {
    const u = document.getElementById('login-user').value.trim(); const p = document.getElementById('login-pass').value.trim();
    if (!u || !p) { if(!esAutoLogin) alert('Ingresá usuario y contraseña.'); return; }

    const btn = document.getElementById('btn-login'); btn.innerText = 'Validando...'; btn.disabled = true;

    fetch('/api/validar-cliente', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: u, password: p }) })
    .then(res => res.json()).then(data => {
        btn.innerText = 'Ingresar al Chat'; btn.disabled = false;
        if(data.exito) {
            // === REFUERZO DEL PUENTE ===
            localStorage.setItem('casino_fenix_user', u);
            localStorage.setItem('casino_fenix_pass', p);
            window.usuarioLogueado = u; 
            socket.emit('identificar_usuario', { usuario: u });
        } else {
            if(esAutoLogin) cerrarSesion(); else alert('Usuario o contraseña incorrectos.');
        }
    }).catch(err => { 
        btn.innerText = 'Ingresar al Chat'; btn.disabled = false; 
        if(!esAutoLogin) alert('Error con el servidor.'); 
    });
}

function cerrarSesion() {
    localStorage.removeItem('casino_fenix_user');
    localStorage.removeItem('casino_fenix_pass');
    socket.disconnect(); socket.connect(); 
    window.usuarioLogueado = null;
    document.getElementById('login-user').value = ''; document.getElementById('login-pass').value = '';
    document.getElementById('header-title-text').innerText = "Chat Asistencia";
    document.getElementById('badge-creditos').classList.add('hidden');
    msgArea.innerHTML = '';
    document.getElementById('hero-welcome-container').classList.add('hidden');
    cambiarVista('login');
}

document.getElementById('login-pass').addEventListener('keypress', function (e) { if (e.key === 'Enter') validarAccesoManual(); });
document.getElementById('reg-pass').addEventListener('keypress', function (e) { if (e.key === 'Enter') registrarUsuario(); });

socket.on('resultado_validacion', (respuesta) => {
    if (respuesta.exito) {
        document.getElementById('header-title-text').innerText = "Conectado";
        document.getElementById('welcome-name').innerText = "¡Hola, " + respuesta.usuario + "!";

        misCreditos = respuesta.creditos || 0;
        document.getElementById('txt-creditos').innerText = misCreditos;
        document.getElementById('badge-creditos').classList.remove('hidden');

        cargarCostosMinijuegos();

        msgArea.innerHTML = '';
        if(respuesta.historial && respuesta.historial.length > 0) {
            respuesta.historial.forEach(h => {
                if (h.emisor === 'bot') {
                    msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble bot">${h.mensaje}</div></div>`;
                } else if (h.emisor === 'admin') {
                    msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble admin"><b>Asesor:</b> ${h.mensaje}</div></div>`;
                } else if (h.emisor === 'cliente') {
                    let check = h.leido ? '<span class="status-text visto">✓ Visto</span>' : '<span class="status-text">✓ Enviado</span>';
                    msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble cliente">${h.mensaje}</div>${check}</div>`;
                }
            });
        }
        cambiarVista('chat');
        irAlMenuPrincipal();
    }
});

socket.on('actualizar_creditos', (data) => {
    misCreditos = data.nuevosCreditos;
    document.getElementById('txt-creditos').innerText = misCreditos;
});

function descontarCreditoVisual(juegoKey) {
    let costo = costosMinijuegosCache[juegoKey] || 0;
    if(misCreditos >= costo && costo > 0) {
        misCreditos -= costo;
        document.getElementById('txt-creditos').innerText = misCreditos;
    }
}

// ==========================================
// MENÚS Y CHAT
// ==========================================
function irAlMenuPrincipal() {
    document.getElementById('container-deposit-options').style.display = 'none';
    document.getElementById('container-chat-input').style.display = 'none';
    document.getElementById('container-games-options').style.display = 'none';
    document.getElementById('messages-area').style.display = 'none';
    document.getElementById('container-menu-options').style.display = 'flex';
}

function mostrarChat() {
    document.getElementById('container-menu-options').style.display = 'none';
    document.getElementById('container-games-options').style.display = 'none';
    document.getElementById('messages-area').style.display = 'flex';
    document.getElementById('container-chat-input').style.display = 'flex';
    msgArea.scrollTop = msgArea.scrollHeight;
}

function mostrarSubMenuMinijuegos() {
    document.getElementById('container-menu-options').style.display = 'none';
    document.getElementById('messages-area').style.display = 'none'; 
    document.getElementById('container-games-options').style.display = 'flex';
}

function seleccionarOpcion(opcion) {
    document.getElementById('container-menu-options').style.display = 'none';
    if (opcion === 'Depósito') {
        mostrarChat();
        document.getElementById('container-deposit-options').style.display = 'grid';
        let msgBot = `<b>CBU:</b> 0000151500038126204154<br><b>ALIAS:</b> 20719709.URBANATRADE<br><br>Enviá el comprobante 📄`;
        msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble cliente">${opcion}</div><span class="status-text">✓ Enviado</span></div><div class="bubble-wrapper"><div class="bubble bot">${msgBot}</div></div>`;
        socket.emit('cliente_accion', { estado: 'Depósito', mensajeCliente: opcion, mensajeBot: msgBot });
    } else if (opcion === 'Soporte') {
        mostrarChat();
        let msgBot = `🛠️ <b>Soporte:</b> Escribí tu consulta, un asesor te responderá.`;
        msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble cliente">${opcion}</div><span class="status-text">✓ Enviado</span></div><div class="bubble-wrapper"><div class="bubble bot">${msgBot}</div></div>`;
        socket.emit('cliente_accion', { estado: 'Soporte', mensajeCliente: opcion, mensajeBot: msgBot });
    } else if (opcion === 'Retiro') {
        mostrarChat();
        let msgBot = `💸 <b>Retiro:</b> ¿Qué monto querés retirar? Escribilo aquí.`;
        msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble cliente">${opcion}</div><span class="status-text">✓ Enviado</span></div><div class="bubble-wrapper"><div class="bubble bot">${msgBot}</div></div>`;
        socket.emit('cliente_accion', { estado: 'Retiro', mensajeCliente: opcion, mensajeBot: msgBot });
    } else {
        mostrarChat();
        let msgBot = `⏳ Derivando a un asesor... (Opción: ${opcion})`;
        msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble cliente">${opcion}</div><span class="status-text">✓ Enviado</span></div><div class="bubble-wrapper"><div class="bubble bot">${msgBot}</div></div>`;
        socket.emit('cliente_accion', { estado: opcion, mensajeCliente: opcion, mensajeBot: msgBot });
        setTimeout(irAlMenuPrincipal, 4000); 
    }
    msgArea.scrollTop = msgArea.scrollHeight;
}

function ejecutarAccionDeposito(accion) {
    let msg = accion === 'Subir Comprobante' ? "📁 Archivo recibido." : "✅ Pago reportado.";
    msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble cliente">${accion}</div><span class="status-text">✓ Enviado</span></div><div class="bubble-wrapper"><div class="bubble bot">${msg}</div></div>`;
    msgArea.scrollTop = msgArea.scrollHeight;
    socket.emit('cliente_accion', { estado: accion, mensajeCliente: accion, mensajeBot: msg });
}

function enviarMensajeLibreCliente() {
    const input = document.getElementById('client-raw-input'); const texto = input.value.trim(); if (texto === '') return;
    msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble cliente">${texto}</div><span class="status-text">✓ Enviado</span></div>`;
    msgArea.scrollTop = msgArea.scrollHeight;
    socket.emit('cliente_envia_mensaje_libre', { mensaje: texto }); input.value = '';
}

document.getElementById('client-raw-input').addEventListener('keypress', function (e) { if (e.key === 'Enter') enviarMensajeLibreCliente(); });

socket.on('recibir_mensaje_admin', (datos) => {
    mostrarChat(); 
    msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble admin"><b>Asesor:</b> ${datos.mensaje}</div></div>`;
    document.querySelectorAll('.status-text').forEach(m => { m.innerText = '✓ Visto'; m.classList.add('visto'); });
    msgArea.scrollTop = msgArea.scrollHeight;
});

socket.on('tus_mensajes_fueron_leidos', () => {
    document.querySelectorAll('.status-text').forEach(m => { m.innerText = '✓ Visto'; m.classList.add('visto'); });
});

// ==========================================
// JUEGOS Y MODALES
// ==========================================
function abrirModalVictoria(msg, emoji = '🎉') {
    const cleanMsg = msg.replace(/<[^>]*>?/gm, '\n');
    document.getElementById('vic-msg').innerText = cleanMsg;
    document.getElementById('vic-emoji').innerText = emoji;
    document.getElementById('modal-victoria').style.display = 'flex';
}

function cerrarModalVictoria() { document.getElementById('modal-victoria').style.display = 'none'; }

function abrirModal(juego) {
    if (juego === 'cargar-creditos') {
        document.getElementById('modal-cargar-creditos').style.display = 'block';
        return;
    }

    fetch(`/api/${juego === 'traga' ? 'tragamonedas' : juego}-config`).then(res => res.json()).then(data => {
        if(!data.exito || data.config.length === 0) return alert("Juego en mantenimiento.");

        if(juego === 'ruleta') {
            ruletaConfig = data.config; currentRotation = 0;
            const c = document.getElementById('ruleta-canvas'); const ctx = c.getContext('2d');
            ctx.clearRect(0,0,c.width,c.height); const sl = (2*Math.PI)/ruletaConfig.length; const cols = ['#ff007f','#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444'];
            for(let i=0; i<ruletaConfig.length; i++) {
                ctx.beginPath(); ctx.fillStyle = cols[i%cols.length]; ctx.moveTo(140,140); ctx.arc(140,140,138,i*sl,(i+1)*sl); ctx.fill(); ctx.stroke();
                ctx.save(); ctx.translate(140,140); ctx.rotate(i*sl+sl/2); ctx.textAlign="right"; ctx.fillStyle="white"; ctx.font="bold 13px sans-serif"; ctx.fillText(ruletaConfig[i].premio.substring(0,15), 125, 5); ctx.restore();
            }
            c.style.transition='none'; c.style.transform='rotate(0deg)'; void c.offsetWidth; c.style.transition='transform 5s cubic-bezier(0.25,0.1,0.15,1)';
            document.getElementById('btn-spin-ruleta').disabled = false;
        }
        else if (juego === 'raspa') {
            raspaConfig = data.config; raspaYaJugada = false;
            document.getElementById('client-tablero-raspa').innerHTML = Array(6).fill('<div class="raspa-block-card" onclick="jugarRaspa(arguments[0])"><div class="raspa-cover-layer">?</div></div>').map((s,i) => s.replace('arguments[0]', i)).join('');
        }
        else if (juego === 'traga') { tragaJugado = false; document.getElementById('btn-spin-traga').disabled = false; ['1','2','3'].forEach(i => document.getElementById(`client-slot-${i}`).innerText='🎰'); }
        else if (juego === 'cartas') { cartasJugado = false; document.getElementById('client-card').classList.remove('flipped'); }
        else if (juego === 'moneda') { monedaJugado = false; document.getElementById('client-coin').style.transform='rotateY(0deg)'; document.getElementById('client-coin').innerText='🪙'; }

        document.querySelectorAll('.btn-close-modal').forEach(b => b.classList.add('hidden'));
        document.getElementById(`modal-${juego}`).style.display = 'block';
    });
}

function cerrarModal(juego) { document.getElementById(`modal-${juego}`).style.display = 'none'; }

async function solicitarCargaCreditos() {
    const monto = document.getElementById('input-creditos-monto').value;
    const url = document.getElementById('input-creditos-url').value;
    if(!monto || !url) return alert("Por favor, ingresá el monto y la URL del comprobante.");

    try {
        const res = await fetch('/api/solicitar-carga-creditos', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: window.usuarioLogueado, amount: Number(monto), receiptUrl: url })
        });
        const data = await res.json();
        if(data.success) {
            cerrarModal('cargar-creditos');
            document.getElementById('input-creditos-monto').value = '';
            document.getElementById('input-creditos-url').value = '';
            msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble cliente">🟡 Reporté pago de ${monto} Créditos.<br>Comprobante adjuntado.</div><span class="status-text">✓ Enviado</span></div>`;
            msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble bot">✅ ${data.message}</div></div>`;
            msgArea.scrollTop = msgArea.scrollHeight;
            socket.emit('cliente_accion', { estado: 'Carga Créditos', mensajeCliente: `Reporté pago de ${monto} Créditos`, mensajeBot: data.message });
            mostrarChat(); 
        } else { alert(data.message || "Error al procesar la solicitud."); }
    } catch(e) { alert("Error de conexión al solicitar los créditos."); }
}

function jugarRuleta() {
    document.getElementById('btn-spin-ruleta').disabled = true;
    fetch('/api/tirar-ruleta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: window.usuarioLogueado }) })
    .then(r => r.json()).then(data => {
        if(!data.exito) { 
            alert(data.mensaje); 
            document.getElementById('btn-spin-ruleta').disabled = false;
            return cerrarModal('ruleta'); 
        }

        descontarCreditoVisual('Ruleta');

        const wIdx = ruletaConfig.findIndex(i => i.id === data.premio.id); const sl = 360/ruletaConfig.length;
        let needed = (270 - ((wIdx*sl)+(sl/2))) - (currentRotation%360); if(needed<0) needed+=360;
        currentRotation += needed + (360*5);
        document.getElementById('ruleta-canvas').style.transform = `rotate(${currentRotation}deg)`;

        msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble cliente">🎯 Jugué: Ruleta</div><span class="status-text">✓ Enviado</span></div>`;
        msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble bot">${data.mensaje}</div></div>`;

        setTimeout(() => { 
            document.querySelector('#modal-ruleta .btn-close-modal').classList.remove('hidden'); 
            cerrarModal('ruleta'); 
            abrirModalVictoria(data.mensaje, '🎯'); 
        }, 5300);
    });
}

function jugarRaspa(idx) {
    if(raspaYaJugada) return; raspaYaJugada = true;
    const cards = document.querySelectorAll('#client-tablero-raspa .raspa-block-card'); cards[idx].querySelector('.raspa-cover-layer').innerText = "⏳";
    fetch('/api/tirar-raspa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: window.usuarioLogueado }) })
    .then(r => r.json()).then(data => {
        if(!data.exito) { alert(data.mensaje); return cerrarModal('raspa'); }

        descontarCreditoVisual('Raspa');

        const pools = raspaConfig.filter(i => i.id !== data.premio.id).sort(() => Math.random() - 0.5);
        cards[idx].classList.add('scratched'); cards[idx].querySelector('.raspa-cover-layer').style.opacity = '0';
        cards[idx].innerHTML += `<div class="raspa-prize-text">${data.premio.premio}</div><div class="raspa-value-text">$${data.premio.valor}</div>`;

        msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble cliente">🎫 Jugué: Raspa y Gana</div><span class="status-text">✓ Enviado</span></div>`;
        msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble bot">${data.mensaje}</div></div>`;

        setTimeout(() => {
            let rIdx = 0; cards.forEach((c, i) => { if(i!==idx) { c.classList.add('others-revealed'); c.querySelector('.raspa-cover-layer').style.opacity='0'; c.innerHTML += `<div class="raspa-prize-text">${pools[rIdx].premio}</div><div class="raspa-value-text">$${pools[rIdx].valor}</div>`; rIdx++; }});
            document.querySelector('#modal-raspa .btn-close-modal').classList.remove('hidden'); 
            setTimeout(() => { cerrarModal('raspa'); abrirModalVictoria(data.mensaje, '🎫'); }, 1500); 
        }, 800);
    });
}

function jugarTragamonedas() {
    if(tragaJugado) return;
    document.getElementById('btn-spin-traga').disabled = true;
    fetch('/api/tirar-tragamonedas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: window.usuarioLogueado }) })
    .then(r => r.json()).then(data => {
        if(!data.exito) { alert(data.mensaje); return cerrarModal('traga'); }

        descontarCreditoVisual('Tragamonedas');
        tragaJugado = true;

        document.getElementById('client-slot-1').innerText="⏳"; document.getElementById('client-slot-2').innerText="⏳"; document.getElementById('client-slot-3').innerText="⏳";

        msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble cliente">🍒 Jugué: Slots</div><span class="status-text">✓ Enviado</span></div>`;
        msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble bot">${data.mensaje}</div></div>`;

        setTimeout(() => {
            let icons = ['🍒','💎','🔔','🍋','❌'];
            document.getElementById('client-slot-1').innerText = icons[Math.floor(Math.random()*icons.length)];
            document.getElementById('client-slot-2').innerText = icons[Math.floor(Math.random()*icons.length)];
            document.getElementById('client-slot-3').innerText = data.premio.premio.substring(0,2) || "🎰";
            document.querySelector('#modal-traga .btn-close-modal').classList.remove('hidden');
            cerrarModal('traga');
            abrirModalVictoria(data.mensaje, '🍒');
        }, 1500);
    });
}

function jugarCartas() {
    if(cartasJugado) return;
    fetch('/api/tirar-cartas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: window.usuarioLogueado }) })
    .then(r => r.json()).then(data => {
        if(!data.exito) { alert(data.mensaje); return cerrarModal('cartas'); }

        descontarCreditoVisual('Cartas');
        cartasJugado = true;

        document.getElementById('client-card').classList.add('flipped');
        document.getElementById('client-card-val').innerText = data.premio.premio.substring(0,2) || "🃏";
        document.getElementById('client-card-desc').innerText = data.premio.premio;
        document.querySelector('#modal-cartas .btn-close-modal').classList.remove('hidden');

        msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble cliente">🃏 Jugué: Carta Suerte</div><span class="status-text">✓ Enviado</span></div>`;
        msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble bot">${data.mensaje}</div></div>`;

        setTimeout(() => { cerrarModal('cartas'); abrirModalVictoria(data.mensaje, '🃏'); }, 2000);
    });
}

function jugarMoneda() {
    if(monedaJugado) return;
    fetch('/api/tirar-moneda', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: window.usuarioLogueado }) })
    .then(r => r.json()).then(data => {
        if(!data.exito) { alert(data.mensaje); return cerrarModal('moneda'); }

        descontarCreditoVisual('Moneda');
        monedaJugado = true;

        const c = document.getElementById('client-coin');
        c.style.transform = `rotateY(${180 * 5}deg)`;

        msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble cliente">🪙 Jugué: Cara o Cruz</div><span class="status-text">✓ Enviado</span></div>`;
        msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble bot">${data.mensaje}</div></div>`;

        setTimeout(() => {
            c.innerText = data.premio.premio.includes('Cara') ? '🟡' : (data.premio.premio.includes('Cruz') ? '⚪' : '💥');
            document.querySelector('#modal-moneda .btn-close-modal').classList.remove('hidden');
            setTimeout(() => { cerrarModal('moneda'); abrirModalVictoria(data.mensaje, '🪙'); }, 1500); 
        }, 1500);
    });
}

// ==========================================
// NUEVO: SLOT PREMIUM (NAVEGACIÓN NATIVA)
// ==========================================
function abrirSlotPremium() {
    // 1. Avisamos en el chat que el cliente abrió el juego
    msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble cliente">🎰 Entré al Slot Premium</div><span class="status-text">✓ Enviado</span></div>`;
    socket.emit('cliente_accion', { 
        estado: 'En Slot Premium', 
        mensajeCliente: 'Acabo de entrar al Slot Premium.', 
        mensajeBot: '¡Mucha suerte! 🍀 Si ganás, el saldo se acreditará automáticamente en tu cuenta.' 
    });
    msgArea.scrollTop = msgArea.scrollHeight;

    // 2. REFUERZO DEL PUENTE: Aseguramos el storage antes de navegar
    if(window.usuarioLogueado) {
        localStorage.setItem('casino_fenix_user', window.usuarioLogueado);
    }

    // 3. Navegamos en la misma pestaña
    window.location.href = '/slot/index.html';
}

// ==========================================
// NUEVO: TIENDA DE BONOS
// ==========================================
function abrirTienda() {
    document.getElementById('modal-tienda').style.display = 'flex';
}

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
            // Actualizar créditos visuales
            misCreditos = data.nuevoSaldo;
            document.getElementById('txt-creditos').innerText = misCreditos;
        } else {
            alert(data.mensaje);
        }
    } catch (e) { alert("Error de conexión al canjear producto."); }
}
