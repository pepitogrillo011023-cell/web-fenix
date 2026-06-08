// MODIFICADO: Forzamos la conexión directa por WebSocket para evitar errores 400 en Render
const socket = io({
    transports: ['websocket'],
    upgrade: false
});

const msgArea = document.getElementById('messages-area'); //
window.usuarioLogueado = null; //

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
// VISTAS Y AUTENTICACIÓN (CORREGIDO Y SEGURO)
// ==========================================
function cambiarVista(vista) {
    const vLogin = document.getElementById('vista-login');
    const vRegistro = document.getElementById('vista-registro');
    const vChat = document.getElementById('vista-chat');
    const btnCerrar = document.getElementById('btn-cerrar-sesion');
    const heroWelcome = document.getElementById('hero-welcome-container');

    // Ocultamos todo primero (solo si existen)
    if (vLogin) vLogin.classList.add('hidden');
    if (vRegistro) vRegistro.classList.add('hidden');
    if (vChat) vChat.classList.add('hidden');
    if (btnCerrar) btnCerrar.classList.add('hidden');

    // Mostramos lo que corresponde
    if (vista === 'login' && vLogin) vLogin.classList.remove('hidden');
    if (vista === 'registro' && vRegistro) vRegistro.classList.remove('hidden');
    if (vista === 'chat' && vChat) {
        vChat.classList.remove('hidden');
        vChat.style.display = 'flex';
        if (btnCerrar) btnCerrar.classList.remove('hidden');
        if (heroWelcome) heroWelcome.classList.remove('hidden');
    }
}

async function registrarUsuario() {
    const u = document.getElementById('reg-user') ? document.getElementById('reg-user').value.trim() : ''; 
    const p = document.getElementById('reg-pass') ? document.getElementById('reg-pass').value.trim() : '';
    if(!u || !p) return alert("Por favor, completá ambos campos.");
    
    const btn = document.getElementById('btn-registro'); 
    if (btn) { btn.innerText = 'Creando...'; btn.disabled = true; }

    try {
        const res = await fetch('/api/registrar-cliente', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: u, password: p }) });
        const data = await res.json();
        if (btn) { btn.innerText = 'Crear Cuenta y Entrar'; btn.disabled = false; }
        if (data.exito) {
            alert("¡Cuenta creada con éxito! Ingresando al chat...");
            document.getElementById('login-user').value = u; document.getElementById('login-pass').value = p;
            validarAccesoManual(); 
        } else alert(data.mensaje);
    } catch (e) { 
        if (btn) { btn.innerText = 'Crear Cuenta y Entrar'; btn.disabled = false; }
        alert("Error al registrarse."); 
    }
}

function validarAccesoManual() { validarAcceso(false); }

function validarAcceso(esAutoLogin) {
    const u = document.getElementById('login-user').value.trim(); const p = document.getElementById('login-pass').value.trim();
    if (!u || !p) { if(!esAutoLogin) alert('Ingresá usuario y contraseña.'); return; }

    const btn = document.getElementById('btn-login'); 
    if (btn) { btn.innerText = 'Validando...'; btn.disabled = true; }

    fetch('/api/validar-cliente', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: u, password: p }) })
    .then(res => res.json()).then(data => {
        if (btn) { btn.innerText = 'Ingresar al Chat'; btn.disabled = false; }
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
        if (btn) { btn.innerText = 'Ingresar al Chat'; btn.disabled = false; }
        if(!esAutoLogin) alert('Error con el servidor.'); 
    });
}

function cerrarSesion() {
    localStorage.removeItem('casino_fenix_user');
    localStorage.removeItem('casino_fenix_pass');
    socket.disconnect(); socket.connect(); 
    window.usuarioLogueado = null;
    if (document.getElementById('login-user')) document.getElementById('login-user').value = ''; 
    if (document.getElementById('login-pass')) document.getElementById('login-pass').value = '';
    if (document.getElementById('header-title-text')) document.getElementById('header-title-text').innerText = "Chat Asistencia";
    const badge = document.getElementById('badge-creditos');
    if (badge) badge.classList.add('hidden');
    msgArea.innerHTML = '';
    const hero = document.getElementById('hero-welcome-container');
    if (hero) hero.classList.add('hidden');
    cambiarVista('login');
}

