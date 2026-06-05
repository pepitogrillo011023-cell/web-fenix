const socket = io();
let usuarioSeleccionadoActivo = null;
let raspaYaJugadaAdmin = false;
let currentRotationAdmin = 0;

// VARIABLES GLOBALES DE PAGINACIÓN Y BÚSQUEDA
let clientesGlobal = [];
let clientesBuscador = []; 
let paginaActualClientes = 1;
let filasPorPaginaClientes = 10;

// VARIABLES DEL MODAL DE GESTIÓN
let gestionIdSeleccionado = null;
let gestionUserSeleccionado = null;

socket.emit('identificar_admin');

// BILLETERA
socket.on('billetera_actualizada_en_vivo', (datos) => {
    const inputMonto = document.getElementById('wallet-monto');
    if(inputMonto) {
        inputMonto.value = datos.saldoFormateado;
        inputMonto.style.transition = 'text-shadow 0.3s, color 0.3s';
        inputMonto.style.textShadow = '0 0 25px #10b981';
        setTimeout(() => { inputMonto.style.textShadow = 'none'; }, 1200);
    }
    if(datos.montoTransferido) alert(`💸 ¡MERCADO PAGO EN VIVO!\nIngresó un pago aprobado de $${datos.montoTransferido}.\nSaldo reflejado: ${datos.saldoFormateado}`);
});

async function simularPago() { await fetch('/api/simular-pago-test', { method: 'POST' }); }

// ==========================================
// GESTIÓN DE PESTAÑAS (ENRUTADOR)
// ==========================================
function cambiarSeccion(seccion) {
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active-view'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active-nav'));
    const targetSection = document.getElementById('section-' + seccion);
    const targetBtn = document.getElementById('btn-nav-' + seccion);
    if(targetSection) targetSection.classList.add('active-view');
    if(targetBtn) targetBtn.classList.add('active-nav');
    
    const titulos = { 
        chats: "Chats en Vivo", usuarios: "Operadores Internos", clientes: "Clientes", 
        retiros: "Auditoría de Retiros", billetera: "Billetera y Saldos", creditos: "Solicitudes Créditos",
        costos: "Costos Minijuegos", push: "Notificaciones Masivas", retencion: "Automatización de Retención", 
        eventos: "Consola de Eventos y Minijuegos", apis: "Integraciones y Llaves de API", cierre: "Cierre de Caja", 
        resumen: "Resumen Cajas", historial: "Historial de Cajas", ganamos: "Plataforma Ganamos" 
    };
    document.getElementById('panel-title').innerText = "Panel de Control - " + (titulos[seccion] || "");

    if (seccion === 'eventos') setTimeout(dibujarRuletaAdmin, 100);
    if (seccion === 'creditos') cargarSolicitudesCreditos();
    if (seccion === 'costos') cargarCostosMinijuegos();
}

function cambiarSubJuego(juego) {
    document.querySelectorAll('.event-subview').forEach(s => s.classList.remove('active-subview'));
    document.querySelectorAll('.event-tab-btn').forEach(b => b.classList.remove('active-event-tab'));
    document.getElementById('subview-' + juego).classList.add('active-subview');
    document.getElementById('tab-ev-' + juego).classList.add('active-event-tab');
    if (juego === 'ruleta') setTimeout(dibujarRuletaAdmin, 100);
}

// ==========================================
// POPUP DE PLATAFORMAS EXTERNAS (ENCASTRE PERFECTO)
// ==========================================
function abrirGanamosPopup() {
    // 1. Obtenemos el ancho exacto y real del menú lateral de tu diseño
    const sidebar = document.querySelector('.sidebar');
    const sidebarWidth = sidebar ? sidebar.offsetWidth : 250; // Fallback por seguridad

    // 2. Tamaño de la ventana: todo el ancho sobrante y todo el alto visible
    const popupWidth = window.innerWidth - sidebarWidth;
    const popupHeight = window.innerHeight;

    // 3. Calculamos el grosor de los bordes del navegador (Chrome) y las pestañas
    const borderX = (window.outerWidth - window.innerWidth) / 2;
    const headerHeight = window.outerHeight - window.innerHeight - borderX;

    // 4. Calculamos la posición milimétrica en el monitor
    const popupLeft = window.screenX + borderX + sidebarWidth;
    const popupTop = window.screenY + headerHeight;

    // 5. Abrimos la ventana encajada
    window.open(
        'https://agents.ganamosnet.club/users/all', 
        'GanamosPanel', 
        `width=${popupWidth},height=${popupHeight},top=${popupTop},left=${popupLeft},scrollbars=yes,resizable=yes,toolbar=no,menubar=no,location=no,status=no`
    );
}

// ==========================================
// FUNCIONES MODALES GLOBALES
// ==========================================
function cerrarModalGeneral(id) {
    document.getElementById(id).style.display = 'none';
}

// ==========================================
// FUNCIONES DE CLIENTES (BÚSQUEDA, EDICIÓN, PAGINACIÓN)
// ==========================================
function buscarCliente() {
    const texto = document.getElementById('buscador-clientes').value.toLowerCase();
    if (texto === '') {
        clientesBuscador = [...clientesGlobal];
    } else {
        clientesBuscador = clientesGlobal.filter(c => c.usuarioCasino.toLowerCase().includes(texto));
    }
    paginaActualClientes = 1;
    renderizarTablaClientes();
}

