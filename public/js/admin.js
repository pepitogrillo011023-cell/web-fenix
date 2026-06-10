const socket = io({
    transports: ['websocket'],
    upgrade: false
});
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
        eventos: "Consola de Eventos y Minijuegos", cargas: "Cargas Pendientes", apis: "Integraciones y Llaves de API", administrarcajas: "Administración de Cajas", 
        ganamos: "Plataforma Ganamos" 
    };
    document.getElementById('panel-title').innerText = "Panel de Control - " + (titulos[seccion] || "");

    if (seccion === 'eventos') setTimeout(dibujarRuletaAdmin, 100);
    if (seccion === 'creditos') cargarSolicitudesCreditos();
    if (seccion === 'costos') cargarCostosMinijuegos();
    if (seccion === 'cargas') obtenerCargasPendientes();
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
function abrirEnPopup(url, nombreVentana) {
    const sidebar = document.querySelector('.sidebar');
    // Obtenemos el ancho del sidebar para saber dónde empieza el recuadro rojo
    const sidebarWidth = sidebar ? sidebar.offsetWidth : 250; 
    
    // Calculamos el espacio disponible para el "recuadro rojo"
    const popupWidth = window.innerWidth - sidebarWidth;
    const popupHeight = window.innerHeight; // Altura completa del navegador
    
    // Posicionamos el popup justo donde empieza el recuadro rojo
    // Usamos screenX/Y para posicionar en la pantalla, no dentro de la ventana
    const popupLeft = window.screenX + sidebarWidth;
    const popupTop = window.screenY; 

    window.open(
        url, 
        nombreVentana, 
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
    if(!tbody) return;
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
            
            <td style="color:#94a3b8; font-weight:bold; font-size:12px;">
                ${c.referredBy ? c.referredBy : 'Directo'}
            </td>

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
    if(!contenedor) return;
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
// SISTEMA GESTIÓN DE SALDOS Y CRÉDITOS
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
    // 1. BUSCAR LOS ELEMENTOS Y GUARDAR TEXTOS (Esto faltaba)
    const btnDepositar = document.getElementById('btn-depositar');
    const btnRetirar = document.getElementById('btn-retirar');
    
    // Validar que existan
    if (!btnDepositar || !btnRetirar) {
        console.error("No se encontraron los botones en el HTML.");
        return;
    }

    const textoDepositar = btnDepositar.innerText;
    const textoRetirar = btnRetirar.innerText;
    
    const monto = Number(document.getElementById('gestion-monto').value);
    const tipo = document.getElementById('gestion-tipo-saldo').value;
    
    if (!monto || monto <= 0) return alert("Por favor, ingresá un monto mayor a 0.");
    
    // 2. DESHABILITAR Y CAMBIAR TEXTO
    btnDepositar.disabled = true;
    btnRetirar.disabled = true;
    if (accion === 'add') btnDepositar.innerText = "PROCESANDO...";
    if (accion === 'remove') btnRetirar.innerText = "PROCESANDO...";

    try {
        let res, data;
        
        // --- OPCIÓN 1: Gestión Manual ---
        if (tipo === 'creditos') {
            res = await fetch('/api/gestion-manual-creditos', {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ userId: gestionIdSeleccionado, amount: monto, action: accion })
            });
        } 
        // --- OPCIÓN 2: Cargar Saldo ---
        else if (tipo === 'saldo') {
            let montoFinal = (accion === 'remove') ? -Math.abs(monto) : Math.abs(monto);
            res = await fetch('/api/cargar-saldo', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                credentials: 'include',
                body: JSON.stringify({ usuario: gestionUserSeleccionado, monto: montoFinal }) 
            });
        }
        
        if (res.status === 401) {
            alert("Sesión expirada. Por favor, iniciá sesión de nuevo.");
            return window.location.href = '/login.html';
        }

        data = await res.json();
        alert(data.message || data.mensaje || "Operación realizada con éxito.");
        cerrarModalGeneral('modal-gestion-creditos');
        
    } catch (error) {
        console.error(error);
        alert("Error técnico al conectar con el servidor.");
    } finally {
        // 3. AHORA SÍ: Como las variables fueron definidas al inicio, esto funcionará
        btnDepositar.disabled = false;
        btnRetirar.disabled = false;
        btnDepositar.innerText = textoDepositar;
        btnRetirar.innerText = textoRetirar;
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
        if(!tbody) return;
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

// ==========================================
// 🛡️ SISTEMA DE AUTOGUARDADO (BORRADORES)
// ==========================================
const opcionesGasto = ["Salida Lean", "Salida Nahue", "Salida Brai", "Salida Tati", "Inyeccion", "Fichas Mega", "Fichas Ganamos", "Bonos", "Sueldo", "Devolucion Reserva", "BB", "BR", "Fichas Oro"];

function guardarBorradoresLocales() {
    // 1. Guardar Borrador de Retiros
    const tbodyRetiros = document.getElementById('tbody-retiros');
    if (tbodyRetiros) {
        const retiros = Array.from(tbodyRetiros.querySelectorAll('tr')).map(tr => ({
            cliente: tr.querySelector('.ret-cliente')?.value || '',
            monto: tr.querySelector('.ret-monto')?.value || '',
            hora: tr.querySelector('.ret-hora')?.value || '',
            verificado: tr.querySelector('.ret-verifi')?.checked || false,
            turno: tr.querySelector('.ret-turno')?.getAttribute('data-val') || '',
            fecha: tr.querySelector('.ret-fecha')?.getAttribute('data-val') || ''
        }));
        
        if (retiros.length > 0) {
            const globalFecha = document.getElementById('global-retiro-fecha')?.value || '';
            const globalTurno = document.getElementById('global-retiro-turno')?.value || '';
            localStorage.setItem('borrador_retiros', JSON.stringify({ globalFecha, globalTurno, retiros }));
        } else {
            localStorage.removeItem('borrador_retiros');
        }
    }

    // 2. Guardar Borrador de Cierre de Caja
    const gastos = Array.from(document.querySelectorAll('#tabla-gastos tbody tr')).map(tr => ({
        tipo: tr.querySelector('.gt')?.value || '',
        usuario: tr.querySelector('.gu')?.value || '',
        monto: tr.querySelector('.gm')?.value || ''
    }));
    const propinas = Array.from(document.querySelectorAll('#tabla-propinas tbody tr')).map(tr => ({
        usuario: tr.querySelector('.pu')?.value || '',
        monto: tr.querySelector('.pm')?.value || ''
    }));
    
    const ingreso = document.getElementById('cc-ingreso')?.value;
    if (ingreso || gastos.length > 0 || propinas.length > 0) {
        const inputs = {
            fechaInicio: document.getElementById('cc-fecha-inicio')?.value || '',
            fechaFin: document.getElementById('cc-fecha-fin')?.value || '',
            horaInicio: document.getElementById('cc-hora-inicio')?.value || '',
            horaFin: document.getElementById('cc-hora-fin')?.value || '',
            cajero: document.getElementById('cc-cajero')?.value || '',
            turno: document.getElementById('cc-turno')?.value || 'Mañana',
            ingreso: ingreso || '',
            oro: document.getElementById('cc-oro')?.value || '',
            ganamos: document.getElementById('cc-ganamos')?.value || '',
            real: document.getElementById('cc-real')?.value || '',
            reserva: document.getElementById('cc-reserva')?.value || ''
        };
        localStorage.setItem('borrador_cierre', JSON.stringify({ inputs, gastos, propinas }));
    }
}

function restaurarBorradoresLocales() {
    let borradorRecuperado = false;

   let dataRetiros = null;
    try {
        const rawRetiros = localStorage.getItem('borrador_retiros');
        if (rawRetiros) {
            dataRetiros = JSON.parse(rawRetiros);
        }
    } catch (e) {
        console.error("Error crítico al parsear borrador_retiros, limpiando almacenamiento...", e);
        localStorage.removeItem('borrador_retiros'); // Limpiamos para evitar bucles de error
        dataRetiros = null;
    }

    // Si pasó el parseo sin errores y contiene datos, renderizamos
    if (dataRetiros && dataRetiros.retiros && dataRetiros.retiros.length > 0) {
        if (document.getElementById('global-retiro-fecha')) document.getElementById('global-retiro-fecha').value = dataRetiros.globalFecha;
        if (document.getElementById('global-retiro-turno')) document.getElementById('global-retiro-turno').value = dataRetiros.globalTurno;
        
        const tbody = document.getElementById('tbody-retiros');
        if(tbody) {
            tbody.innerHTML = ''; 
            const inputStyle = "margin:0; width:90%; border:1px solid #64748b; color:black; background:white; padding: 5px; border-radius: 4px;";

            dataRetiros.retiros.forEach(r => {
                let bgColor = r.turno === "Mañana" ? "#fef08a" : (r.turno === "Tarde" ? "#fed7aa" : "#93c5fd");
                const tr = document.createElement('tr');
                tr.style.backgroundColor = bgColor;
                tr.style.color = "#000000";
                tr.innerHTML = `
                    <td class="ret-fecha" data-val="${r.fecha}" style="font-weight:bold; text-align:center;">${r.fecha.split('-').reverse().join('/')}</td>
                    <td style="text-align:center;"><input type="text" class="input-text-adv ret-cliente" value="${r.cliente}" placeholder="Usuario" style="${inputStyle}"></td>
                    <td style="text-align:center;"><input type="number" class="input-text-adv ret-monto" value="${r.monto}" placeholder="Monto" style="${inputStyle}"></td>
                    <td style="text-align:center;"><input type="time" class="input-text-adv ret-hora" value="${r.hora}" style="${inputStyle}"></td>
                    <td style="text-align:center;"><input type="checkbox" class="ret-verifi" style="width:20px; height:20px; cursor:pointer;" ${r.verificado ? 'checked' : ''}></td>
                    <td class="ret-turno" data-val="${r.turno}" style="font-weight:bold; text-align:center;">${r.turno}</td>
                    <td style="text-align:center;"><button onclick="this.closest('tr').remove()" style="background:#ef4444; border:none; color:white; padding:5px 10px; border-radius:4px; cursor:pointer; font-weight:bold;">X</button></td>
                `;
                tbody.appendChild(tr);
            });
            borradorRecuperado = true;
        }
    }

    // ==========================================
    // 2. RESTAURAR CIERRE DE CAJA (PROTEGIDO)
    // ==========================================
    let dataCierre = null;
    try {
        const rawCierre = localStorage.getItem('borrador_cierre');
        if (rawCierre) {
            dataCierre = JSON.parse(rawCierre);
        }
    } catch (e) {
        console.error("Error crítico al parsear borrador_cierre, limpiando almacenamiento...", e);
        localStorage.removeItem('borrador_cierre'); // Limpiamos para evitar bucles de error
        dataCierre = null;
    }

    // Si pasó el parseo sin errores y contiene datos, renderizamos
    if (dataCierre) {
        if(dataCierre.inputs) {
            if(document.getElementById('cc-fecha-inicio')) document.getElementById('cc-fecha-inicio').value = dataCierre.inputs.fechaInicio;
            if(document.getElementById('cc-fecha-fin')) document.getElementById('cc-fecha-fin').value = dataCierre.inputs.fechaFin;
            if(document.getElementById('cc-hora-inicio')) document.getElementById('cc-hora-inicio').value = dataCierre.inputs.horaInicio;
            if(document.getElementById('cc-hora-fin')) document.getElementById('cc-hora-fin').value = dataCierre.inputs.horaFin;
            if(document.getElementById('cc-cajero')) document.getElementById('cc-cajero').value = dataCierre.inputs.cajero;
            if(document.getElementById('cc-turno')) document.getElementById('cc-turno').value = dataCierre.inputs.turno;
            if(document.getElementById('cc-ingreso')) document.getElementById('cc-ingreso').value = dataCierre.inputs.ingreso;
            if(document.getElementById('cc-oro')) document.getElementById('cc-oro').value = dataCierre.inputs.oro;
            if(document.getElementById('cc-ganamos')) document.getElementById('cc-ganamos').value = dataCierre.inputs.ganamos;
            if(document.getElementById('cc-real')) document.getElementById('cc-real').value = dataCierre.inputs.real;
            if(document.getElementById('cc-reserva')) document.getElementById('cc-reserva').value = dataCierre.inputs.reserva;
        }

        if(dataCierre.gastos && dataCierre.gastos.length > 0) {
            const tbodyG = document.querySelector('#tabla-gastos tbody');
            if(tbodyG) {
                tbodyG.innerHTML = '';
                dataCierre.gastos.forEach(g => {
                    const tr = document.createElement('tr');
                    let options = opcionesGasto.map(o => `<option value="${o}" ${o === g.tipo ? 'selected' : ''}>${o}</option>`).join('');
                    tr.innerHTML = `<td><select class="input-text-adv gt" onchange="calcCierre()" style="margin-bottom:0;">${options}</select></td><td><input type="text" class="input-text-adv gu" value="${g.usuario}" style="margin-bottom:0;"></td><td><input type="number" class="input-text-adv val-num gm" value="${g.monto}" oninput="calcCierre()" style="margin-bottom:0;"></td><td><button class="btn-remove" onclick="this.parentElement.parentElement.remove(); calcCierre()">X</button></td>`;
                    tbodyG.appendChild(tr);
                });
            }
        }

        if(dataCierre.propinas && dataCierre.propinas.length > 0) {
            const tbodyP = document.querySelector('#tabla-propinas tbody');
            if(tbodyP) {
                tbodyP.innerHTML = '';
                dataCierre.propinas.forEach(p => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `<td><input type="text" class="input-text-adv pu" value="${p.usuario}" style="margin-bottom:0;"></td><td><input type="number" class="input-text-adv val-num pm" value="${p.monto}" oninput="calcCierre()" style="margin-bottom:0;"></td><td><button class="btn-remove" onclick="this.parentElement.parentElement.remove(); calcCierre()">X</button></td>`;
                    tbodyP.appendChild(tr);
                });
            }
        }
        calcCierre(); // Recalcular totales
    }

    // Activamos el loop de guardado cada 3 segundos de manera segura
    setInterval(guardarBorradoresLocales, 3000);
    
    return borradorRecuperado;
}
// ==========================================
// RETIROS (NUEVO CONTROL DE CAJAS)
// ==========================================