// ==========================================
// PROTECCIÓN DE LISTENERS
// ==========================================
const loginPassInput = document.getElementById('login-pass');
if (loginPassInput) {
    loginPassInput.addEventListener('keypress', function (e) { 
        if (e.key === 'Enter') validarAccesoManual(); 
    });
}

const regPassInput = document.getElementById('reg-pass');
if (regPassInput) {
    regPassInput.addEventListener('keypress', function (e) { 
        if (e.key === 'Enter') registrarUsuario(); 
    });
}

const chatInput = document.getElementById('client-raw-input');
if (chatInput) {
    chatInput.addEventListener('keypress', function (e) { 
        if (e.key === 'Enter') enviarMensajeLibreCliente(); 
    });
}

// ==========================================
// EVENTOS DE SOCKET
// ==========================================
socket.on('resultado_validacion', (respuesta) => {
    if (respuesta.exito) {
        if (document.getElementById('header-title-text')) document.getElementById('header-title-text').innerText = "Conectado";
        if (document.getElementById('welcome-name')) document.getElementById('welcome-name').innerText = "¡Hola, " + respuesta.usuario + "!";

        misCreditos = respuesta.creditos || 0;
        if (document.getElementById('txt-creditos')) document.getElementById('txt-creditos').innerText = misCreditos;
        if (document.getElementById('badge-creditos')) document.getElementById('badge-creditos').classList.remove('hidden');

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
    if (document.getElementById('txt-creditos')) document.getElementById('txt-creditos').innerText = misCreditos;
});

function descontarCreditoVisual(juegoKey) {
    let costo = costosMinijuegosCache[juegoKey] || 0;
    if(misCreditos >= costo && costo > 0) {
        misCreditos -= costo;
        if (document.getElementById('txt-creditos')) document.getElementById('txt-creditos').innerText = misCreditos;
    }
}

// ==========================================
// MENÚS Y CHAT
// ==========================================
function irAlMenuPrincipal() {
    if (typeof socket !== 'undefined' && socket.emit) {
        socket.emit('cliente_cambia_pestaña', { pestaña: 'Menú' });
    }
    const dep = document.getElementById('container-deposit-options');
    const chatIn = document.getElementById('container-chat-input');
    const games = document.getElementById('container-games-options');
    const menu = document.getElementById('container-menu-options');
    const formRetiro = document.getElementById('container-retiro-form');

    if (dep) dep.style.display = 'none';
    if (chatIn) chatIn.style.display = 'none';
    if (games) games.style.display = 'none';
    if (msgArea) msgArea.style.display = 'none';
    // --- ESTE ES EL CAMBIO: Ocultamos y vaciamos el chat ---
    if (msgArea) {
        msgArea.style.display = 'none';
        msgArea.innerHTML = '';
        if (formRetiro) formRetiro.style.display = 'none';// Esto borra todos los mensajes acumulados
    }
    if (menu) menu.style.display = 'grid'; // <-- Usamos grid para que se vea ordenado
}

function mostrarChat() {
    const menu = document.getElementById('container-menu-options');
    const games = document.getElementById('container-games-options');
    const chatIn = document.getElementById('container-chat-input');

    if (menu) menu.style.display = 'none';
    if (games) games.style.display = 'none';
    if (msgArea) msgArea.style.display = 'flex';
    if (chatIn) chatIn.style.display = 'flex';
    msgArea.scrollTop = msgArea.scrollHeight;
}

function mostrarSubMenuMinijuegos() {
    const menu = document.getElementById('container-menu-options');
    const games = document.getElementById('container-games-options');

    if (menu) menu.style.display = 'none';
    if (msgArea) msgArea.style.display = 'none'; 
    if (games) games.style.display = 'grid'; // <-- Usamos grid para los botones
}

function seleccionarOpcion(opcion) {
    const menu = document.getElementById('container-menu-options');
    socket.emit('cliente_cambia_pestaña', { pestaña: opcion });
    if (menu) menu.style.display = 'none';
    
    if (opcion === 'Depósito') {
        mostrarChat();
        const dep = document.getElementById('container-deposit-options');
        if (dep) dep.style.display = 'grid';
        let msgBot = `<b>CBU:</b> 0000151500038126204154<br><b>ALIAS:</b> 20719709.URBANATRADE<br><br>Enviá el comprobante 📄`;
        msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble cliente">${opcion}</div><span class="status-text">✓ Enviado</span></div><div class="bubble-wrapper"><div class="bubble bot">${msgBot}</div></div>`;
        socket.emit('cliente_accion', { estado: 'Depósito', mensajeCliente: opcion, mensajeBot: msgBot });

    } else if (opcion === 'Soporte') {
        mostrarChat();
        let msgBot = `🛠️ <b>Soporte:</b> Escribí tu consulta, un asesor te responderá.`;
        msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble cliente">${opcion}</div><span class="status-text">✓ Enviado</span></div><div class="bubble-wrapper"><div class="bubble bot">${msgBot}</div></div>`;
        socket.emit('cliente_accion', { estado: 'Soporte', mensajeCliente: opcion, mensajeBot: msgBot });

    } else if (opcion === 'Retiro') {
        // 1. Ocultamos el menú principal
        const menu = document.getElementById('container-menu-options');
        if (menu) menu.style.display = 'none';

        // 2. Ocultamos el chat si estaba abierto
        const msgArea = document.getElementById('messages-area');
        const chatInput = document.getElementById('container-chat-input');
        if (msgArea) msgArea.style.display = 'none';
        if (chatInput) chatInput.style.display = 'none';

        // 3. MOSTRAMOS EL FORMULARIO DE RETIRO
        const formRetiro = document.getElementById('container-retiro-form');
        if (formRetiro) {
            formRetiro.style.display = 'flex'; 
        } else {
            console.error("No se encontró el contenedor del formulario de retiro");
        }

    } else if (opcion === 'Referido') {
        // --- AQUÍ ESTÁ LA NUEVA LÓGICA ---
        abrirModalReferidos();
        // Volvemos a mostrar el menú para que no desaparezca si el usuario cierra el modal
        if (menu) menu.style.display = 'grid'; 

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
    const input = document.getElementById('client-raw-input'); 
    if (!input) return;
    const texto = input.value.trim(); 
    if (texto === '') return;
    msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble cliente">${texto}</div><span class="status-text">✓ Enviado</span></div>`;
    msgArea.scrollTop = msgArea.scrollHeight;
    socket.emit('cliente_envia_mensaje_libre', { mensaje: texto }); 
    input.value = '';
}

socket.on('recibir_mensaje_admin', (datos) => {
    mostrarChat(); 
    
    // Si el servidor no manda la hora, el cliente calcula su hora actual en formato 24hs
    const horaActual = datos.hora || new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

    // Modificamos el HTML para meter el tag de la hora abajo del mensaje
    msgArea.innerHTML += `
        <div class="bubble-wrapper">
            <div class="bubble admin">
                <b>Asesor:</b> ${datos.mensaje}
                <span class="hora-chat">${horaActual}</span>
            </div>
        </div>
    `;

    document.querySelectorAll('.status-text').forEach(m => { m.innerText = '✓ Visto'; m.classList.add('visto'); });
    msgArea.scrollTop = msgArea.scrollHeight;
});

socket.on('tus_mensajes_fueron_leidos', () => {
    document.querySelectorAll('.status-text').forEach(m => { m.innerText = '✓ Visto'; m.classList.add('visto'); });
});
async function abrirModalReferidos() {
    console.log("Intentando abrir modal referidos...");
    try {
        // AGREGAMOS { credentials: 'include' } AQUÍ
        const res = await fetch('/api/mi-perfil', {
            method: 'GET',
            credentials: 'include' 
        });
        
        const data = await res.json();

        if (data.exito) {
            const link = "https://casino-fenix.onrender.com/registro.html?ref=" + data.referralCode;
            const input = document.getElementById('input-link-referido');
            if (input) {
                input.value = link;
                document.getElementById('modal-referidos').style.display = 'flex';
            }
        } else {
            // Esto se mostrará si realmente no hay sesión o hay otro error
            console.error("Error del servidor:", data.mensaje);
            alert("Error: " + data.mensaje);
        }
    } catch (error) {
        console.error("Error de conexión:", error);
    }
}
async function enviarRetiro() {
    // Usamos la variable global que ya tienes al inicio de este archivo
    const usuario = window.usuarioLogueado;
    
    // Asegúrate de que estos IDs existen en tu HTML
    const monto = document.getElementById('input-monto-retiro').value;
    const cbuAlias = document.getElementById('input-cbu-alias').value;
    const titular = document.getElementById('input-titular').value;

    if (!monto || !cbuAlias || !titular) {
        alert("Por favor, completá todos los datos del retiro.");
        return;
    }

    try {
        const res = await fetch('/api/solicitar-retiro', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario, monto, cbuAlias, titular })
        });
        
        const data = await res.json();

        if (data.exito) {
            alert("¡Solicitud enviada con éxito! El cajero la procesará pronto.");
            const textoRetiro = `💸 SOLICITUD DE RETIRO:\n💰 Monto: $${monto}\n🏦 CBU/Alias: ${cbuAlias}\n👤 Titular: ${titular}`;
            
            // Replicamos la misma función que usas para enviar mensajes en el chat
            socket.emit('cliente_envia_mensaje_libre', { mensaje: textoRetiro });
            
            // Mostramos el mensaje también en el chat del cliente para que le quede el registro
            const msgArea = document.getElementById('messages-area');
            if (msgArea) {
                msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble cliente">${textoRetiro.replace(/\n/g, '<br>')}</div><span class="status-text">✓ Enviado</span></div>`;
                msgArea.scrollTop = msgArea.scrollHeight;
            }
            // Opcional: Limpiar campos o cerrar el modal
            document.getElementById('input-monto-retiro').value = '';
            document.getElementById('input-cbu-alias').value = '';
            document.getElementById('input-titular').value = '';
            irAlMenuPrincipal();
        } else {
            // Aquí mostrará el mensaje de "Faltan XX horas" que configuramos en el server
            alert(data.mensaje);
        }
    } catch (error) {
        console.error("Error al enviar retiro:", error);
        alert("Error de conexión con el servidor.");
    }
}