function renderizarTablaClientes() {
    const tbody = document.querySelector('#section-clientes .data-table tbody');
    tbody.innerHTML = '';
    
    let clientesAMostrar = clientesBuscador;
    
    if (filasPorPaginaClientes !== 'todos') {
        const inicio = (paginaActualClientes - 1) * filasPorPaginaClientes;
        const fin = inicio + parseInt(filasPorPaginaClientes);
        clientesAMostrar = clientesBuscador.slice(inicio, fin);
    }

    clientesAMostrar.forEach(c => {
        tbody.innerHTML += `
        <tr>
            <td>${c.usuarioCasino}</td>
            <td style="color:#10b981;font-weight:bold;">$${c.saldo}</td>
            <td style="color:#ffaa00;font-weight:bold;">${c.creditos || 0}</td>
            <td>$${c.wager || 0}</td>
            <td>● Activo</td>
            <td style="display:flex; gap:5px; flex-wrap:wrap;">
                <button class="btn-action-small" onclick="abrirModalGestionFondos('${c._id}', '${c.usuarioCasino}', 'saldo')">💰 Saldo</button>
                <button class="btn-action-small warning" onclick="abrirModalGestionFondos('${c._id}', '${c.usuarioCasino}', 'creditos')">🟡 Créditos</button>
                
                <button class="btn-action-small info" onclick="abrirModalEditarCliente('${c._id}', '${c.usuarioCasino}')">✏️ Editar</button>
            </td>
        </tr>`;
    });

    renderizarControlesPaginacion();
}

function renderizarControlesPaginacion() {
    const contenedor = document.getElementById('paginacion-clientes');
    contenedor.innerHTML = '';
    
    if (filasPorPaginaClientes === 'todos' || clientesBuscador.length === 0) return;

    const totalPaginas = Math.ceil(clientesBuscador.length / filasPorPaginaClientes);
    
    const btnAnt = document.createElement('button');
    btnAnt.className = 'btn-action-small';
    btnAnt.style.backgroundColor = '#1f2937';
    btnAnt.style.color = paginaActualClientes === 1 ? '#4b5563' : 'white';
    btnAnt.innerText = '◀ Anterior';
    btnAnt.disabled = paginaActualClientes === 1;
    btnAnt.onclick = () => { paginaActualClientes--; renderizarTablaClientes(); };
    contenedor.appendChild(btnAnt);

    const info = document.createElement('span');
    info.style.color = '#94a3b8';
    info.style.fontSize = '13px';
    info.style.display = 'flex';
    info.style.alignItems = 'center';
    info.style.padding = '0 10px';
    info.innerText = `Página ${paginaActualClientes} de ${totalPaginas || 1}`;
    contenedor.appendChild(info);

    const btnSig = document.createElement('button');
    btnSig.className = 'btn-action-small';
    btnSig.style.backgroundColor = '#1f2937';
    btnSig.style.color = paginaActualClientes === totalPaginas || totalPaginas === 0 ? '#4b5563' : 'white';
    btnSig.innerText = 'Siguiente ▶';
    btnSig.disabled = paginaActualClientes === totalPaginas || totalPaginas === 0;
    btnSig.onclick = () => { paginaActualClientes++; renderizarTablaClientes(); };
    contenedor.appendChild(btnSig);
}

function cambiarPaginacionClientes() {
    const select = document.getElementById('clientes-por-pagina');
    filasPorPaginaClientes = select.value === 'todos' ? 'todos' : parseInt(select.value);
    paginaActualClientes = 1; 
    renderizarTablaClientes();
}

function abrirModalEditarCliente(id, username) {
    document.getElementById('edit-client-id').value = id;
    document.getElementById('edit-client-user').value = username;
    document.getElementById('edit-client-pass').value = '';
    document.getElementById('modal-editar-cliente').style.display = 'block';
}

async function guardarEdicionCliente() {
    const id = document.getElementById('edit-client-id').value;
    const nuevoUser = document.getElementById('edit-client-user').value.trim();
    const nuevaPass = document.getElementById('edit-client-pass').value.trim();

    if (!nuevoUser) return alert("El nombre no puede estar vacío.");

    try {
        const res = await fetch('/api/editar-cliente', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, nuevoUser, nuevaPass })
        });
        const data = await res.json();
        if(data.success) {
            alert('Cliente editado correctamente');
            document.getElementById('modal-editar-cliente').style.display = 'none';
        } else {
            alert(data.message || 'Error al editar');
        }
    } catch (e) {
        alert('Error de red');
    }
}

// ==========================================
// NUEVO: SISTEMA GESTIÓN DE SALDOS Y CRÉDITOS
// ==========================================
function abrirModalGestionFondos(id, username, tipo) {
    gestionIdSeleccionado = id;
    gestionUserSeleccionado = username;
    
    document.getElementById('gestion-tipo-saldo').value = tipo;
    document.getElementById('gestion-usuario-texto').innerText = username + (tipo === 'saldo' ? ' (Fichas)' : ' (Créditos)');
    document.getElementById('gestion-monto').value = '';
    
    document.getElementById('modal-gestion-creditos').style.display = 'flex';
}

function sumarInputModal(montoAAgregar) {
    const input = document.getElementById('gestion-monto');
    let montoActual = Number(input.value) || 0;
    input.value = montoActual + montoAAgregar;
}