function inicializarTurnoLogico() {
    const ahora = new Date();
    let hora = ahora.getHours();
    let min = ahora.getMinutes();
    let tiempoDecimal = hora + (min / 60);

    let fechaSelect = new Date(ahora);
    let turnoSelect = "Noche";

    if (tiempoDecimal >= 5.75 && tiempoDecimal < 13.75) {
        turnoSelect = "Mañana";
    } else if (tiempoDecimal >= 13.75 && tiempoDecimal < 21.75) {
        turnoSelect = "Tarde";
    } else {
        turnoSelect = "Noche";
        if (tiempoDecimal < 5.75) {
            fechaSelect.setDate(fechaSelect.getDate() - 1);
        }
    }

    const yyyy = fechaSelect.getFullYear();
    const mm = String(fechaSelect.getMonth() + 1).padStart(2, '0');
    const dd = String(fechaSelect.getDate()).padStart(2, '0');

    const inputFecha = document.getElementById('global-retiro-fecha');
    const inputTurno = document.getElementById('global-retiro-turno');
    
    if(inputFecha && inputTurno) {
        inputFecha.value = `${yyyy}-${mm}-${dd}`;
        inputTurno.value = turnoSelect;
    }
}

function addRetiroRow() {
    const tbody = document.getElementById('tbody-retiros');
    if(!tbody) return;

    const inputFecha = document.getElementById('global-retiro-fecha');
    const inputTurno = document.getElementById('global-retiro-turno');
    
    const fechaGlobal = inputFecha ? inputFecha.value : '';
    const turnoGlobal = inputTurno ? inputTurno.value : 'Noche';

    if (!fechaGlobal) {
        alert("Por favor, seleccioná una fecha para el turno antes de agregar retiros.");
        return;
    }

    let bgColor = "";
    let textColor = "#000000"; 
    
    if (turnoGlobal === "Mañana") bgColor = "#fef08a"; 
    if (turnoGlobal === "Tarde") bgColor = "#fed7aa";  
    if (turnoGlobal === "Noche") bgColor = "#93c5fd";  

    const ahora = new Date();
    const horaActual = ahora.getHours().toString().padStart(2, '0') + ':' + ahora.getMinutes().toString().padStart(2, '0');

    const tr = document.createElement('tr');
    tr.style.backgroundColor = bgColor;
    tr.style.color = textColor;

    const inputStyle = "margin:0; width:90%; border:1px solid #64748b; color:black; background:white; padding: 5px; border-radius: 4px;";

    tr.innerHTML = `
        <td class="ret-fecha" data-val="${fechaGlobal}" style="font-weight:bold; text-align:center;">${fechaGlobal.split('-').reverse().join('/')}</td>
        <td style="text-align:center;"><input type="text" class="input-text-adv ret-cliente" placeholder="Usuario" style="${inputStyle}"></td>
        <td style="text-align:center;"><input type="number" class="input-text-adv ret-monto" placeholder="Monto" style="${inputStyle}"></td>
        <td style="text-align:center;"><input type="time" class="input-text-adv ret-hora" value="${horaActual}" style="${inputStyle}"></td>
        <td style="text-align:center;"><input type="checkbox" class="ret-verifi" style="width:20px; height:20px; cursor:pointer;" checked></td>
        <td class="ret-turno" data-val="${turnoGlobal}" style="font-weight:bold; text-align:center;">${turnoGlobal}</td>
        <td style="text-align:center;"><button onclick="this.closest('tr').remove()" style="background:#ef4444; border:none; color:white; padding:5px 10px; border-radius:4px; cursor:pointer; font-weight:bold;">X</button></td>
    `;

    tbody.appendChild(tr);
}