// Función para copiar (también global)
function copiarLinkReferido() {
    const input = document.getElementById('input-link-referido');
    input.select();
    document.execCommand('copy');
    
    // Feedback visual
    const btn = document.querySelector('#modal-referidos .btn-spin');
    const textoOriginal = btn.innerText;
    btn.innerText = "¡COPIADO!";
    btn.style.background = "#10b981"; 
    
    setTimeout(() => {
        btn.innerText = textoOriginal;
        btn.style.background = "#8b5cf6";
    }, 2000);
}

// ==========================================
// JUEGOS Y MODALES
// ==========================================
function abrirModalVictoria(msg, emoji = '🎉') {
    const cleanMsg = msg.replace(/<[^>]*>?/gm, '\n');
    if (document.getElementById('vic-msg')) document.getElementById('vic-msg').innerText = cleanMsg;
    if (document.getElementById('vic-emoji')) document.getElementById('vic-emoji').innerText = emoji;
    const modal = document.getElementById('modal-victoria');
    if (modal) modal.style.display = 'flex';
}

function cerrarModalVictoria() { 
    const modal = document.getElementById('modal-victoria');
    if (modal) modal.style.display = 'none'; 
}

function abrirModal(juego) {
    if (juego === 'cargar-creditos') {
        const mod = document.getElementById('modal-cargar-creditos');
        if (mod) mod.style.display = 'block';
        return;
    }

    fetch(`/api/${juego === 'traga' ? 'tragamonedas' : juego}-config`).then(res => res.json()).then(data => {
        if(!data.exito || data.config.length === 0) return alert("Juego en mantenimiento.");

        if(juego === 'ruleta') {
            ruletaConfig = data.config; currentRotation = 0;
            const c = document.getElementById('ruleta-canvas'); 
            if (c) {
                const ctx = c.getContext('2d');
                ctx.clearRect(0,0,c.width,c.height); const sl = (2*Math.PI)/ruletaConfig.length; const cols = ['#ff007f','#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444'];
                for(let i=0; i<ruletaConfig.length; i++) {
                    ctx.beginPath(); ctx.fillStyle = cols[i%cols.length]; ctx.moveTo(140,140); ctx.arc(140,140,138,i*sl,(i+1)*sl); ctx.fill(); ctx.stroke();
                    ctx.save(); ctx.translate(140,140); ctx.rotate(i*sl+sl/2); ctx.textAlign="right"; ctx.fillStyle="white"; ctx.font="bold 13px sans-serif"; ctx.fillText(ruletaConfig[i].premio.substring(0,15), 125, 5); ctx.restore();
                }
                c.style.transition='none'; c.style.transform='rotate(0deg)'; void c.offsetWidth; c.style.transition='transform 5s cubic-bezier(0.25,0.1,0.15,1)';
            }
            if (document.getElementById('btn-spin-ruleta')) document.getElementById('btn-spin-ruleta').disabled = false;
        }
        else if (juego === 'raspa') {
            raspaConfig = data.config; raspaYaJugada = false;
            const tablero = document.getElementById('client-tablero-raspa');
            if (tablero) tablero.innerHTML = Array(6).fill('<div class="raspa-block-card" onclick="jugarRaspa(arguments[0])"><div class="raspa-cover-layer">?</div></div>').map((s,i) => s.replace('arguments[0]', i)).join('');
        }
        else if (juego === 'traga') { 
            tragaJugado = false; 
            if (document.getElementById('btn-spin-traga')) document.getElementById('btn-spin-traga').disabled = false; 
            ['1','2','3'].forEach(i => {
                const slot = document.getElementById(`client-slot-${i}`);
                if (slot) slot.innerText='🎰';
            }); 
        }
        else if (juego === 'cartas') { 
            cartasJugado = false; 
            const card = document.getElementById('client-card');
            if (card) card.classList.remove('flipped'); 
        }
        else if (juego === 'moneda') { 
            monedaJugado = false; 
            const coin = document.getElementById('client-coin');
            if (coin) {
                coin.style.transform='rotateY(0deg)'; 
                coin.innerText='🪙';
            }
        }

        document.querySelectorAll('.btn-close-modal').forEach(b => b.classList.add('hidden'));
        const modal = document.getElementById(`modal-${juego}`);
        if (modal) modal.style.display = 'block';
    });
}