async function ejecutarGestion(accion) {
    const monto = Number(document.getElementById('gestion-monto').value);
    const tipo = document.getElementById('gestion-tipo-saldo').value;
    
    if (!monto || monto <= 0) return alert("Por favor, ingresá un monto mayor a 0.");
    
    // Deshabilitar botones para evitar dobles clics
    const btnDepositar = document.querySelector('#modal-gestion-creditos .btn-save[style*="#10b981"]');
    const btnRetirar = document.querySelector('#modal-gestion-creditos .btn-save[style*="#ef4444"]');
    const textoDepositar = btnDepositar.innerText;
    const textoRetirar = btnRetirar.innerText;
    
    btnDepositar.disabled = true; btnRetirar.disabled = true;
    if(accion === 'add') btnDepositar.innerText = "PROCESANDO...";
    if(accion === 'remove') btnRetirar.innerText = "PROCESANDO...";

    try {
        let res, data;
        
        if (tipo === 'creditos') {
            res = await fetch('/api/gestion-manual-creditos', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: gestionIdSeleccionado, amount: monto, action: accion })
            });
        } else if (tipo === 'saldo') {
            // Si es retirar, enviamos el monto en negativo si la API antigua solo sumaba.
            // Si tu API maneja el retiro diferente, podés ajustar esto.
            let montoFinal = (accion === 'remove') ? -Math.abs(monto) : Math.abs(monto);
            res = await fetch('/api/cargar-saldo', { 
                method: 'POST', headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ usuario: gestionUserSeleccionado, monto: montoFinal }) 
            });
        }
        
        if(res && res.redirected) return window.location.href = '/login.html';
        data = await res.json();
        
        alert(data.message || data.mensaje || "Operación realizada con éxito.");
        cerrarModalGeneral('modal-gestion-creditos');
        
    } catch (error) {
        alert("Error técnico al conectar con el servidor.");
    } finally {
        // Restaurar botones
        btnDepositar.disabled = false; btnRetirar.disabled = false;
        btnDepositar.innerText = textoDepositar; btnRetirar.innerText = textoRetirar;
    }
}

// ==========================================
// FUNCIONES DE CRÉDITOS Y COSTOS
// ==========================================
async function cargarSolicitudesCreditos() {
    try {
        const res = await fetch('/api/transacciones-pendientes?tipo=credit_charge');
        if(!res.ok) return;
        const data = await res.json();
        const tbody = document.querySelector('#tabla-pendientes-creditos tbody');
        tbody.innerHTML = '';
        
        if(!data.transacciones || data.transacciones.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#64748b;">No hay solicitudes pendientes.</td></tr>';
            return;
        }
        data.transacciones.forEach(t => {
            tbody.innerHTML += `
                <tr>
                    <td style="color:#94a3b8; font-size:11px;">${t._id}</td>
                    <td style="font-weight:bold;">${t.userId.usuarioCasino || 'Usuario'}</td>
                    <td style="color:#10b981; font-weight:bold;">$${t.amount}</td>
                    <td><a href="${t.receiptUrl}" target="_blank" style="color:#38bdf8; text-decoration:none;">Ver Foto 🔗</a></td>
                    <td><button class="btn-action-small" onclick="aprobarCreditos('${t._id}', '${t.userId._id}')">✅ Aprobar</button></td>
                </tr>
            `;
        });
    } catch (error) { console.error("Error", error); }
}

async function aprobarCreditos(transactionId, userId) {
    if(!confirm("¿Aprobar esta carga de créditos?")) return;
    try {
        const res = await fetch('/api/aprobar-carga-creditos', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transactionId, cashierId: 'admin' })
        });
        const data = await res.json();
        alert(data.message);
        if(data.success) cargarSolicitudesCreditos();
    } catch (error) { alert("Error al aprobar."); }
}

async function cargarCostosMinijuegos() {
    try {
        const res = await fetch('/api/configuracion-minijuegos');
        if(!res.ok) return;
        const data = await res.json();
        if(data.success && data.minijuegos) {
            data.minijuegos.forEach(juego => {
                const input = document.getElementById(`costo-${juego.name.toLowerCase()}`);
                if(input) {
                    input.value = juego.creditCost;
                    input.dataset.minigameId = juego._id;
                }
            });
        }
    } catch (error) { console.error("Error", error); }
}

async function actualizarCostoMinijuego(nombre, inputId) {
    const input = document.getElementById(inputId);
    const nuevoCosto = Number(input.value);
    const minigameId = input.dataset.minigameId;
    if(!minigameId) return alert("Error: ID de minijuego no encontrado.");
    try {
        const res = await fetch('/api/actualizar-costo-minijuego', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ minigameId, nuevoCosto })
        });
        const data = await res.json();
        alert(data.message);
    } catch (error) { alert("Error al actualizar."); }
}
async function guardarTiendaAdmin() {
    let productos = [];
    for(let i=0; i<4; i++) {
        productos.push({
            nombre: document.getElementById(`p-nombre-${i}`).value,
            costo: Number(document.getElementById(`p-costo-${i}`).value)
        });
    }
    const res = await fetch('/api/admin/actualizar-tienda', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ productos })
    });
    if((await res.json()).exito) alert("Tienda guardada con éxito");
}

// ==========================================
// CONFIGURACIÓN GENÉRICA JUEGOS
// ==========================================
function getConfigFromDOM(tablaId) {
    const filas = document.querySelectorAll(`#${tablaId} tbody tr`);
    const configuracion = [];
    filas.forEach((fila, index) => {
        const premio = fila.querySelector('.input-ruleta-text').value;
        const valor = Number(fila.querySelector('.input-ruleta-val').value) || 0;
        const prob = Number(fila.querySelector('.prob-input').value) || 0;
        if(premio !== "") configuracion.push({ id: index, premio, valor, probabilidad: prob });
    });
    return configuracion;
}