async function procesarCierreRetiros() {
    const tbody = document.getElementById('tbody-retiros');
    if(!tbody || tbody.children.length === 0) return alert("No hay retiros.");

    const fechaTurno = document.getElementById('global-retiro-fecha').value;
    const turnoGlobal = document.getElementById('global-retiro-turno').value;

    // 1. PRIMERO VERIFICAMOS SI YA EXISTE
    const checkRes = await fetch(`/api/verificar-turno/${fechaTurno}/${turnoGlobal}`);
    const checkData = await checkRes.json();

    if (checkData.existe) {
        const confirmar = confirm(`⚠️ ATENCIÓN: Ya existen datos guardados para el ${fechaTurno} en el turno ${turnoGlobal}. \n\n¿Estás seguro de que querés SOBREESCRIBIR los datos anteriores?`);
        if (!confirmar) return; // Si dice cancelar, no hacemos nada.
    }

    // 2. SI LLEGÓ ACÁ, ENVIAMOS LOS DATOS (EL RESTO ES IGUAL)
    const payload = {
        fechaTurno,
        turnoGlobal,
        retiros: Array.from(tbody.querySelectorAll('tr')).map(tr => ({
            cliente: tr.querySelector('.ret-cliente')?.value || 'S/D',
            monto: Number(tr.querySelector('.ret-monto')?.value) || 0,
            hora: tr.querySelector('.ret-hora')?.value || '',
            verificado: tr.querySelector('.ret-verifi')?.checked || false
        }))
    };

    try {
        const res = await fetch('/api/guardar-retiros', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if(data.success) {
            alert("✅ ¡Retiros guardados oficialmente!");
            tbody.innerHTML = ''; 
            localStorage.removeItem('borrador_retiros');
        } else {
            alert("❌ Error: " + data.mensaje);
        }
    } catch (error) { alert("❌ Error de conexión."); }
}
// ==========================================
// CIERRE DE CAJA
// ==========================================
function addGastoRow() {
    const tbody = document.querySelector('#tabla-gastos tbody');
    if(!tbody) return;
    const tr = document.createElement('tr');
    let options = opcionesGasto.map(o => `<option value="${o}">${o}</option>`).join('');
    tr.innerHTML = `<td><select class="input-text-adv gt" onchange="calcCierre()" style="margin-bottom:0;">${options}</select></td><td><input type="text" class="input-text-adv gu" style="margin-bottom:0;"></td><td><input type="number" class="input-text-adv val-num gm" oninput="calcCierre()" style="margin-bottom:0;"></td><td><button class="btn-remove" onclick="this.parentElement.parentElement.remove(); calcCierre()">X</button></td>`;
    tbody.appendChild(tr);
}

function addPropinaRow() {
    const tbody = document.querySelector('#tabla-propinas tbody');
    if(!tbody) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><input type="text" class="input-text-adv pu" style="margin-bottom:0;"></td><td><input type="number" class="input-text-adv val-num pm" oninput="calcCierre()" style="margin-bottom:0;"></td><td><button class="btn-remove" onclick="this.parentElement.parentElement.remove(); calcCierre()">X</button></td>`;
    tbody.appendChild(tr);
}

function calcCierre() {
    let totG = 0; document.querySelectorAll('.gm').forEach(i => totG += Number(i.value) || 0); 
    if(document.getElementById('tot-gastos')) document.getElementById('tot-gastos').innerText = totG.toFixed(2); 

    let totP = 0; document.querySelectorAll('.pm').forEach(i => totP += Number(i.value) || 0); 
    if(document.getElementById('tot-propinas')) document.getElementById('tot-propinas').innerText = totP.toFixed(2);
    
    const ing = Number(document.getElementById('cc-ingreso')?.value) || 0; 
    const oro = Number(document.getElementById('cc-oro')?.value) || 0; 
    const ganamos = Number(document.getElementById('cc-ganamos')?.value) || 0; 

    const egreso = ing + oro + ganamos;
    if(document.getElementById('cc-egreso')) document.getElementById('cc-egreso').value = egreso;
    
    const esperado = egreso - (totG + totP);
    if(document.getElementById('cc-esperado')) document.getElementById('cc-esperado').value = esperado;
    
    const real = Number(document.getElementById('cc-real')?.value) || 0;
    const dif = real - esperado; 
    
    if(document.getElementById('cc-dif')) {
        document.getElementById('cc-dif').value = dif; 
        document.getElementById('cc-dif').style.color = dif < 0 ? '#ef4444' : '#10b981';
    }
}

// --- NUEVA FUNCIÓN AUXILIAR PARA LIMPIAR ---
function limpiarFormularioCierre() {
    // 1. Limpiar filas de las tablas
    document.querySelector('#tabla-gastos tbody').innerHTML = '';
    document.querySelector('#tabla-propinas tbody').innerHTML = '';

    // 2. Resetear inputs numéricos principales a 0
    ['cc-ingreso', 'cc-oro', 'cc-ganamos', 'cc-real', 'cc-reserva', 'cc-egreso', 'cc-esperado', 'cc-dif'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = 0;
    });

    // 3. Resetear textos de totales
    if(document.getElementById('tot-gastos')) document.getElementById('tot-gastos').innerText = '0.00';
    if(document.getElementById('tot-propinas')) document.getElementById('tot-propinas').innerText = '0.00';

    // 4. Volver a agregar las filas base para que no quede vacío
    addGastoRow();
    addPropinaRow();
    
    // 5. Recalcular todo
    calcCierre();
}

async function guardarCierreDB() {
    const fecha = document.getElementById('cc-fecha-inicio').value;
    const turno = document.getElementById('cc-turno').value;
    
    if(!fecha) return alert("Ingresá la fecha de inicio.");

    // 1. VERIFICACIÓN
    const checkRes = await fetch(`/api/verificar-turno/${fecha}/${turno}`);
    const checkData = await checkRes.json();

    if (checkData.existe) {
        const confirmar = confirm(`⚠️ ATENCIÓN: Ya existe un CIERRE DE CAJA guardado para el ${fecha} en el turno ${turno}. \n\n¿Estás seguro de que querés SOBREESCRIBIR los datos anteriores?`);
        if (!confirmar) return; 
    }

    // 2. PREPARACIÓN DE DATOS
    const gastos = []; document.querySelectorAll('#tabla-gastos tbody tr').forEach(tr => gastos.push({ tipo: tr.querySelector('.gt').value, usuario: tr.querySelector('.gu').value, monto: Number(tr.querySelector('.gm').value) || 0 }));
    const propinas = []; document.querySelectorAll('#tabla-propinas tbody tr').forEach(tr => propinas.push({ usuario: tr.querySelector('.pu').value, monto: Number(tr.querySelector('.pm').value) || 0 }));
    
    const payload = {
        fecha: fecha,
        fechaInicio: fecha,
        fechaFin: document.getElementById('cc-fecha-fin').value,
        horaInicio: document.getElementById('cc-hora-inicio').value, 
        horaFin: document.getElementById('cc-hora-fin').value, 
        turno: turno, 
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

    // 3. ENVÍO
    try {
        const res = await fetch('/api/cierre-caja', { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify(payload) 
        });
        
        if(res.redirected) return window.location.href = '/login.html';
        
        if(res.ok) { 
            alert("✅ ¡Cierre de caja guardado correctamente!"); 
            localStorage.removeItem('borrador_cierre'); 
            
            // --- AQUÍ LLAMAMOS A LA LIMPIEZA ---
            limpiarFormularioCierre(); 

            if(document.getElementById('res-fecha').value === payload.fecha) buscarResumen(); 
        } else {
            alert("❌ Error al guardar en el servidor.");
        }
    } catch (error) {
        alert("❌ Error de conexión al guardar.");
    }
}

// Inicialización UI de Cierre
setTimeout(() => {
    // Si no recuperó datos del borrador, le damos inicialización base
    if(document.querySelectorAll('#tabla-gastos tbody tr').length === 0) {
        addGastoRow(); addPropinaRow(); 
        if(document.getElementById('cc-fecha-inicio')) document.getElementById('cc-fecha-inicio').valueAsDate = new Date();
        if(document.getElementById('cc-fecha-fin')) document.getElementById('cc-fecha-fin').valueAsDate = new Date();
    }
}, 500);

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
    const fecha = document.getElementById('hist-fecha').value;
    const turno = document.getElementById('hist-turno').value;
    const c = document.getElementById('historial-resultados');
    
    if(!fecha) return alert("Seleccioná una fecha.");

    try {
        const res = await fetch(`/api/historial-cajas/${fecha}/${turno}`);
        if(res.redirected) return window.location.href = '/login.html';
        const data = await res.json();

        if (!data.cierre && (!data.retiros || data.retiros.length === 0)) {
            return c.innerHTML = `<p style="color:#94a3b8; text-align:center; margin-top:40px;">No hay registros para ${fecha} en el turno ${turno}.</p>`;
        }

        let html = '';

        if (data.cierre) {
            const cl = data.cierre;
            html += `<div class="excel-card" style="border-color: #38bdf8; margin-bottom: 30px;">
                <h4 style="margin:0 0 15px 0; color:#38bdf8; border-bottom:1px solid #1f2937; padding-bottom:10px;">
                    📅 ${cl.fecha} | 🕒 ${cl.turno} | 👤 ${cl.cajero || 'N/D'}
                </h4>
                <div class="excel-grid">
                    <div>
                        <table class="table-custom"><tr><th style="width:50%">Apertura</th><td>${cl.horaInicio || '--:--'}</td></tr><tr><th>Cierre</th><td>${cl.horaFin || '--:--'}</td></tr></table>
                        <h5 style="color:#a3e635; margin:15px 0 5px 0; font-size:13px;">DETALLE GASTOS</h5>
                        <table class="table-custom"><thead><tr><th>Tipo</th><th>Destino</th><th>Monto</th></tr></thead><tbody>${(cl.gastos && cl.gastos.length > 0) ? cl.gastos.map(g => `<tr><td>${g.tipo}</td><td>${g.usuario}</td><td style="text-align:right;">${f.format(g.monto)}</td></tr>`).join('') : '<tr><td colspan="3" style="text-align:center; color:#64748b;">Sin gastos</td></tr>'}</tbody></table>
                    </div>
                    <div>
                        <table class="table-custom"><tr><th>Ingreso</th><th>Oro</th><th>Ganamos</th><th>Egreso</th></tr><tr><td style="text-align:right;">${f.format(cl.ingreso || 0)}</td><td style="text-align:right;">${f.format(cl.saldoOro || 0)}</td><td style="text-align:right;">${f.format(cl.saldoGanamos || 0)}</td><td style="text-align:right; color:#ef4444; font-weight:bold;">${f.format(cl.egreso || 0)}</td></tr></table>
                        <table class="table-custom" style="margin-top:15px;"><tr><th>Esperado (Teórico)</th><th>Real Final (Caja)</th><th>Diferencia</th></tr><tr><td style="text-align:right;">${f.format(cl.montoEsperado || 0)}</td><td style="text-align:right; font-weight:bold; color:#38bdf8;">${f.format(cl.montoRealFinal || 0)}</td><td style="text-align:right; font-weight:bold; color:${(cl.sobranteFaltante || 0) < 0 ? '#ef4444' : '#10b981'};">${f.format(cl.sobranteFaltante || 0)}</td></tr></table>
                    </div>
                </div>
            </div>`;
        }

        if (data.retiros && data.retiros.length > 0) {
            html += `<div style="background:#111827; padding:20px; border-radius:8px; border:1px solid #1f2937;">
                        <h4 style="color:#38bdf8; margin: 0 0 15px 0; font-size:16px;">💸 Control de Retiros del Turno</h4>
                        <table class="data-table">
                            <thead><tr><th>Cliente</th><th>Monto</th><th>Hora</th><th>Verificado</th></tr></thead>
                            <tbody>
                                ${data.retiros.map(r => `<tr><td>${r.cliente}</td><td style="color:#10b981; font-weight:bold;">$${r.monto}</td><td>${r.hora}</td><td>${r.verificado ? '✅' : '❌'}</td></tr>`).join('')}
                            </tbody>
                        </table>
                     </div>`;
        } else {
            html += `<div style="background:#111827; padding:20px; border-radius:8px; border:1px solid #1f2937; text-align:center;">
                        <p style="color:#64748b; font-size:14px; margin:0;">No hubo retiros registrados en este turno.</p>
                     </div>`;
        }

        c.innerHTML = html;
    } catch (e) { 
        c.innerHTML = `<div style="background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; padding: 20px; border-radius: 8px; text-align: center;"><p style="color:#cbd5e1;">Error al cargar el historial.</p></div>`; 
    }
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
        buscarCliente(); 
    }
    if (datos.retiros) {
        const tbody = document.querySelector('#section-retiros .data-table tbody'); 
        if(tbody) {
            tbody.innerHTML = '';
            datos.retiros.forEach(r => { tbody.innerHTML += `<tr><td>${r.fecha}</td><td>${r.cliente}</td><td>$${r.monto}</td><td>${r.cbuAlias}</td><td>${r.estado}</td></tr>`; });
        }
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
    const listaDiv = document.getElementById('lista-usuarios'); 
    if (!listaDiv) return;
    listaDiv.innerHTML = '';
    
    usuarios.forEach(user => {
        let tieneMensajesSinLeer = user.historial.some(h => h.emisor === 'cliente' && h.leido === false);
        let claseNoLeido = (tieneMensajesSinLeer && usuarioSeleccionadoActivo !== user.nombre) ? 'unread-chat' : '';
        let dotVisual = (tieneMensajesSinLeer && usuarioSeleccionadoActivo !== user.nombre) ? '<span class="unread-indicator"></span>' : '';
        
        // ==============================================================
        // OPTIMIZACIÓN: Colores dinámicos para identificar el estado al toque
        // ==============================================================
        let colorBadge = '#2563eb'; // Azul por defecto (Menú Principal)
        const estadoLimpio = (user.estado || 'Menú').toLowerCase();

        if (estadoLimpio.includes('retiro')) {
            colorBadge = '#16a34a'; // Verde para Retiros
        } else if (estadoLimpio.includes('depós') || estadoLimpio.includes('carg')) {
            colorBadge = '#eab308'; // Amarillo/Oro para Cargar Créditos
        } else if (estadoLimpio.includes('mini') || estadoLimpio.includes('juego') || estadoLimpio.includes('tienda')) {
            colorBadge = '#7c3aed'; // Violeta para Minijuegos/Tienda
        } else if (estadoLimpio.includes('soport')) {
            colorBadge = '#06b6d4'; // Cian para Soporte técnico
        } else if (estadoLimpio.includes('refer')) {
            colorBadge = '#ec4899'; // Rosa para Referidos
        }
        // ==============================================================

        const item = document.createElement('div');
        item.className = `user-item ${usuarioSeleccionadoActivo === user.nombre ? 'selected-user' : ''} ${claseNoLeido}`;
        
        // Aplicamos el colorBadge dinámico aquí:
        item.innerHTML = `<div>👤 ${dotVisual}${user.nombre}</div><div class="badge" style="background:${colorBadge}; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; color: white;">${user.estado || 'Menú'}</div>`;
        
        item.onclick = () => {
            usuarioSeleccionadoActivo = user.nombre;
            document.getElementById('active-chat-username').innerText = "Monitoreando a: " + user.nombre;
            document.getElementById('admin-message-input').disabled = false; 
            document.getElementById('btn-enviar-msg').disabled = false;
            socket.emit('admin_cambio_chat_activo', { usuario: user.nombre });
            renderizarHistorialChat(user.historial);
        };
        
        listaDiv.appendChild(item);
        if (usuarioSeleccionadoActivo === user.nombre) renderizarHistorialChat(user.historial);
    });
});

function renderizarHistorialChat(historial) {
    const areaMsg = document.getElementById('active-chat-messages'); 
    if (!areaMsg) return;
    areaMsg.innerHTML = ''; 
    
    historial.forEach(h => {
        const wrap = document.createElement('div'); 
        wrap.className = 'admin-bubble-wrapper'; 
        const b = document.createElement('div');
        
        // Si el mensaje viene con hora la usa, si no, queda vacío (para mensajes viejos)
        const horaFormateada = h.hora ? `<span class="hora-admin-chat">${h.hora}</span>` : '';

        if (h.emisor === 'bot') { 
            b.className = 'admin-bubble b-bot'; 
            b.innerHTML = `🤖 <b>Bot:</b><br>${h.mensaje}${horaFormateada}`; 
            wrap.appendChild(b); 
        }
        
        if (h.emisor === 'admin') { 
            b.className = 'admin-bubble b-admin'; 
            b.innerHTML = `👨‍💼 <b>Vos:</b><br>${h.mensaje}${horaFormateada}`; 
            wrap.appendChild(b); 
        }
        
        if (h.emisor === 'cliente') { 
            let check = h.leido ? '<span class="read-receipt seen">✓ Visto</span>' : '<span class="read-receipt">✓ Enviado</span>';
            b.className = 'admin-bubble b-cliente'; 
            b.innerHTML = `👤 <b>Cliente:</b><br>${h.mensaje}${horaFormateada}`; 
            wrap.appendChild(b); 
            wrap.innerHTML += check;
        }
        
        areaMsg.appendChild(wrap);
    });
    areaMsg.scrollTop = areaMsg.scrollHeight;
}

function enviarMensajeManual() {
    const input = document.getElementById('admin-message-input'); 
    const texto = input.value.trim();
    
    if (!texto || !usuarioSeleccionadoActivo) return;

    // 1. Enviar al servidor
    socket.emit('admin_envia_mensaje', { paraUsuario: usuarioSeleccionadoActivo, mensaje: texto });

    // 2. Renderizar localmente de inmediato (Optimistic UI)
    const areaMsg = document.getElementById('active-chat-messages');
    if (areaMsg) {
        const wrap = document.createElement('div');
        wrap.className = 'admin-bubble-wrapper';
        
        const b = document.createElement('div');
        b.className = 'admin-bubble b-admin'; // Clase para que se vea como tu mensaje
        b.innerHTML = `👨‍💼 <b>Vos:</b><br>${texto}`;
        
        wrap.appendChild(b);
        areaMsg.appendChild(wrap);
        
        // 3. Hacer scroll al final para que se vea el nuevo mensaje
        areaMsg.scrollTop = areaMsg.scrollHeight;
    }

    // 4. Limpiar input
    input.value = '';
}

// ==========================================
// ATAJOS DE TECLADO (ESC Y ENTER)
// ==========================================
document.addEventListener('keydown', (e) => { 
    if (e.key === 'Enter' && document.activeElement.id === 'admin-message-input') {
        enviarMensajeManual(); 
    }
    if (e.key === 'Escape' && usuarioSeleccionadoActivo !== null) {
        cerrarChatActual();
    }
});

function cerrarChatActual() {
    usuarioSeleccionadoActivo = null;
    document.getElementById('active-chat-username').innerText = "Ningún usuario seleccionado";
    document.getElementById('active-chat-messages').innerHTML = '<div style="color: #64748b; text-align: center; margin-top: 150px;">Seleccioná un cliente para chatear en tiempo real.</div>';
    
    const inputMsg = document.getElementById('admin-message-input');
    inputMsg.disabled = true;
    inputMsg.value = '';
    document.getElementById('btn-enviar-msg').disabled = true;

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
// CONFIGURACIÓN DE LA TIENDA
// ==========================================
function mostrarTiendaAdmin() {
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active-view'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active-nav'));
    
    const secTienda = document.getElementById('section-tienda');
    if(secTienda) secTienda.classList.add('active-view');
    
    const btnTienda = document.getElementById('btn-nav-tienda');
    if(btnTienda) btnTienda.classList.add('active-nav');
    
    const panelTitle = document.getElementById('panel-title');
    if(panelTitle) panelTitle.innerText = "Panel de Control - Configuración Tienda";
    
    cargarValoresTienda();
}

async function cargarValoresTienda() {
    try {
        const res = await fetch('/api/tienda');
        const prods = await res.json();
        for(let i=0; i<4; i++) {
            if(prods[i]) {
                const inputNombre = document.getElementById(`p-nombre-${i}`);
                const inputCosto = document.getElementById(`p-costo-${i}`);
                if(inputNombre) inputNombre.value = prods[i].nombre || '';
                if(inputCosto) inputCosto.value = prods[i].costo || '';
            }
        }
    } catch(e) { 
        console.log('Error cargando los datos visuales de la tienda'); 
    }
}

async function guardarTiendaAdmin() {
    let productos = [];
    for(let i=0; i<4; i++) {
        productos.push({
            nombre: document.getElementById(`p-nombre-${i}`).value,
            costo: Number(document.getElementById(`p-costo-${i}`).value)
        });
    }
    try {
        const res = await fetch('/api/admin/actualizar-tienda', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ productos })
        });
        const data = await res.json();
        if(data.exito) alert("✅ Tienda guardada con éxito en el servidor");
        else alert("❌ Error al guardar: " + data.mensaje);
    } catch(e) { 
        alert("❌ Error de conexión al guardar"); 
    }
}

// INICIALIZADOR GLOBAL DE LA PÁGINA
document.addEventListener('DOMContentLoaded', () => {
    // Intentamos recuperar si se cerró por error
    const recuperoAlgo = restaurarBorradoresLocales();
    
    // Si la tabla estaba vacía y no recuperó retiros, iniciamos el turno lógico normal
    if (!recuperoAlgo) {
        inicializarTurnoLogico();
    }
    
// LÓGICA MANUAL PARA CERRAR SESIÓN (Adentro para asegurar que el botón ya exista en el HTML)
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            const confirmar = confirm("¿Estás seguro de que querés cerrar sesión en el panel?");
            if (confirmar) {
                window.location.href = '/logout';
            }
        });
    }
    
    // ⏰ Iniciamos el contador de inactividad apenas carga la página
    resetearTimerInactividad();
});

// ==============================================================
// CONTROL DE INACTIVIDAD DEL ADMINISTRADOR
// ==============================================================
let timerInactividad;

function resetearTimerInactividad() {
    // Limpiamos el contador anterior cada vez que el usuario hace algo
    clearTimeout(timerInactividad);
    
    // Configurar el tiempo: 1 hora = 60 minutos * 60 segundos * 1000 milisegundos
    const tiempoLimite = 60 * 60 * 1000; 
    
    // Si pasa ese tiempo sin que se resetee, se ejecuta la función de cierre
    timerInactividad = setTimeout(cerrarSesionAutomatica, tiempoLimite);
}

function cerrarSesionAutomatica() {
    alert("Tu sesión ha expirado por inactividad por seguridad. Volvé a ingresar.");
    
    // Redirigís a tu ruta de cierre de sesión (la que borre las cookies o el sessionStorage)
    window.location.href = '/logout'; 
}

// Escuchamos cualquier interacción lógica del administrador para saber que sigue ahí
window.onload = resetearTimerInactividad;
window.onmousemove = resetearTimerInactividad; // Mover el mouse
window.onmousedown = resetearTimerInactividad; // Hacer clics
window.onkeypress = resetearTimerInactividad;  // Tocar el teclado
window.onscroll = resetearTimerInactividad;    // Hacer scroll

// ---------------------------------------------------------
// NOTIFICACIONES Y PUSH MASIVO
// ---------------------------------------------------------

async function enviarPushMasivo() {
    // 1. Obtener los valores de los inputs
    const titulo = document.getElementById('push-titulo').value;
    const mensaje = document.getElementById('push-mensaje').value;

    // 2. Validación básica
    if (!titulo || !mensaje) {
        alert("Por favor, completá título y mensaje");
        return;
    }

    try {
        // 3. Enviar al servidor
        const response = await fetch('/eventos/enviar-push', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ titulo, mensaje })
        });

        // 4. Feedback
        if (response.ok) {
            alert('¡Push enviado correctamente!');
        } else {
            alert('Hubo un error al enviar el push.');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error de conexión con el servidor.');
    }
}
// ---------------------------------------------------------
// GUARDAR REGLAS DE RETENCIÓN AUTOMÁTICA
// ---------------------------------------------------------

async function guardarReglasRetencion() {
    // 1. Recolectamos los datos usando los IDs reales de tu admin.html
    const reglas = {
        h24: {
            activo: document.getElementById('ret-chk-0').checked,
            mensaje: document.getElementById('ret-txt-0').value
        },
        d3: {
            activo: document.getElementById('ret-chk-1').checked,
            mensaje: document.getElementById('ret-txt-1').value
        },
        d7: {
            activo: document.getElementById('ret-chk-2').checked,
            mensaje: document.getElementById('ret-txt-2').value
        },
        d15: {
            activo: document.getElementById('ret-chk-3').checked,
            mensaje: document.getElementById('ret-txt-3').value
        },
        d30: {
            activo: document.getElementById('ret-chk-4').checked,
            mensaje: document.getElementById('ret-txt-4').value
        }
    };

    try {
        // 2. Enviamos la configuración estructurada al backend
        const response = await fetch('/api/guardar-reglas-retencion', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reglas })
        });

        const data = await response.json();

        // 3. Alerta de confirmación
        if (response.ok && data.success) {
            alert('¡Reglas de retención guardadas con éxito! 🚀');
        } else {
            alert('Hubo un error al guardar las reglas: ' + (data.error || 'Error desconocido'));
        }
    } catch (error) {
        console.error('Error al conectar con el servidor:', error);
        alert('Error de conexión con el backend.');
    }
}
// ==========================================================================
// 🎰 SISTEMA DE GESTIÓN DE CARGAS PENDIENTES (ADMIN)
// ==========================================================================

// A) Busca las solicitudes con estado 'pendiente' en el servidor y arma la tabla
async function obtenerCargasPendientes() {
    try {
        const res = await fetch('/api/admin/cargas-pendientes');
        const cargas = await res.json();
        
        const tbody = document.getElementById('tabla-cargas-body');
        if (!tbody) return;
        
        tbody.innerHTML = '';

        // Caso: No hay transferencias pendientes por revisar
        if (cargas.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="padding:25px; text-align:center; color:#888; font-weight:500;">No hay cargas pendientes por el momento. 🙌</td></tr>`;
            const badge = document.getElementById('admin-badge-cargas');
            if (badge) badge.style.display = 'none';
            return;
        }

        // Si hay elementos, actualizamos el globito rojo del menú con el número real
        const badge = document.getElementById('admin-badge-cargas');
        if (badge) {
            badge.innerText = cargas.length;
            badge.style.display = 'inline-block';
        }

        // Rellenamos las filas de la tabla con los datos de MongoDB
        cargas.forEach(carga => {
            // 🔥 NUEVO: Distinción visual para saber qué es saldo interno y qué es plataforma externa
            let celdaPlataforma = "";
            if (carga.plataforma === 'Créditos') {
                celdaPlataforma = `<span style="background: #10b981; color: #fff; padding: 4px 10px; border-radius: 4px; font-weight: bold; font-size: 11px; border: 1px solid #047857; letter-spacing: 0.5px;">💰 CRÉDITOS LOCALES</span>`;
            } else {
                celdaPlataforma = `<span style="background: #27272a; color: #ddd; padding: 4px 10px; border-radius: 4px; font-size: 11px; border: 1px solid #3f3f46;">🎰 ${carga.plataforma}</span>`;
            }
            tbody.innerHTML += `
                <tr style="border-bottom: 1px solid #2a2a2a; background: #141414; transition: 0.2s;">
                    <td style="padding: 14px; font-weight: bold; color: #f59e0b;">${carga.usuario}</td>
                    <td style="padding: 14px; color: #ddd;">${carga.plataforma}</td>
                    <td style="padding: 14px; font-weight: bold; color: #10b981; font-size: 15px;">$${Number(carga.monto).toLocaleString('es-AR')}</td>
                    <td style="padding: 14px;">
                        <button onclick="verComprobante('/uploads/${carga.comprobante}')" style="background:#3b82f6; color:#fff; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:12px; font-weight:bold; hover: opacity 0.8;">👁️ Ver Foto</button>
                    </td>
                    <td style="padding: 14px; text-align: center;">
                        <button onclick="procesarSolicitudCarga('${carga._id}', 'aprobar')" style="background:#10b981; color:#fff; border:none; padding:7px 14px; border-radius:4px; font-weight:bold; cursor:pointer; margin-right:8px; shadow: 0 2px 4px rgba(0,0,0,0.2);">Aprobar ✅</button>
                        <button onclick="procesarSolicitudCarga('${carga._id}', 'rechazar')" style="background:#ef4444; color:#fff; border:none; padding:7px 14px; border-radius:4px; font-weight:bold; cursor:pointer;">Rechazar ❌</button>
                    </td>
                </tr>
            `;
        });
    } catch (err) {
        console.error("❌ Error al conectar con endpoint de cargas pendientes:", err);
    }
}