function cerrarModal(juego) { 
    const modal = document.getElementById(`modal-${juego}`);
    if (modal) modal.style.display = 'none'; 
}

async function solicitarCargaCreditos() {
    const montoEl = document.getElementById('input-creditos-monto');
    const urlEl = document.getElementById('input-creditos-url');
    if (!montoEl || !urlEl) return;
    
    const monto = montoEl.value;
    const url = urlEl.value;
    if(!monto || !url) return alert("Por favor, ingresá el monto y la URL del comprobante.");

    try {
        const res = await fetch('/api/solicitar-carga-creditos', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: window.usuarioLogueado, amount: Number(monto), receiptUrl: url })
        });
        const data = await res.json();
        if(data.success) {
            cerrarModal('cargar-creditos');
            montoEl.value = '';
            urlEl.value = '';
            msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble cliente">🟡 Reporté pago de ${monto} Créditos.<br>Comprobante adjuntado.</div><span class="status-text">✓ Enviado</span></div>`;
            msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble bot">✅ ${data.message}</div></div>`;
            msgArea.scrollTop = msgArea.scrollHeight;
            socket.emit('cliente_accion', { estado: 'Carga Créditos', mensajeCliente: `Reporté pago de ${monto} Créditos`, mensajeBot: data.message });
            mostrarChat(); 
        } else { alert(data.message || "Error al procesar la solicitud."); }
    } catch(e) { alert("Error de conexión al solicitar los créditos."); }
}