async function guardarEvento(juego) {
    const config = getConfigFromDOM(`tabla-config-${juego}`);
    const sumaProb = config.reduce((acc, curr) => acc + curr.probabilidad, 0);
    if (sumaProb !== 100 && config.length > 0) return alert(`La suma de probabilidad da ${sumaProb}%. Debe dar 100% exacto.`);
    
    const res = await fetch(`/api/guardar-${juego}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ configuracion: config }) });
    if(res.redirected) return window.location.href = '/login.html';
    const data = await res.json();
    if(data.exito) alert(`✅ ¡Configuración guardada!`);
}

function simularJuego(juego) {
    const config = getConfigFromDOM(`tabla-config-${juego}`);
    const sumaProb = config.reduce((acc, curr) => acc + curr.probabilidad, 0);
    if (sumaProb !== 100) return alert("Suma 100% requerida.");

    fetch(`/api/tirar-${juego}-prueba`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ configuracion: config }) })
    .then(res => res.json())
    .then(data => {
        if(!data.exito) return alert("Error.");
        const r = document.getElementById(`res-${juego}`);
        
        if (juego === 'ruleta') {
            document.getElementById('btn-spin-admin').disabled = true;
            const wIdx = config.findIndex(item => item.id === data.premio.id);
            const sliceDegree = 360 / config.length;
            const centerOfWinner = (wIdx * sliceDegree) + (sliceDegree / 2);
            let needed = (270 - centerOfWinner) - (currentRotationAdmin % 360);
            if (needed < 0) needed += 360;
            currentRotationAdmin += needed + (360 * 4);
            document.getElementById('ruleta-admin-canvas').style.transform = `rotate(${currentRotationAdmin}deg)`;
            setTimeout(() => { document.getElementById('btn-spin-admin').disabled = false; r.innerText = `Cayó en: ${data.premio.premio}`; }, 5100);
        } 
        else if (juego === 'tragamonedas') {
            document.getElementById('slot-1').innerText = "⏳"; document.getElementById('slot-2').innerText = "⏳"; document.getElementById('slot-3').innerText = "⏳";
            setTimeout(() => {
                let icons = ['🍒','💎','🔔','🍋','❌','🎰'];
                document.getElementById('slot-1').innerText = icons[Math.floor(Math.random()*icons.length)];
                document.getElementById('slot-2').innerText = icons[Math.floor(Math.random()*icons.length)];
                document.getElementById('slot-3').innerText = data.premio.premio.substring(0,2) || "🎰";
                r.innerHTML = `Resultado: <br><span style="color:white;">${data.premio.premio}</span> ($${data.premio.valor})`;
            }, 1500);
        }
        else if (juego === 'cartas') {
            document.getElementById('card-inner-admin').classList.add('flipped');
            document.getElementById('card-val').innerText = data.premio.premio.substring(0,2) || "🃏";
            document.getElementById('card-desc').innerText = data.premio.premio;
            r.innerHTML = `Ganaste: $${data.premio.valor}`;
        }
        else if (juego === 'moneda') {
            const c = document.getElementById('coin-admin');
            c.style.transform = `rotateY(${180 * 5}deg)`;
            setTimeout(() => {
                c.innerText = data.premio.premio.includes('Cara') ? '🟡' : (data.premio.premio.includes('Cruz') ? '⚪' : '💥');
                r.innerHTML = `Lado: ${data.premio.premio} <br> ($${data.premio.valor})`;
            }, 1000);
        }
    });
}

function simularRaspa(idx) {
    if(raspaYaJugadaAdmin) return;
    const config = getConfigFromDOM('tabla-config-raspa');
    if (config.reduce((acc, curr) => acc + curr.probabilidad, 0) !== 100) return alert("Suma debe dar 100%");
    raspaYaJugadaAdmin = true;
    fetch('/api/tirar-raspa-prueba', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ configuracion: config }) })
    .then(res => res.json()).then(data => {
        const doms = document.querySelectorAll('#tablero-prueba-raspa .raspa-block-card');
        doms[idx].classList.add('scratched');
        doms[idx].querySelector('.raspa-cover-layer').style.opacity = '0';
        doms[idx].innerHTML += `<div class="raspa-prize-text">${data.premio.premio}</div><div class="raspa-value-text">$${data.premio.valor}</div>`;
        document.getElementById('res-raspa').innerHTML = `Ganaste: ${data.premio.premio} ($${data.premio.valor})`;
    });
}

function resetSimulador(juego) {
    if (juego === 'raspa') {
        raspaYaJugadaAdmin = false; document.getElementById('res-raspa').innerText = "";
        document.getElementById('tablero-prueba-raspa').innerHTML = Array(6).fill('<div class="raspa-block-card" onclick="simularRaspa(arguments[0])"><div class="raspa-cover-layer">?</div></div>').map((s,i) => s.replace('arguments[0]', i)).join('');
    } else if (juego === 'cartas') {
        document.getElementById('card-inner-admin').classList.remove('flipped');
        document.getElementById('res-cartas').innerText = "";
    } else if (juego === 'moneda') {
        document.getElementById('coin-admin').style.transform = 'rotateY(0deg)';
        document.getElementById('coin-admin').innerText = '🪙';
        document.getElementById('res-moneda').innerText = "";
    }
}

function dibujarRuletaAdmin() {
    const canvas = document.getElementById('ruleta-admin-canvas'); if(!canvas) return;
    const config = getConfigFromDOM('tabla-config-ruleta');
    const ctx = canvas.getContext('2d'); const center = canvas.width / 2; const radius = center - 5; 
    const sliceAngle = (2 * Math.PI) / (config.length || 1);
    const colors = ['#ff007f', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for(let i=0; i<config.length; i++) {
        ctx.beginPath(); ctx.fillStyle = colors[i % colors.length]; ctx.moveTo(center, center);
        ctx.arc(center, center, radius, i * sliceAngle, (i+1) * sliceAngle); ctx.fill();
        ctx.strokeStyle = "#0b0f19"; ctx.lineWidth = 2; ctx.stroke();
        ctx.save(); ctx.translate(center, center); ctx.rotate((i * sliceAngle) + sliceAngle / 2); 
        ctx.textAlign = "right"; ctx.fillStyle = "white"; ctx.font = "bold 11px sans-serif";
        ctx.fillText(config[i].premio.substring(0,12), radius - 10, 5); ctx.restore();
    }
}

// ==========================================
// SOCKETS Y ACTUALIZACIÓN EN VIVO
// ==========================================
socket.on('cargar_datos_tablas', (datos) => {
    if (datos.clientes) {
        clientesGlobal = datos.clientes;
        buscarCliente(); // Actualiza y aplica la búsqueda si había alguna
    }
    if (datos.retiros) {
        const tbody = document.querySelector('#section-retiros .data-table tbody'); tbody.innerHTML = '';
        datos.retiros.forEach(r => { tbody.innerHTML += `<tr><td>${r.fecha}</td><td>${r.cliente}</td><td>$${r.monto}</td><td>${r.cbuAlias}</td><td>${r.estado}</td></tr>`; });
    }
    
    ['ruleta', 'raspa', 'tragamonedas', 'cartas', 'moneda'].forEach(juego => {
        if (datos[juego] && datos[juego].length > 0) {
            const filas = document.querySelectorAll(`#tabla-config-${juego} tbody tr`);
            datos[juego].forEach((item, idx) => {
                if(filas[idx]) {
                    filas[idx].querySelector('.input-ruleta-text').value = item.premio;
                    filas[idx].querySelector('.input-ruleta-val').value = item.valor;
                    filas[idx].querySelector('.prob-input').value = item.probabilidad;
                }
            });
        }
    });
    setTimeout(dibujarRuletaAdmin, 500);

    if (datos.panelConfig) {
        const c = datos.panelConfig;
        if (c.retencion && c.retencion.length === 5) {
            for(let i=0; i<5; i++) {
                const chk = document.getElementById('ret-chk-'+i); const txt = document.getElementById('ret-txt-'+i);
                if (chk) chk.checked = c.retencion[i].activo; if (txt) txt.value = c.retencion[i].mensaje;
            }
        }
        if (c.apis) {
            if(document.getElementById('api-url') && c.apis.url) document.getElementById('api-url').value = c.apis.url;
            if(document.getElementById('api-user') && c.apis.user) document.getElementById('api-user').value = c.apis.user;
            if(document.getElementById('api-webhook-active') && c.apis.webhookActive !== undefined) document.getElementById('api-webhook-active').checked = c.apis.webhookActive;
        }
        if (c.push) {
            if(document.getElementById('push-titulo')) document.getElementById('push-titulo').value = c.push.titulo || "";
            if(document.getElementById('push-mensaje')) document.getElementById('push-mensaje').value = c.push.mensaje || "";
        }
        if (c.billetera && document.getElementById('wallet-monto')) document.getElementById('wallet-monto').value = c.billetera.monto || "$0,00 ARS";
    }
});