// B) Controladores visuales de la ventana modal (Agrandar comprobante)
function verComprobante(url) {
    const modal = document.getElementById('modal-comprobante-admin');
    const img = document.getElementById('img-comprobante-modal');
    if (modal && img) {
        img.src = url;
        modal.style.display = 'flex';
    }
}

function cerrarModalComprobante() {
    const modal = document.getElementById('modal-comprobante-admin');
    if (modal) modal.style.display = 'none';
}

// C) Envía la resolución definitiva del cajero al backend (Aprobar/Rechazar)
async function procesarSolicitudCarga(id, accion) {
    const mensajeConfirmar = `¿Estás seguro de que querés ${accion.toUpperCase()} esta solicitud de carga?`;
    if (!confirm(mensajeConfirmar)) return;

    try {
        const res = await fetch('/api/admin/procesar-carga', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, accion })
        });
        const data = await res.json();

        if (data.exito) {
            alert("¡Operación exitosa!: " + data.mensaje);
            obtenerCargasPendientes(); // Recargamos la tabla de inmediato para limpiar la fila resuelta
        } else {
            alert("⚠️ Error del Servidor: " + data.mensaje);
        }
    } catch (err) {
        console.error("❌ Error en la petición fetch de procesamiento:", err);
        alert("Hubo un error de red al intentar procesar la carga.");
    }
}
// ==========================================================================
// REGISTRO DE REVISIÓN AUTOMÁTICA (CADA 60 SEGUNDOS)
// ==========================================================================

setInterval(() => {
    // Verificamos si la cajera está mirando la pantalla de cargas en este momento
    const seccionCargas = document.getElementById('section-cargas');
    
    if (seccionCargas && seccionCargas.classList.contains('active-view')) {
        obtenerCargasPendientes(); // Si está adentro, refresca la tabla entera en vivo
    } else {
        actualizarBadgeSilencioso(); // Si está en otra sección, solo actualiza el globito rojo del menú
    }
}, 60000);

async function actualizarBadgeSilencioso() {
    try {
        const res = await fetch('/api/admin/cargas-pendientes');
        const cargas = await res.json();
        const badge = document.getElementById('admin-badge-cargas');
        
        if (badge) {
            if (cargas.length > 0) {
                badge.innerText = cargas.length;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }
    } catch (e) {
        console.log("Error silencioso al actualizar el badge:", e);
    }
}
console.log("🚨 ¡SI PODÉS LEER ESTO, EL ARCHIVO ADMIN.JS SE ACTUALIZÓ CORRECTAMENTE! 🚨");