function jugarRuleta() {
    const btn = document.getElementById('btn-spin-ruleta');
    if (btn) btn.disabled = true;
    fetch('/api/tirar-ruleta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: window.usuarioLogueado }) })
    .then(r => r.json()).then(data => {
        if(!data.exito) { 
            alert(data.mensaje); 
            if (btn) btn.disabled = false;
            return cerrarModal('ruleta'); 
        }

        descontarCreditoVisual('Ruleta');

        const wIdx = ruletaConfig.findIndex(i => i.id === data.premio.id); const sl = 360/ruletaConfig.length;
        let needed = (270 - ((wIdx*sl)+(sl/2))) - (currentRotation%360); if(needed<0) needed+=360;
        currentRotation += needed + (360*5);
        const canvas = document.getElementById('ruleta-canvas');
        if (canvas) canvas.style.transform = `rotate(${currentRotation}deg)`;

        msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble cliente">🎯 Jugué: Ruleta</div><span class="status-text">✓ Enviado</span></div>`;
        msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble bot">${data.mensaje}</div></div>`;

        setTimeout(() => { 
            const btnClose = document.querySelector('#modal-ruleta .btn-close-modal');
            if (btnClose) btnClose.classList.remove('hidden'); 
            cerrarModal('ruleta'); 
            abrirModalVictoria(data.mensaje, '🎯'); 
        }, 5300);
    });
}

function jugarRaspa(idx) {
    if(raspaYaJugada) return; raspaYaJugada = true;
    const cards = document.querySelectorAll('#client-tablero-raspa .raspa-block-card'); 
    if (cards[idx]) {
        const cover = cards[idx].querySelector('.raspa-cover-layer');
        if (cover) cover.innerText = "⏳";
    }

    fetch('/api/tirar-raspa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: window.usuarioLogueado }) })
    .then(r => r.json()).then(data => {
        if(!data.exito) { alert(data.mensaje); return cerrarModal('raspa'); }

        descontarCreditoVisual('Raspa');

        const pools = raspaConfig.filter(i => i.id !== data.premio.id).sort(() => Math.random() - 0.5);
        if (cards[idx]) {
            cards[idx].classList.add('scratched'); 
            const cover = cards[idx].querySelector('.raspa-cover-layer');
            if (cover) cover.style.opacity = '0';
            cards[idx].innerHTML += `<div class="raspa-prize-text">${data.premio.premio}</div><div class="raspa-value-text">$${data.premio.valor}</div>`;
        }

        msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble cliente">🎫 Jugué: Raspa y Gana</div><span class="status-text">✓ Enviado</span></div>`;
        msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble bot">${data.mensaje}</div></div>`;

        setTimeout(() => {
            let rIdx = 0; cards.forEach((c, i) => { if(i!==idx) { 
                c.classList.add('others-revealed'); 
                const cover = c.querySelector('.raspa-cover-layer');
                if (cover) cover.style.opacity='0'; 
                c.innerHTML += `<div class="raspa-prize-text">${pools[rIdx].premio}</div><div class="raspa-value-text">$${pools[rIdx].valor}</div>`; 
                rIdx++; 
            }});
            const btnClose = document.querySelector('#modal-raspa .btn-close-modal');
            if (btnClose) btnClose.classList.remove('hidden'); 
            setTimeout(() => { cerrarModal('raspa'); abrirModalVictoria(data.mensaje, '🎫'); }, 1500); 
        }, 800);
    });
}

function jugarTragamonedas() {
    if(tragaJugado) return;
    const btn = document.getElementById('btn-spin-traga');
    if (btn) btn.disabled = true;

    fetch('/api/tirar-tragamonedas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: window.usuarioLogueado }) })
    .then(r => r.json()).then(data => {
        if(!data.exito) { alert(data.mensaje); return cerrarModal('traga'); }

        descontarCreditoVisual('Tragamonedas');
        tragaJugado = true;

        if (document.getElementById('client-slot-1')) document.getElementById('client-slot-1').innerText="⏳"; 
        if (document.getElementById('client-slot-2')) document.getElementById('client-slot-2').innerText="⏳"; 
        if (document.getElementById('client-slot-3')) document.getElementById('client-slot-3').innerText="⏳";

        msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble cliente">🍒 Jugué: Slots</div><span class="status-text">✓ Enviado</span></div>`;
        msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble bot">${data.mensaje}</div></div>`;

        setTimeout(() => {
            let icons = ['🍒','💎','🔔','🍋','❌'];
            if (document.getElementById('client-slot-1')) document.getElementById('client-slot-1').innerText = icons[Math.floor(Math.random()*icons.length)];
            if (document.getElementById('client-slot-2')) document.getElementById('client-slot-2').innerText = icons[Math.floor(Math.random()*icons.length)];
            if (document.getElementById('client-slot-3')) document.getElementById('client-slot-3').innerText = data.premio.premio.substring(0,2) || "🎰";
            
            const btnClose = document.querySelector('#modal-traga .btn-close-modal');
            if (btnClose) btnClose.classList.remove('hidden');
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

        const card = document.getElementById('client-card');
        if (card) card.classList.add('flipped');
        
        if (document.getElementById('client-card-val')) document.getElementById('client-card-val').innerText = data.premio.premio.substring(0,2) || "🃏";
        if (document.getElementById('client-card-desc')) document.getElementById('client-card-desc').innerText = data.premio.premio;
        
        const btnClose = document.querySelector('#modal-cartas .btn-close-modal');
        if (btnClose) btnClose.classList.remove('hidden');

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
        if (c) c.style.transform = `rotateY(${180 * 5}deg)`;

        msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble cliente">🪙 Jugué: Cara o Cruz</div><span class="status-text">✓ Enviado</span></div>`;
        msgArea.innerHTML += `<div class="bubble-wrapper"><div class="bubble bot">${data.mensaje}</div></div>`;

        setTimeout(() => {
            if (c) c.innerText = data.premio.premio.includes('Cara') ? '🟡' : (data.premio.premio.includes('Cruz') ? '⚪' : '💥');
            const btnClose = document.querySelector('#modal-moneda .btn-close-modal');
            if (btnClose) btnClose.classList.remove('hidden');
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
async function abrirTienda() {
    const modal = document.getElementById('modal-tienda');
    const contenedor = document.getElementById('contenedor-productos-tienda');

    if (!modal || !contenedor) return;

    try {
        // 1. Pedimos los productos actuales al servidor
        const respuesta = await fetch('/api/tienda');
        const productos = await respuesta.json();

        // 2. Limpiamos y redibujamos con el nuevo diseño
        contenedor.innerHTML = '';
        productos.forEach(prod => {
            contenedor.innerHTML += `
                <div class="producto-card">
                    <span class="nombre-prod">${prod.nombre}</span>
                    <span class="precio-prod">${prod.costo} CR</span>
                    <button class="btn-canjear-card" onclick="canjearProducto('${prod.nombre}', ${prod.costo})">
                        Canjear
                    </button>
                </div>
            `;
        });

        // 3. Mostramos el modal
        modal.style.display = 'flex';
    } catch (e) {
        console.error("Error al cargar la tienda:", e);
        alert("No se pudo conectar con la tienda.");
    }
    
    window.canjearProducto = async function(nombre, costo) {
    console.log(`Intentando canjear: ${nombre} por ${costo} CR`);

    // 1. Verificación básica de seguridad
    const usuario = localStorage.getItem('casino_fenix_user');
    if (!usuario) {
        alert('Debes iniciar sesión para realizar un canje.');
        return;
    }

    // 2. Confirmación opcional
    if (!confirm(`¿Confirmás el canje de "${nombre}" por ${costo} CR?`)) {
        return;
    }

    try {
        // 3. Enviamos la petición al servidor
        const response = await fetch('/api/canjear-producto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                usuario: usuario, 
                nombre: nombre, 
                costo: costo 
            })
        });

        const data = await response.json();

        // 4. Procesamos la respuesta
        if (data.exito) {
            alert("¡Canje realizado con éxito! " + (data.mensaje || ""));
            // Opcional: recargar la tienda o actualizar el saldo visualmente aquí
        } else {
            alert("Error al canjear: " + (data.mensaje || "Error desconocido"));
        }
    } catch (error) {
        console.error("Error al canjear:", error);
        alert("Hubo un error de conexión con el servidor.");
    }
};
}
// ==============================================================
// MENÚ DESPLEGABLE DE TRES PUNTOS (PEGADO AL FINAL)
// ==============================================================
document.addEventListener('DOMContentLoaded', () => {
    const btnMenu = document.getElementById('btn-user-menu');
    const dropdownContent = document.getElementById('dropdown-menu-content');

    if (btnMenu && dropdownContent) {
        btnMenu.addEventListener('click', (e) => {
            e.stopPropagation(); 
            dropdownContent.classList.toggle('show');
        });

        window.addEventListener('click', () => {
            if (dropdownContent.classList.contains('show')) {
                dropdownContent.classList.remove('show');
            }
        });
    }

    // Escucha el botón de cerrar sesión
    const btnLogout = document.getElementById('btn-user-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            localStorage.removeItem('casino_fenix_user');
            localStorage.removeItem('casino_fenix_pass');
        });
    }

    // Lógica para cambiar contraseña (limpia y sin duplicados)
    const btnChangePass = document.getElementById('btn-change-password');
    if (btnChangePass) {
        btnChangePass.addEventListener('click', async (e) => {
            e.preventDefault();
            
            const nuevaPassword = prompt("Ingresá tu nueva contraseña (mínimo 6 caracteres):");
            
            if (nuevaPassword !== null && nuevaPassword.trim().length >= 6) {
                try {
                    const response = await fetch('/api/cambiar-contrasena', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ nuevaPassword })
                    });

                    const data = await response.json();
                    
                    if (response.ok) {
                        alert("¡Contraseña actualizada correctamente! ✅");
                    } else {
                        alert("Error: " + (data.message || "No se pudo actualizar"));
                    }
                } catch (err) {
                    console.error("Error:", err);
                    alert("Error de conexión con el servidor.");
                }
            } else if (nuevaPassword !== null) {
                alert("❌ La contraseña es demasiado corta. Intentá de nuevo.");
            }
        });
    }
});