socket.on('lista_usuarios_actualizada', (usuarios) => {
    const listaDiv = document.getElementById('lista-usuarios'); if (!listaDiv) return;
    listaDiv.innerHTML = '';
    usuarios.forEach(user => {
        let tieneMensajesSinLeer = user.historial.some(h => h.emisor === 'cliente' && h.leido === false);
        let claseNoLeido = (tieneMensajesSinLeer && usuarioSeleccionadoActivo !== user.nombre) ? 'unread-chat' : '';
        let dotVisual = (tieneMensajesSinLeer && usuarioSeleccionadoActivo !== user.nombre) ? '<span class="unread-indicator"></span>' : '';
        
        const item = document.createElement('div');
        item.className = `user-item ${usuarioSeleccionadoActivo === user.nombre ? 'selected-user' : ''} ${claseNoLeido}`;
        item.innerHTML = `<div>👤 ${dotVisual}${user.nombre}</div><div class="badge" style="background:#2563eb">${user.estado}</div>`;
        item.onclick = () => {
            usuarioSeleccionadoActivo = user.nombre;
            document.getElementById('active-chat-username').innerText = "Monitoreando a: " + user.nombre;
            document.getElementById('admin-message-input').disabled = false; document.getElementById('btn-enviar-msg').disabled = false;
            socket.emit('admin_cambio_chat_activo', { usuario: user.nombre });
            renderizarHistorialChat(user.historial);
        };
        listaDiv.appendChild(item);
        if (usuarioSeleccionadoActivo === user.nombre) renderizarHistorialChat(user.historial);
    });
});

function renderizarHistorialChat(historial) {
    const areaMsg = document.getElementById('active-chat-messages'); if (!areaMsg) return;
    areaMsg.innerHTML = ''; 
    historial.forEach(h => {
        const wrap = document.createElement('div'); wrap.className = 'admin-bubble-wrapper'; const b = document.createElement('div');
        if (h.emisor === 'bot') { b.className = 'admin-bubble b-bot'; b.innerHTML = `🤖 <b>Bot:</b><br>${h.mensaje}`; wrap.appendChild(b); }
        if (h.emisor === 'admin') { b.className = 'admin-bubble b-admin'; b.innerHTML = `👨‍💼 <b>Vos:</b><br>${h.mensaje}`; wrap.appendChild(b); }
        if (h.emisor === 'cliente') { 
            let check = h.leido ? '<span class="read-receipt seen">✓ Visto</span>' : '<span class="read-receipt">✓ Enviado</span>';
            b.className = 'admin-bubble b-cliente'; b.innerHTML = `👤 <b>Cliente:</b><br>${h.mensaje}`; wrap.appendChild(b); wrap.innerHTML += check;
        }
        areaMsg.appendChild(wrap);
    });
    areaMsg.scrollTop = areaMsg.scrollHeight;
}

function enviarMensajeManual() {
    const input = document.getElementById('admin-message-input'); const texto = input.value.trim();
    if (!texto || !usuarioSeleccionadoActivo) return;
    socket.emit('admin_envia_mensaje', { paraUsuario: usuarioSeleccionadoActivo, mensaje: texto }); input.value = '';
}

// ==========================================
// NUEVO: ATAJOS DE TECLADO (ESC Y ENTER)
// ==========================================
document.addEventListener('keydown', (e) => { 
    // Atajo para enviar mensaje con Enter
    if (e.key === 'Enter' && document.activeElement.id === 'admin-message-input') {
        enviarMensajeManual(); 
    }

    // Atajo para salir del chat activo con ESC
    if (e.key === 'Escape' && usuarioSeleccionadoActivo !== null) {
        cerrarChatActual();
    }
});

function cerrarChatActual() {
    usuarioSeleccionadoActivo = null;
    
    // Restaurar panel de chat a la vista por defecto
    document.getElementById('active-chat-username').innerText = "Ningún usuario seleccionado";
    document.getElementById('active-chat-messages').innerHTML = '<div style="color: #64748b; text-align: center; margin-top: 150px;">Seleccioná un cliente para chatear en tiempo real.</div>';
    
    const inputMsg = document.getElementById('admin-message-input');
    inputMsg.disabled = true;
    inputMsg.value = '';
    document.getElementById('btn-enviar-msg').disabled = true;

    // Quitar el color activo al usuario en la barra lateral
    document.querySelectorAll('.user-item').forEach(item => {
        item.classList.remove('selected-user');
    });
}

async function guardarConfig(seccion) {
    let datos = {};
    if (seccion === 'retencion') {
        datos = [];
        for(let i=0; i<5; i++) {
            const chk = document.getElementById('ret-chk-'+i); const txt = document.getElementById('ret-txt-'+i);
            if(chk && txt) datos.push({ activo: chk.checked, mensaje: txt.value });
        }
    } 
    else if (seccion === 'apis') datos = { url: document.getElementById('api-url').value, user: document.getElementById('api-user').value, webhookActive: document.getElementById('api-webhook-active').checked };
    else if (seccion === 'push') datos = { titulo: document.getElementById('push-titulo').value, mensaje: document.getElementById('push-mensaje').value };
    else if (seccion === 'billetera') datos = { monto: document.getElementById('wallet-monto').value };

    try {
        const res = await fetch('/api/guardar-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seccion: seccion, datos: datos }) });
        if(res.redirected) return window.location.href = '/login.html';
        const result = await res.json();
        if (result.exito) alert('✅ ¡Guardado!');
    } catch (error) { alert('Error de conexión.'); }
}

function abrirImportador() { document.getElementById('modalImportador').style.display = 'block'; }
function cerrarImportador() { document.getElementById('modalImportador').style.display = 'none'; document.getElementById('dataPaste').value = ''; }
async function procesarDatos() {
    const texto = document.getElementById('dataPaste').value; if (!texto.trim()) return alert("Pegá datos válidos.");
    try {
        const res = await fetch('/importar-datos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ datosCrudos: texto }) });
        if(res.redirected) return window.location.href = '/login.html';
        const result = await res.json(); alert(result.mensaje); cerrarImportador();
    } catch (error) { alert("Error de comunicación."); }
}

// ==========================================
// CIERRE DE CAJA
// ==========================================
const opcionesGasto = ["Salida Lean", "Salida Nahue", "Salida Brai", "Salida Tati", "Inyeccion", "Fichas Mega", "Fichas Ganamos", "Bonos", "Sueldo", "Devolucion Reserva", "BB", "BR", "Fichas Oro"];
function addGastoRow() {
    const tr = document.createElement('tr');
    let options = opcionesGasto.map(o => `<option value="${o}">${o}</option>`).join('');
    tr.innerHTML = `<td><select class="input-text-adv gt" onchange="calcCierre()" style="margin-bottom:0;">${options}</select></td><td><input type="text" class="input-text-adv gu" style="margin-bottom:0;"></td><td><input type="number" class="input-text-adv val-num gm" oninput="calcCierre()" style="margin-bottom:0;"></td><td><button class="btn-remove" onclick="this.parentElement.parentElement.remove(); calcCierre()">X</button></td>`;
    document.querySelector('#tabla-gastos tbody').appendChild(tr);
}
function addPropinaRow() {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><input type="text" class="input-text-adv pu" style="margin-bottom:0;"></td><td><input type="number" class="input-text-adv val-num pm" oninput="calcCierre()" style="margin-bottom:0;"></td><td><button class="btn-remove" onclick="this.parentElement.parentElement.remove(); calcCierre()">X</button></td>`;
    document.querySelector('#tabla-propinas tbody').appendChild(tr);
}
function calcCierre() {
    let totG = 0; document.querySelectorAll('.gm').forEach(i => totG += Number(i.value) || 0); 
    document.getElementById('tot-gastos').innerText = totG.toFixed(2); 

    let totP = 0; document.querySelectorAll('.pm').forEach(i => totP += Number(i.value) || 0); 
    document.getElementById('tot-propinas').innerText = totP.toFixed(2);
    
    const ing = Number(document.getElementById('cc-ingreso').value) || 0; 
    const oro = Number(document.getElementById('cc-oro').value) || 0; 
    const ganamos = Number(document.getElementById('cc-ganamos').value) || 0; 

    const egreso = ing + oro + ganamos;
    document.getElementById('cc-egreso').value = egreso;
    
    const esperado = egreso - (totG + totP);
    document.getElementById('cc-esperado').value = esperado;
    
    const real = Number(document.getElementById('cc-real').value) || 0;
    const dif = real - esperado; 
    
    document.getElementById('cc-dif').value = dif; 
    document.getElementById('cc-dif').style.color = dif < 0 ? '#ef4444' : '#10b981';
}
async function guardarCierreDB() {
    if(!document.getElementById('cc-fecha-inicio').value) return alert("Ingresá la fecha de inicio.");
    const gastos = []; document.querySelectorAll('#tabla-gastos tbody tr').forEach(tr => gastos.push({ tipo: tr.querySelector('.gt').value, usuario: tr.querySelector('.gu').value, monto: Number(tr.querySelector('.gm').value) || 0 }));
    const propinas = []; document.querySelectorAll('#tabla-propinas tbody tr').forEach(tr => propinas.push({ usuario: tr.querySelector('.pu').value, monto: Number(tr.querySelector('.pm').value) || 0 }));
    const payload = {
        fecha: document.getElementById('cc-fecha-inicio').value,
        fechaInicio: document.getElementById('cc-fecha-inicio').value,
        fechaFin: document.getElementById('cc-fecha-fin').value,
        horaInicio: document.getElementById('cc-hora-inicio').value, 
        horaFin: document.getElementById('cc-hora-fin').value, 
        turno: document.getElementById('cc-turno').value, 
        cajero: document.getElementById('cc-cajero').value,
        ingreso: Number(document.getElementById('cc-ingreso').value) || 0, 
        saldoOro: Number(document.getElementById('cc-oro').value) || 0, 
        saldoGanamos: Number(document.getElementById('cc-ganamos').value) || 0, 
        egreso: Number(document.getElementById('cc-egreso').value) || 0,
        montoEsperado: Number(document.getElementById('cc-esperado').value) || 0, 
        montoRealFinal: Number(document.getElementById('cc-real').value) || 0, 
        sobranteFaltante: Number(document.getElementById('cc-dif').value) || 0, 
        reserva: Number(document.getElementById('cc-reserva').value) || 0, 
        gastos, 
        propinas
    };
    const res = await fetch('/api/cierre-caja', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    if(res.redirected) return window.location.href = '/login.html';
    if(res.ok) { alert("✅ Guardado!"); if(document.getElementById('res-fecha').value === payload.fecha) buscarResumen(); }
}

addGastoRow(); addPropinaRow(); 
document.getElementById('cc-fecha-inicio').valueAsDate = new Date();
document.getElementById('cc-fecha-fin').valueAsDate = new Date();

// ==========================================
// RESUMEN E HISTORIAL
// ==========================================
const f = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
async function buscarResumen() {
    const fecha = document.getElementById('res-fecha').value; if(!fecha) return;
    const res = await fetch('/api/resumen-cajas/' + fecha); if(res.redirected) return window.location.href = '/login.html';
    const data = await res.json(); const d = data.dia; const m = data.mes;
    document.getElementById('res-diario').innerHTML = `
        <tr><td class="header-row">Ingreso Inicial</td><td>${f.format(d.manana.ingreso)}</td><td>${f.format(d.tarde.ingreso)}</td><td>${f.format(d.noche.ingreso)}</td><td style="color:#9ca3af">${f.format(d.total.ingreso)}</td></tr>
        <tr><td class="header-row">Saldo Oro</td><td>${f.format(d.manana.oro)}</td><td>${f.format(d.tarde.oro)}</td><td>${f.format(d.noche.oro)}</td><td style="color:#9ca3af">${f.format(d.total.oro)}</td></tr>
        <tr><td class="header-row">Saldo Ganamos</td><td>${f.format(d.manana.ganamos)}</td><td>${f.format(d.tarde.ganamos)}</td><td>${f.format(d.noche.ganamos)}</td><td style="color:#9ca3af">${f.format(d.total.ganamos)}</td></tr>
        <tr><td class="header-row">Total Retiros</td><td>${f.format(d.manana.retiros)}</td><td>${f.format(d.tarde.retiros)}</td><td>${f.format(d.noche.retiros)}</td><td style="color:#9ca3af">${f.format(d.total.retiros)}</td></tr>
        <tr><td class="header-row">Monto Real Final</td><td>${f.format(d.manana.real)}</td><td>${f.format(d.tarde.real)}</td><td>${f.format(d.noche.real)}</td><td style="color:#9ca3af">${f.format(d.total.real)}</td></tr>`;
    document.getElementById('res-salida-tot').innerText = f.format(m.salidas.lean + m.salidas.nahue + m.salidas.brai + m.salidas.tati);
    document.getElementById('res-mensual-salidas').innerHTML = `<tr><td class="header-row">TOTAL LEAN</td><td colspan="2">${f.format(m.salidas.lean)}</td></tr><tr><td class="header-row">TOTAL NAHUE</td><td colspan="2">${f.format(m.salidas.nahue)}</td></tr><tr><td class="header-row">TOTAL BRAI</td><td colspan="2">${f.format(m.salidas.brai)}</td></tr><tr><td class="header-row">TOTAL TATI</td><td colspan="2">${f.format(m.salidas.tati)}</td></tr><tr><td class="header-row" style="background:#1d4ed8;">SALDO ORO</td><td colspan="2" style="color:#38bdf8;">${f.format(m.saldos.oro)}</td></tr><tr><td class="header-row" style="background:#1d4ed8;">SALDO GANAMOS</td><td colspan="2" style="color:#38bdf8;">${f.format(m.saldos.ganamos)}</td></tr>`;
    document.getElementById('res-mensual-fichas').innerHTML = `<tr><td class="header-row">MEGAFARAON</td><td>${f.format(m.fichas.mega)}</td></tr><tr><td class="header-row">GANAMOS</td><td>${f.format(m.fichas.ganamos)}</td></tr><tr><td class="header-row">ORO</td><td>${f.format(m.fichas.oro)}</td></tr>`;
    document.getElementById('res-mensual-bonos').innerHTML = `<tr><td class="header-row">CANTIDAD</td><td>${m.bonos.bb.cant}</td><td>${m.bonos.br.cant}</td></tr><tr><td class="header-row">MONTO</td><td>${f.format(m.bonos.bb.monto)}</td><td>${f.format(m.bonos.br.monto)}</td></tr>`;
}
async function buscarHistorialCajas() {
    const fecha = document.getElementById('hist-fecha').value; const c = document.getElementById('historial-resultados'); if(!fecha) return;
    try {
        const res = await fetch('/api/historial-cajas/' + fecha); if(res.redirected) return window.location.href = '/login.html';
        if (!res.ok) throw new Error(); const cierres = await res.json();
        if (cierres.length === 0) return c.innerHTML = `<p style="color:#94a3b8; text-align:center; margin-top:40px;">No hay cajas guardadas para la fecha ${fecha}.</p>`;
        c.innerHTML = cierres.map(cl => `<div class="excel-card" style="border-color: #38bdf8; margin-bottom: 30px;"><h4 style="margin:0 0 15px 0; color:#38bdf8; border-bottom:1px solid #1f2937; padding-bottom:10px;">📅 ${cl.fecha} | 🕒 ${cl.turno || 'S/T'} | 👤 ${cl.cajero || 'N/D'}</h4><div class="excel-grid"><div><table class="table-custom"><tr><th style="width:50%">Apertura</th><td>${cl.horaInicio || '--:--'}</td></tr><tr><th>Cierre</th><td>${cl.horaFin || '--:--'}</td></tr></table><h5 style="color:#a3e635; margin:15px 0 5px 0; font-size:13px;">DETALLE GASTOS</h5><table class="table-custom"><thead><tr><th>Tipo</th><th>Destino</th><th>Monto</th></tr></thead><tbody>${(cl.gastos && cl.gastos.length > 0) ? cl.gastos.map(g => `<tr><td>${g.tipo}</td><td>${g.usuario}</td><td style="text-align:right;">${f.format(g.monto)}</td></tr>`).join('') : '<tr><td colspan="3" style="text-align:center; color:#64748b;">Sin gastos</td></tr>'}</tbody></table></div><div><table class="table-custom"><tr><th>Ingreso</th><th>Oro</th><th>Ganamos</th><th>Egreso</th></tr><tr><td style="text-align:right;">${f.format(cl.ingreso || 0)}</td><td style="text-align:right;">${f.format(cl.saldoOro || 0)}</td><td style="text-align:right;">${f.format(cl.saldoGanamos || 0)}</td><td style="text-align:right; color:#ef4444; font-weight:bold;">${f.format(cl.egreso || 0)}</td></tr></table><table class="table-custom" style="margin-top:15px;"><tr><th>Esperado (Teórico)</th><th>Real Final (Caja)</th><th>Diferencia</th></tr><tr><td style="text-align:right;">${f.format(cl.montoEsperado || 0)}</td><td style="text-align:right; font-weight:bold; color:#38bdf8;">${f.format(cl.montoRealFinal || 0)}</td><td style="text-align:right; font-weight:bold; color:${(cl.sobranteFaltante || 0) < 0 ? '#ef4444' : '#10b981'};">${f.format(cl.sobranteFaltante || 0)}</td></tr></table><h5 style="color:#a3e635; margin:15px 0 5px 0; font-size:13px;">PROPINAS</h5><table class="table-custom"><thead><tr><th>Usuario</th><th>Monto</th></tr></thead><tbody>${(cl.propinas && cl.propinas.length > 0) ? cl.propinas.map(p => `<tr><td>${p.usuario}</td><td style="text-align:right;">${f.format(p.monto)}</td></tr>`).join('') : '<tr><td colspan="2" style="text-align:center; color:#64748b;">Sin propinas</td></tr>'}</tbody></table></div></div></div>`).join('');
    } catch (e) { c.innerHTML = `<div style="background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; padding: 20px; border-radius: 8px; text-align: center;"><p style="color:#cbd5e1;">Error al cargar el historial.</p></div>`; }
}
