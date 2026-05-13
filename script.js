import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp, onSnapshot, deleteDoc, getDocs, query, where, orderBy, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// 1. SEGURIDAD Y ROLES (DINÁMICO DESDE FIRESTORE)
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const userDoc = await getDoc(doc(db, "usuarios", user.uid));

            if (userDoc.exists()) {
                const datos = userDoc.data();
                esAdmin = datos.rol === 'admin';
                localId = datos.localId || user.uid;

                const btnEditar   = document.getElementById('btn-editar');
                const btnDash     = document.getElementById('btn-dashboard');
                const btnCaja     = document.getElementById('btn-caja');
                const sidebarCaja = document.getElementById('sidebar-btn-caja');
                if (btnEditar)   btnEditar.style.display   = esAdmin ? 'flex'  : 'none';
                if (btnDash)     btnDash.style.display     = esAdmin ? 'block' : 'none';
                if (btnCaja)     btnCaja.style.display     = esAdmin ? 'block' : 'none';
                if (sidebarCaja) sidebarCaja.style.display = esAdmin ? 'flex'  : 'none';

                if (!esAdmin) {
                    const style = document.createElement('style');
                    style.innerHTML = `.btn-editar-interno { display: none !important; }`;
                    document.head.appendChild(style);
                }
            } else {
                localId = user.uid;
                const btnEditar = document.getElementById('btn-editar');
                if (btnEditar) btnEditar.style.display = 'none';
            }

            await cargarPlano();
            escucharMesas();
            await cargarProductos();
            if (esAdmin) cargarDashboard('dia');

        } catch (error) {
            console.error("Error al inicializar sesión:", error);
        }

        lucide.createIcons();
    } else {
        window.location.href = "login.html";
    }
});

// ==========================================
// 2. PRODUCTOS Y CATEGORÍAS (DINÁMICO DESDE FIRESTORE)
// ==========================================
let productos   = [];
let categorias  = [];
let categoriaActivaCarta = null;
let categoriaActivaPOS   = null;
let productoEditandoId   = null;

// ==========================================
// 3. ESTADO GLOBAL Y LÓGICA
// ==========================================
let localId  = null;
let esAdmin  = false;
let modoEdicion = false;
let mesaSeleccionada = null;
let offset = { x: 0, y: 0 };
let carritos = {};
let mesaActivaEnPOS = null;
let contadorMesas = 1;
let sectores = [{ id: 'salon', nombre: 'Salón' }];
let sectorActivo = 'salon';
let contadorSectores = 1;
let productoSiendoEditado = null;
let varianteIndexSiendoEditada = null;
let periodoActualDashboard = 'dia';
let metodoPagoSeleccionado = null;
let tipoDescuento = 'pct';
let subtotalActual = 0;
let insumos = [];
let insumoEditandoId = null;
let insumoAjustandoId = null;
let ventasPorMetodo = { efectivo: 0, debito: 0, credito: 0, qr: 0, transferencia: 0 };

function cambiarPestaña(pestañaNombre) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById(`pestaña-${pestañaNombre}`).classList.remove('hidden');
    document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('text-blue-600', 'border-b-2', 'border-blue-600');
        b.classList.add('text-slate-400');
    });
    const btn = document.getElementById(`btn-${pestañaNombre}`);
    if (btn) {
        btn.classList.remove('text-slate-400');
        btn.classList.add('text-blue-600', 'border-b-2', 'border-blue-600');
    }
    if (pestañaNombre === 'dashboard' && localId) cargarDashboard(periodoActualDashboard);
    if (pestañaNombre === 'stock' && localId) cargarInsumos();
    if (pestañaNombre === 'caja'  && localId) cargarArqueo();
    lucide.createIcons();
}

function agregarNuevaMesa() {
    contadorMesas++;
    const areaActiva = document.getElementById(`area-${sectorActivo}`);
    const numStr = String(contadorMesas).padStart(2, '0');
    const mesa = document.createElement('div');
    mesa.id = `mesa-${contadorMesas}`;
    mesa.className = 'mesa absolute p-6 rounded-3xl border-2 border-blue-500 bg-white shadow-xl cursor-grab';
    // Posición en grilla dentro del sector activo
    const mesasExistentes = areaActiva.querySelectorAll('.mesa').length;
    const col = mesasExistentes % 3;
    const fila = Math.floor(mesasExistentes / 3);
    mesa.style.cssText = `top: ${80 + fila * 180}px; left: ${80 + col * 190}px; width: 140px;`;
    mesa.innerHTML = `
        <div class="text-xs font-black text-slate-400 uppercase">${numStr}</div>
        <div class="text-2xl font-black text-slate-800 my-2">Mesa</div>
        <div class="text-sm font-bold text-blue-600 mesa-total">Libre</div>
    `;
    areaActiva.appendChild(mesa);
    if (!modoEdicion) toggleModoEdicion();
    else agregarBotonEliminar(mesa);
    lucide.createIcons();
}

function agregarBotonEliminar(mesaEl) {
    if (mesaEl.querySelector('.btn-eliminar-mesa')) return;
    const btn = document.createElement('button');
    // Posicionado dentro de la mesa (top-right) para no ser clippeado por overflow-hidden del canvas
    btn.className = 'btn-eliminar-mesa absolute top-2 right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs font-black hover:bg-red-600 transition z-10 leading-none flex items-center justify-center';
    btn.innerText = '×';
    btn.onclick = (e) => { e.stopPropagation(); eliminarMesa(mesaEl.id); };
    mesaEl.appendChild(btn);
}

function eliminarMesa(mesaId) {
    const mesa = document.getElementById(mesaId);
    if (mesa) mesa.remove();
    delete carritos[mesaId];
}

function cambiarSector(nuevoSectorId) {
    const areaActual = document.getElementById(`area-${sectorActivo}`);
    // Si estamos en modo edición, limpiar estado visual del sector que dejamos
    if (modoEdicion && areaActual) {
        areaActual.classList.remove('bg-slate-100', 'border-blue-300');
        areaActual.querySelectorAll('.btn-eliminar-mesa').forEach(b => b.remove());
        areaActual.querySelectorAll('.mesa').forEach(m => m.classList.replace('cursor-grab', 'cursor-pointer'));
    }

    sectorActivo = nuevoSectorId;

    // Mostrar solo el canvas activo
    document.querySelectorAll('.sector-canvas').forEach(c => c.classList.add('hidden'));
    const areaNueva = document.getElementById(`area-${sectorActivo}`);
    areaNueva.classList.remove('hidden');

    // Estilos de tabs: activo vs inactivo
    document.querySelectorAll('.sector-tab').forEach(t => {
        t.classList.remove('bg-blue-600', 'text-white');
        t.classList.add('bg-white', 'text-slate-600', 'border', 'border-slate-200');
    });
    const tabActivo = document.getElementById(`tab-${sectorActivo}`);
    tabActivo.classList.add('bg-blue-600', 'text-white');
    tabActivo.classList.remove('bg-white', 'text-slate-600', 'border', 'border-slate-200');

    // Si seguimos en modo edición, aplicar estado al sector nuevo
    if (modoEdicion) {
        areaNueva.classList.add('bg-slate-100', 'border-blue-300');
        areaNueva.querySelectorAll('.mesa').forEach(m => {
            m.classList.replace('cursor-pointer', 'cursor-grab');
            agregarBotonEliminar(m);
        });
    }

    lucide.createIcons();
}

function agregarNuevoSector() {
    const nombre = prompt('Nombre de la zona (ej: Planta Alta, Terraza):');
    if (!nombre || !nombre.trim()) return;

    contadorSectores++;
    const id = `sector-${contadorSectores}`;
    sectores.push({ id, nombre: nombre.trim() });
    crearSectorUI(id, nombre.trim());
    cambiarSector(id);
}

function toggleModoEdicion() {
    modoEdicion = !modoEdicion;
    const btn = document.getElementById('btn-editar');
    const areaActiva = document.getElementById(`area-${sectorActivo}`);
    if (modoEdicion) {
        btn.innerHTML = '<i data-lucide="save" class="w-4"></i> Guardar Plano';
        btn.classList.replace('bg-slate-900', 'bg-green-600');
        areaActiva.classList.add('bg-slate-100', 'border-blue-300');
        areaActiva.querySelectorAll('.mesa').forEach(agregarBotonEliminar);
        areaActiva.querySelectorAll('.mesa').forEach(m => m.classList.replace('cursor-pointer', 'cursor-grab'));
    } else {
        btn.innerHTML = '<i data-lucide="move" class="w-4"></i> Editar Plano';
        btn.classList.replace('bg-green-600', 'bg-slate-900');
        areaActiva.classList.remove('bg-slate-100', 'border-blue-300');
        areaActiva.querySelectorAll('.btn-eliminar-mesa').forEach(b => b.remove());
        areaActiva.querySelectorAll('.mesa').forEach(m => m.classList.replace('cursor-grab', 'cursor-pointer'));
        guardarPlano();
    }
    lucide.createIcons();
}

function abrirPOS(numeroMesa) {
    mesaActivaEnPOS = `mesa-${numeroMesa}`;
    if (!carritos[mesaActivaEnPOS]) carritos[mesaActivaEnPOS] = [];

    // Buscar a qué sector pertenece la mesa para mostrarlo en el título
    const mesaEl = document.getElementById(mesaActivaEnPOS);
    const sectorId = mesaEl?.closest('.sector-canvas')?.dataset.sector;
    const sectorNombre = sectores.find(s => s.id === sectorId)?.nombre || '';

    document.getElementById('pos-mesa-titulo').innerText = sectorNombre
        ? `Mesa ${numeroMesa} · ${sectorNombre}`
        : `Mesa ${numeroMesa}`;
    document.getElementById('pos-screen').classList.remove('hidden');
    renderizarProductosPOS();
    renderizarPedido();
}

function cerrarPOS() {
    document.getElementById('pos-screen').classList.add('hidden');
}

function confirmarYCobrar() {
    const items = carritos[mesaActivaEnPOS] || [];
    if (items.length === 0) {
        mostrarToast('No hay productos en el pedido', true);
        return;
    }

    subtotalActual = items.reduce((sum, item) => sum + item.precio, 0);
    metodoPagoSeleccionado = null;
    tipoDescuento = 'pct';

    const numero = mesaActivaEnPOS.replace('mesa-', '');
    document.getElementById('modal-cobro-titulo').innerText = `Cobrar Mesa ${numero}`;
    document.getElementById('cobro-subtotal').innerText = `$${subtotalActual.toLocaleString('es-AR')}`;
    document.getElementById('cobro-descuento-valor').value = '';
    document.querySelectorAll('.metodo-btn').forEach(b => {
        b.classList.remove('border-blue-600', 'bg-blue-50', 'text-blue-600');
        b.classList.add('border-slate-200', 'text-slate-600');
    });
    cambiarTipoDescuento('pct');
    actualizarResumenCobro();

    const modal = document.getElementById('modal-cobro');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    lucide.createIcons();
}

function cerrarModalCobro() {
    const modal = document.getElementById('modal-cobro');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function seleccionarMetodoPago(metodo) {
    metodoPagoSeleccionado = metodo;
    document.querySelectorAll('.metodo-btn').forEach(b => {
        b.classList.remove('border-blue-600', 'bg-blue-50', 'text-blue-600');
        b.classList.add('border-slate-200', 'text-slate-600');
    });
    const btn = document.getElementById(`metodo-${metodo}`);
    if (btn) {
        btn.classList.remove('border-slate-200', 'text-slate-600');
        btn.classList.add('border-blue-600', 'bg-blue-50', 'text-blue-600');
    }
}

function cambiarTipoDescuento(tipo) {
    tipoDescuento = tipo;
    const btnPct   = document.getElementById('descuento-tipo-pct');
    const btnMonto = document.getElementById('descuento-tipo-monto');
    if (tipo === 'pct') {
        btnPct.classList.add('bg-blue-600', 'text-white');
        btnPct.classList.remove('bg-white', 'text-slate-500');
        btnMonto.classList.remove('bg-blue-600', 'text-white');
        btnMonto.classList.add('bg-white', 'text-slate-500');
    } else {
        btnMonto.classList.add('bg-blue-600', 'text-white');
        btnMonto.classList.remove('bg-white', 'text-slate-500');
        btnPct.classList.remove('bg-blue-600', 'text-white');
        btnPct.classList.add('bg-white', 'text-slate-500');
    }
    actualizarResumenCobro();
}

function actualizarResumenCobro() {
    const valor = parseFloat(document.getElementById('cobro-descuento-valor').value) || 0;
    let descuentoMonto = 0;
    if (tipoDescuento === 'pct') {
        descuentoMonto = Math.round(subtotalActual * (Math.min(valor, 100) / 100));
    } else {
        descuentoMonto = Math.min(Math.round(valor), subtotalActual);
    }
    const totalFinal = subtotalActual - descuentoMonto;
    const filaDescuento = document.getElementById('cobro-fila-descuento');
    if (descuentoMonto > 0) {
        filaDescuento.classList.remove('hidden');
        document.getElementById('cobro-descuento-monto').innerText = `-$${descuentoMonto.toLocaleString('es-AR')}`;
    } else {
        filaDescuento.classList.add('hidden');
    }
    document.getElementById('cobro-total-final').innerText = `$${totalFinal.toLocaleString('es-AR')}`;
}

async function confirmarCobroModal() {
    if (!metodoPagoSeleccionado) {
        mostrarToast('Seleccioná un método de pago', true);
        return;
    }

    const items    = carritos[mesaActivaEnPOS] || [];
    const mesaEl   = document.getElementById(mesaActivaEnPOS);
    const sectorId = mesaEl?.closest('.sector-canvas')?.dataset.sector;
    const sector   = sectores.find(s => s.id === sectorId)?.nombre || 'Salón';
    const numero   = mesaActivaEnPOS.replace('mesa-', '');

    const valor = parseFloat(document.getElementById('cobro-descuento-valor').value) || 0;
    let descuentoMonto = 0;
    if (tipoDescuento === 'pct') {
        descuentoMonto = Math.round(subtotalActual * (Math.min(valor, 100) / 100));
    } else {
        descuentoMonto = Math.min(Math.round(valor), subtotalActual);
    }
    const totalFinal = subtotalActual - descuentoMonto;

    const btnConfirmar = document.getElementById('btn-confirmar-cobro');
    if (btnConfirmar) { btnConfirmar.disabled = true; btnConfirmar.innerText = 'Guardando...'; }

    try {
        await addDoc(collection(db, 'locales', localId, 'pedidos'), {
            mesaId:     mesaActivaEnPOS,
            numeroMesa: parseInt(numero),
            sector,
            items,
            subtotal:   subtotalActual,
            descuento:  descuentoMonto,
            total:      totalFinal,
            metodoPago: metodoPagoSeleccionado,
            timestamp:  serverTimestamp(),
            estado:     'cerrado'
        });

        await deleteDoc(doc(db, 'locales', localId, 'mesas', mesaActivaEnPOS));
        carritos[mesaActivaEnPOS] = [];
        actualizarTotalMesa(mesaActivaEnPOS);
        cerrarModalCobro();
        cerrarPOS();
        mostrarToast(`Mesa ${numero} cobrada ✓  $${totalFinal.toLocaleString('es-AR')}`);
    } catch (error) {
        console.error('Error al guardar pedido:', error);
        mostrarToast('Error al guardar el pedido', true);
    } finally {
        if (btnConfirmar) { btnConfirmar.disabled = false; btnConfirmar.innerText = 'Confirmar Cobro'; }
    }
}

function renderizarProductosPOS() {
    if (!categoriaActivaPOS && categorias.length > 0) categoriaActivaPOS = categorias[0].id;

    // Sidebar de categorías dinámico
    const sidebar = document.getElementById('pos-categorias-sidebar');
    if (sidebar) {
        sidebar.innerHTML = categorias.map(cat => `
            <button onclick="seleccionarCategoriaPOS('${cat.id}')"
                    class="flex flex-col items-center justify-center p-3 rounded-2xl transition gap-1 ${cat.id === categoriaActivaPOS ? 'bg-blue-50 text-blue-600 border-2 border-blue-600' : 'bg-white text-slate-400'}">
                <span class="text-xl">${cat.icono}</span>
                <span class="text-[9px] font-bold uppercase tracking-widest leading-tight text-center">${cat.nombre}</span>
            </button>
        `).join('');
    }

    // Grilla de productos filtrada por categoría activa
    const contenedor = document.querySelector('#pos-screen main div');
    if (!contenedor) return;
    contenedor.innerHTML = "";
    const filtrados = productos.filter(p => p.categoriaId === categoriaActivaPOS);
    filtrados.forEach(prod => {
        const card = document.createElement('div');
        card.className = "bg-white p-4 rounded-[1.5rem] shadow-sm border border-slate-200 flex flex-col items-center text-center hover:shadow-md transition";
        const contenidoVariantes = prod.variantes.map((v, index) => `
            <div class="flex items-center gap-1 w-full">
                <button onclick="agregarItem('${prod.nombre} ${v.nombre}', ${v.precio})"
                        class="flex-1 bg-slate-50 py-2 rounded-xl text-[10px] font-bold hover:bg-blue-600 hover:text-white transition italic">
                    ${v.nombre} ($${(v.precio/1000).toFixed(1)}k)
                </button>
                <button onclick="editarProducto('${prod.id}', ${index})" class="btn-editar-interno p-2 text-slate-300 hover:text-blue-500 transition">
                    <i data-lucide="edit-3" class="w-3 h-3"></i>
                </button>
            </div>
        `).join('');
        card.innerHTML = `<h4 class="font-bold text-slate-800 text-sm uppercase mb-3">${prod.nombre}</h4><div class="w-full space-y-2">${contenidoVariantes}</div>`;
        contenedor.appendChild(card);
    });
    lucide.createIcons();
}

function editarProducto(id, indexVariante) {
    const producto = productos.find(p => p.id === id);
    if (!producto) return;
    productoSiendoEditado = producto;
    varianteIndexSiendoEditada = indexVariante; 
    const variante = producto.variantes[indexVariante];
    document.getElementById('edit-nombre').value = variante.nombre;
    document.getElementById('edit-precio').value = variante.precio;
    const modal = document.getElementById('modal-editar');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

async function guardarCambiosModal() {
    if (!productoSiendoEditado) return;
    const nuevoNombre = document.getElementById('edit-nombre').value;
    const nuevoPrecio = document.getElementById('edit-precio').value;
    if (nuevoNombre && nuevoPrecio) {
        productoSiendoEditado.variantes[varianteIndexSiendoEditada].nombre = nuevoNombre;
        productoSiendoEditado.variantes[varianteIndexSiendoEditada].precio = parseInt(nuevoPrecio);
        if (localId && productoSiendoEditado.id) {
            try {
                await setDoc(doc(db, 'locales', localId, 'productos', productoSiendoEditado.id),
                    { variantes: productoSiendoEditado.variantes }, { merge: true });
            } catch (e) { console.error('Error al guardar variante:', e); }
        }
        renderizarProductosPOS();
        cerrarModal();
    }
}

function cerrarModal() {
    const modal = document.getElementById('modal-editar');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function agregarItem(nombre, precio) {
    if (!mesaActivaEnPOS) return;
    carritos[mesaActivaEnPOS].push({ nombre, precio });
    renderizarPedido();
    actualizarTotalMesa(mesaActivaEnPOS);
    sincronizarCarritoMesa(mesaActivaEnPOS);
}

function renderizarPedido() {
    const items = carritos[mesaActivaEnPOS] || [];
    const lista = document.getElementById('pos-lista-items');
    const totalFinal = document.getElementById('pos-total-final');
    const totalSuperior = document.getElementById('pos-total-superior');
    if (items.length === 0) {
        lista.innerHTML = '<p class="text-slate-400 text-center italic text-sm mt-10">No hay productos cargados</p>';
        totalFinal.innerText = "0";
        totalSuperior.innerText = "0";
        return;
    }
    let total = 0;
    lista.innerHTML = items.map((item, index) => {
        total += item.precio;
        return `<div class="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100"><div class="flex-1"><p class="font-bold text-slate-800 text-sm">${item.nombre}</p><p class="text-[10px] text-slate-400 font-bold uppercase">$${item.precio.toLocaleString('es-AR')}</p></div><button onclick="eliminarItem(${index})" class="text-red-400 hover:text-red-600 p-1"><i data-lucide="trash-2" class="w-4"></i></button></div>`;
    }).join('');
    totalFinal.innerText = total.toLocaleString('es-AR');
    totalSuperior.innerText = total.toLocaleString('es-AR');
    lucide.createIcons();
}

function eliminarItem(index) {
    if (!mesaActivaEnPOS) return;
    carritos[mesaActivaEnPOS].splice(index, 1);
    renderizarPedido();
    actualizarTotalMesa(mesaActivaEnPOS);
    sincronizarCarritoMesa(mesaActivaEnPOS);
}

function actualizarTotalMesa(mesaId) {
    const items = carritos[mesaId] || [];
    const total = items.reduce((sum, item) => sum + item.precio, 0);
    const mesaEl = document.getElementById(mesaId);
    if (!mesaEl) return;
    const totalEl = mesaEl.querySelector('.mesa-total');
    if (totalEl) {
        totalEl.innerText = total > 0 ? `$${total.toLocaleString('es-AR')}` : 'Libre';
        totalEl.className = `text-sm font-bold mesa-total ${total > 0 ? 'text-green-600' : 'text-blue-600'}`;
    }
    mesaEl.classList.toggle('border-green-500', total > 0);
    mesaEl.classList.toggle('border-blue-500', total === 0);
}

// ==========================================
// 4. PLANO DEL SALÓN — FIRESTORE
// ==========================================

async function guardarPlano() {
    if (!localId) return;

    // Recolectar posición de cada mesa y a qué sector pertenece
    const mesasData = {};
    document.querySelectorAll('.mesa').forEach(mesaEl => {
        const sectorId = mesaEl.closest('.sector-canvas')?.dataset.sector;
        mesasData[mesaEl.id] = {
            sectorId: sectorId || 'salon',
            top:  parseInt(mesaEl.style.top)  || 0,
            left: parseInt(mesaEl.style.left) || 0
        };
    });

    const planoData = {
        sectores,
        mesas: mesasData,
        contadorMesas,
        contadorSectores
    };

    try {
        await setDoc(doc(db, 'locales', localId, 'plano', 'layout'), planoData);
        mostrarToast('Plano guardado ✓');
    } catch (error) {
        console.error("Error al guardar plano:", error);
        mostrarToast('Error al guardar', true);
    }
}

async function cargarPlano() {
    if (!localId) return;

    const planoDoc = await getDoc(doc(db, 'locales', localId, 'plano', 'layout'));
    if (!planoDoc.exists()) return;

    const data = planoDoc.data();

    // Restaurar contadores
    contadorMesas    = data.contadorMesas    || 1;
    contadorSectores = data.contadorSectores || 1;

    // Borrar la mesa inicial del HTML (se va a reemplazar con los datos guardados)
    document.getElementById('mesa-1')?.remove();

    // Restaurar sectores (el "salon" ya existe en el HTML, crear los demás)
    if (data.sectores) {
        sectores = data.sectores;
        data.sectores.forEach(sector => {
            if (sector.id !== 'salon') crearSectorUI(sector.id, sector.nombre);
        });
    }

    // Restaurar mesas en su sector y posición
    if (data.mesas) {
        Object.entries(data.mesas).forEach(([mesaId, mesaData]) => {
            const area = document.getElementById(`area-${mesaData.sectorId}`);
            if (!area) return;
            const numero = mesaId.replace('mesa-', '');
            const mesa = document.createElement('div');
            mesa.id = mesaId;
            mesa.className = 'mesa absolute p-6 rounded-3xl border-2 border-blue-500 bg-white shadow-xl cursor-pointer';
            mesa.style.cssText = `top: ${mesaData.top}px; left: ${mesaData.left}px; width: 140px;`;
            mesa.innerHTML = `
                <div class="text-xs font-black text-slate-400 uppercase">${String(numero).padStart(2, '0')}</div>
                <div class="text-2xl font-black text-slate-800 my-2">Mesa</div>
                <div class="text-sm font-bold text-blue-600 mesa-total">Libre</div>
            `;
            area.appendChild(mesa);
        });
    }

    lucide.createIcons();
}

// Crea el tab y canvas de un sector sin usar prompt (para cargar desde Firestore)
function crearSectorUI(id, nombre) {
    const tabsContainer = document.getElementById('sector-tabs');
    const btnNuevaZona  = tabsContainer.lastElementChild;
    const tab = document.createElement('button');
    tab.id        = `tab-${id}`;
    tab.className = 'sector-tab px-5 py-2 rounded-2xl font-bold text-sm bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 transition';
    tab.onclick   = () => cambiarSector(id);
    tab.innerText = nombre;
    tabsContainer.insertBefore(tab, btnNuevaZona);

    const contenedor = document.getElementById('contenedor-sectores');
    const canvas = document.createElement('div');
    canvas.id             = `area-${id}`;
    canvas.dataset.sector = id;
    canvas.className      = 'sector-canvas hidden relative w-full h-[600px] bg-white rounded-[2.5rem] border-2 border-dashed border-slate-200 overflow-hidden shadow-inner';
    contenedor.appendChild(canvas);
}

// Toast de feedback no intrusivo
function mostrarToast(mensaje, esError = false) {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl font-bold text-sm shadow-xl z-[9999] transition-all ${esError ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'}`;
    toast.innerText = mensaje;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

// Draggable y Eventos
document.addEventListener('mousedown', (e) => {
    if (!modoEdicion) return;
    const mesa = e.target.closest('.mesa');
    if (mesa) {
        mesaSeleccionada = mesa;
        const rect = mesa.getBoundingClientRect();
        offset.x = e.clientX - rect.left;
        offset.y = e.clientY - rect.top;
        mesa.style.transition = 'none';
    }
});

document.addEventListener('mousemove', (e) => {
    if (!modoEdicion || !mesaSeleccionada) return;
    const area = document.getElementById(`area-${sectorActivo}`).getBoundingClientRect();
    let x = e.clientX - area.left - offset.x;
    let y = e.clientY - area.top - offset.y;
    mesaSeleccionada.style.left = `${Math.max(0, x)}px`;
    mesaSeleccionada.style.top = `${Math.max(0, y)}px`;
});

document.addEventListener('mouseup', () => {
    if (mesaSeleccionada) {
        mesaSeleccionada.style.transition = 'all 0.2s';
        mesaSeleccionada = null;
    }
});

document.addEventListener('click', (e) => {
    const mesa = e.target.closest('.mesa');
    if (mesa && !modoEdicion) {
        abrirPOS(mesa.id.replace('mesa-', ''));
    }
});

// Soporte táctil para arrastrar mesas en tablets
document.addEventListener('touchstart', (e) => {
    if (!modoEdicion) return;
    const mesa = e.target.closest('.mesa');
    if (mesa) {
        mesaSeleccionada = mesa;
        const rect = mesa.getBoundingClientRect();
        const touch = e.touches[0];
        offset.x = touch.clientX - rect.left;
        offset.y = touch.clientY - rect.top;
        mesa.style.transition = 'none';
        e.preventDefault();
    }
}, { passive: false });

document.addEventListener('touchmove', (e) => {
    if (!modoEdicion || !mesaSeleccionada) return;
    const touch = e.touches[0];
    const area = document.getElementById(`area-${sectorActivo}`).getBoundingClientRect();
    let x = touch.clientX - area.left - offset.x;
    let y = touch.clientY - area.top - offset.y;
    mesaSeleccionada.style.left = `${Math.max(0, x)}px`;
    mesaSeleccionada.style.top = `${Math.max(0, y)}px`;
    e.preventDefault();
}, { passive: false });

document.addEventListener('touchend', () => {
    if (mesaSeleccionada) {
        mesaSeleccionada.style.transition = 'all 0.2s';
        mesaSeleccionada = null;
    }
});

// ==========================================
// 5. CARRITO REAL-TIME (FIRESTORE)
// ==========================================

function escucharMesas() {
    if (!localId) return;
    onSnapshot(collection(db, 'locales', localId, 'mesas'), (snapshot) => {
        snapshot.docChanges().forEach(change => {
            const mesaId = change.doc.id;
            carritos[mesaId] = change.type === 'removed' ? [] : (change.doc.data().items || []);
            actualizarTotalMesa(mesaId);
            if (mesaId === mesaActivaEnPOS) renderizarPedido();
        });
    });
}

async function sincronizarCarritoMesa(mesaId) {
    if (!localId) return;
    const items   = carritos[mesaId] || [];
    const mesaRef = doc(db, 'locales', localId, 'mesas', mesaId);
    if (items.length === 0) {
        await deleteDoc(mesaRef);
    } else {
        const mesaEl  = document.getElementById(mesaId);
        const sectorId = mesaEl?.closest('.sector-canvas')?.dataset.sector;
        const sector   = sectores.find(s => s.id === sectorId)?.nombre || 'Salón';
        await setDoc(mesaRef, { items, sector, numeroMesa: parseInt(mesaId.replace('mesa-', '')) });
    }
}

// ==========================================
// 6. PRODUCTOS Y CARTA
// ==========================================

async function cargarProductos() {
    if (!localId) return;
    const catSnap = await getDocs(collection(db, 'locales', localId, 'categorias'));
    if (catSnap.empty) {
        await seedProductosIniciales();
    } else {
        categorias = catSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.orden || 0) - (b.orden || 0));
        const prodSnap = await getDocs(collection(db, 'locales', localId, 'productos'));
        productos = prodSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.orden || 0) - (b.orden || 0));
    }
    renderizarCarta();
    renderizarProductosPOS();
}

async function seedProductosIniciales() {
    const catRefs = {};
    for (const cat of [{ nombre: 'Café', icono: '☕', orden: 1 }, { nombre: 'Dulce', icono: '🥐', orden: 2 }]) {
        const ref = await addDoc(collection(db, 'locales', localId, 'categorias'), cat);
        catRefs[cat.nombre] = ref.id;
        categorias.push({ id: ref.id, ...cat });
    }
    const prodData = [
        { nombre: 'Flat White', icono: '☕', categoriaId: catRefs['Café'], variantes: [{ nombre: 'Estándar', precio: 4500 }, { nombre: 'Avena', precio: 5200 }], orden: 1 },
        { nombre: 'Latte',      icono: '🥛', categoriaId: catRefs['Café'], variantes: [{ nombre: 'XL', precio: 4800 }, { nombre: 'Vainilla', precio: 5300 }], orden: 2 },
        { nombre: 'Espresso',   icono: '⚡', categoriaId: catRefs['Café'], variantes: [{ nombre: 'Simple', precio: 3500 }, { nombre: 'Doble', precio: 4200 }], orden: 3 },
        { nombre: 'Capuccino',  icono: '🍫', categoriaId: catRefs['Café'], variantes: [{ nombre: 'Italiano', precio: 4700 }, { nombre: 'Cacao', precio: 4900 }], orden: 4 },
        { nombre: 'Filtrado',   icono: '⚖️', categoriaId: catRefs['Café'], variantes: [{ nombre: 'V60', precio: 5500 }, { nombre: 'Chemex', precio: 9500 }], orden: 5 }
    ];
    for (const prod of prodData) {
        const ref = await addDoc(collection(db, 'locales', localId, 'productos'), prod);
        productos.push({ id: ref.id, ...prod });
    }
}

function renderizarCarta() {
    if (!document.getElementById('pestaña-carta')) return;
    const adminBtns = document.getElementById('carta-admin-btns');
    if (adminBtns) adminBtns.style.display = esAdmin ? 'flex' : 'none';
    if (!categoriaActivaCarta && categorias.length > 0) categoriaActivaCarta = categorias[0].id;
    renderizarCategoriasCarta();
    renderizarProductosCarta();
}

function renderizarCategoriasCarta() {
    const contenedor = document.getElementById('carta-categorias');
    if (!contenedor) return;
    contenedor.innerHTML = categorias.map(cat => `
        <button onclick="seleccionarCategoriaCarta('${cat.id}')" id="carta-cat-${cat.id}"
                class="px-5 py-2 rounded-2xl font-bold text-sm transition ${cat.id === categoriaActivaCarta ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}">
            ${cat.icono} ${cat.nombre}
        </button>
    `).join('');
}

function renderizarProductosCarta() {
    const contenedor = document.getElementById('carta-productos');
    if (!contenedor) return;
    const filtrados = productos.filter(p => p.categoriaId === categoriaActivaCarta);
    if (filtrados.length === 0) {
        contenedor.innerHTML = `<div class="col-span-full py-16 text-center text-slate-400">
            <p class="text-lg font-bold mb-2">No hay productos en esta categoría</p>
            ${esAdmin ? `<button onclick="abrirModalProducto()" class="text-blue-600 font-bold hover:underline">+ Agregar el primero</button>` : ''}
        </div>`;
        return;
    }
    contenedor.innerHTML = filtrados.map(prod => `
        <div class="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-md transition">
            <div class="flex justify-between items-start mb-3">
                <h4 class="font-black text-slate-800">${prod.nombre}</h4>
                ${esAdmin ? `<div class="flex gap-1">
                    <button onclick="abrirModalProducto('${prod.id}')" class="p-1.5 text-slate-400 hover:text-blue-500 transition"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
                    <button onclick="confirmarEliminarProducto('${prod.id}')" class="p-1.5 text-slate-400 hover:text-red-500 transition"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>` : ''}
            </div>
            <div class="space-y-1.5">
                ${prod.variantes.map(v => `
                    <div class="flex justify-between text-sm">
                        <span class="text-slate-500">${v.nombre}</span>
                        <span class="font-bold">$${v.precio.toLocaleString('es-AR')}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
    lucide.createIcons();
}

function seleccionarCategoriaCarta(catId) {
    categoriaActivaCarta = catId;
    renderizarCarta();
}

function seleccionarCategoriaPOS(catId) {
    categoriaActivaPOS = catId;
    renderizarProductosPOS();
}

function abrirModalProducto(prodId = null) {
    productoEditandoId = prodId;
    document.getElementById('modal-producto-titulo').innerText = prodId ? 'Editar Producto' : 'Nuevo Producto';
    const select = document.getElementById('prod-categoria');
    select.innerHTML = categorias.map(cat => `<option value="${cat.id}">${cat.icono} ${cat.nombre}</option>`).join('');
    if (prodId) {
        const prod = productos.find(p => p.id === prodId);
        document.getElementById('prod-icono').value  = prod.icono;
        document.getElementById('prod-nombre').value = prod.nombre;
        select.value = prod.categoriaId;
        renderizarVariantesModal(prod.variantes);
    } else {
        document.getElementById('prod-icono').value  = '';
        document.getElementById('prod-nombre').value = '';
        if (categoriaActivaCarta) select.value = categoriaActivaCarta;
        renderizarVariantesModal([{ nombre: '', precio: '' }]);
    }
    const modal = document.getElementById('modal-producto');
    modal.classList.remove('hidden'); modal.classList.add('flex');
    lucide.createIcons();
}

function cerrarModalProducto() {
    document.getElementById('modal-producto').classList.add('hidden');
    document.getElementById('modal-producto').classList.remove('flex');
    productoEditandoId = null;
}

function renderizarVariantesModal(variantes) {
    document.getElementById('prod-variantes').innerHTML = variantes.map((v, i) => `
        <div class="flex gap-2 items-center" id="var-row-${i}">
            <input type="text" id="var-nombre-${i}" value="${v.nombre}" placeholder="Nombre (ej: Grande)"
                   class="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500">
            <input type="number" id="var-precio-${i}" value="${v.precio}" placeholder="Precio"
                   class="w-28 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500">
            <button onclick="eliminarVarianteModal(${i})" class="text-red-400 hover:text-red-600 font-black text-xl leading-none">×</button>
        </div>
    `).join('');
}

function agregarVarianteModal() {
    const i = document.querySelectorAll('#prod-variantes > div').length;
    const fila = document.createElement('div');
    fila.id = `var-row-${i}`;
    fila.className = 'flex gap-2 items-center';
    fila.innerHTML = `
        <input type="text" id="var-nombre-${i}" placeholder="Nombre (ej: Grande)"
               class="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500">
        <input type="number" id="var-precio-${i}" placeholder="Precio"
               class="w-28 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500">
        <button onclick="eliminarVarianteModal(${i})" class="text-red-400 hover:text-red-600 font-black text-xl leading-none">×</button>
    `;
    document.getElementById('prod-variantes').appendChild(fila);
}

function eliminarVarianteModal(i) { document.getElementById(`var-row-${i}`)?.remove(); }

async function guardarProductoModal() {
    const nombre      = document.getElementById('prod-nombre').value.trim();
    const icono       = document.getElementById('prod-icono').value.trim() || '🍽️';
    const categoriaId = document.getElementById('prod-categoria').value;
    if (!nombre) { mostrarToast('El nombre es obligatorio', true); return; }
    const variantes = [];
    document.querySelectorAll('#prod-variantes > div').forEach(fila => {
        const i    = fila.id.replace('var-row-', '');
        const nVar = document.getElementById(`var-nombre-${i}`)?.value.trim();
        const pVar = parseInt(document.getElementById(`var-precio-${i}`)?.value);
        if (nVar && !isNaN(pVar)) variantes.push({ nombre: nVar, precio: pVar });
    });
    if (variantes.length === 0) { mostrarToast('Agregá al menos una variante', true); return; }
    const data = { nombre, icono, categoriaId, variantes, orden: productos.length + 1 };
    try {
        if (productoEditandoId) {
            await setDoc(doc(db, 'locales', localId, 'productos', productoEditandoId), data);
            const idx = productos.findIndex(p => p.id === productoEditandoId);
            if (idx !== -1) productos[idx] = { id: productoEditandoId, ...data };
            mostrarToast('Producto actualizado ✓');
        } else {
            const ref = await addDoc(collection(db, 'locales', localId, 'productos'), data);
            productos.push({ id: ref.id, ...data });
            mostrarToast('Producto agregado ✓');
        }
        cerrarModalProducto();
        renderizarCarta();
        renderizarProductosPOS();
    } catch (e) { console.error(e); mostrarToast('Error al guardar', true); }
}

async function confirmarEliminarProducto(prodId) {
    if (!confirm('¿Eliminar este producto?')) return;
    try {
        await deleteDoc(doc(db, 'locales', localId, 'productos', prodId));
        productos = productos.filter(p => p.id !== prodId);
        renderizarCarta(); renderizarProductosPOS();
        mostrarToast('Producto eliminado');
    } catch (e) { mostrarToast('Error al eliminar', true); }
}

function abrirModalCategoria() {
    document.getElementById('cat-icono').value  = '';
    document.getElementById('cat-nombre').value = '';
    const modal = document.getElementById('modal-categoria');
    modal.classList.remove('hidden'); modal.classList.add('flex');
    lucide.createIcons();
}

function cerrarModalCategoria() {
    document.getElementById('modal-categoria').classList.add('hidden');
    document.getElementById('modal-categoria').classList.remove('flex');
}

async function guardarCategoriaModal() {
    const nombre = document.getElementById('cat-nombre').value.trim();
    const icono  = document.getElementById('cat-icono').value.trim() || '🍽️';
    if (!nombre) { mostrarToast('El nombre es obligatorio', true); return; }
    try {
        const ref = await addDoc(collection(db, 'locales', localId, 'categorias'), { nombre, icono, orden: categorias.length + 1 });
        categorias.push({ id: ref.id, nombre, icono, orden: categorias.length + 1 });
        cerrarModalCategoria();
        renderizarCarta();
        mostrarToast('Categoría agregada ✓');
    } catch (e) { mostrarToast('Error al guardar', true); }
}

// ==========================================
// 7. INVENTARIO & STOCK
// ==========================================

async function cargarInsumos() {
    if (!localId) return;
    const snap = await getDocs(collection(db, 'locales', localId, 'insumos'));
    if (snap.empty && esAdmin) {
        await seedInsumosIniciales();
    } else {
        insumos = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.orden || 0) - (b.orden || 0));
    }
    renderizarStock();
}

async function seedInsumosIniciales() {
    const data = [
        { nombre: 'Leche Entera',       cantidad: 8,   unidad: 'L',        stockMinimo: 10,  orden: 1 },
        { nombre: 'Café Molido',         cantidad: 500, unidad: 'g',        stockMinimo: 300, orden: 2 },
        { nombre: 'Azúcar',              cantidad: 2,   unidad: 'kg',       stockMinimo: 1,   orden: 3 },
        { nombre: 'Vasos Descartables',  cantidad: 50,  unidad: 'unidades', stockMinimo: 30,  orden: 4 },
    ];
    for (const ins of data) {
        const ref = await addDoc(collection(db, 'locales', localId, 'insumos'), ins);
        insumos.push({ id: ref.id, ...ins });
    }
}

function renderizarStock() {
    const contenedor = document.getElementById('stock-lista');
    if (!contenedor) return;
    const adminBtns = document.getElementById('stock-admin-btns');
    if (adminBtns) adminBtns.style.display = esAdmin ? 'block' : 'none';

    if (insumos.length === 0) {
        contenedor.innerHTML = `<div class="col-span-full py-16 text-center text-slate-400">
            <p class="text-lg font-bold mb-2">Sin insumos registrados</p>
            ${esAdmin ? '<button onclick="abrirModalInsumo()" class="text-blue-600 font-bold hover:underline">+ Agregar el primero</button>' : ''}
        </div>`;
        return;
    }

    const sorted = [...insumos].sort((a, b) => {
        const aOk = a.cantidad >= a.stockMinimo;
        const bOk = b.cantidad >= b.stockMinimo;
        if (aOk !== bOk) return aOk ? 1 : -1;
        return (a.orden || 0) - (b.orden || 0);
    });

    contenedor.innerHTML = sorted.map(ins => {
        const critico  = ins.cantidad < ins.stockMinimo;
        const sinStock = ins.cantidad <= 0;
        const pct      = Math.min(Math.round((ins.cantidad / ins.stockMinimo) * 100), 100);
        const barColor = sinStock ? 'bg-red-600' : critico ? 'bg-orange-400' : 'bg-green-500';
        const cardBg   = sinStock ? 'bg-red-50 border-red-300' : critico ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-200';
        const badge    = sinStock
            ? '<span class="text-[9px] font-black uppercase text-red-700 bg-red-100 px-2 py-0.5 rounded-full">Sin stock</span>'
            : critico
            ? '<span class="text-[9px] font-black uppercase text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">Crítico</span>'
            : '<span class="text-[9px] font-black uppercase text-green-700 bg-green-100 px-2 py-0.5 rounded-full">OK</span>';
        const numColor = sinStock ? 'text-red-600' : critico ? 'text-orange-500' : 'text-slate-800';

        return `
            <div class="p-6 rounded-[2rem] border-2 ${cardBg} shadow-sm">
                <div class="flex justify-between items-start mb-4">
                    <div class="flex-1">
                        <h4 class="font-black text-slate-800 mb-1.5">${ins.nombre}</h4>
                        ${badge}
                    </div>
                    ${esAdmin ? `<div class="flex gap-0.5 flex-none ml-2">
                        <button onclick="abrirModalInsumo('${ins.id}')" class="p-1.5 text-slate-300 hover:text-blue-500 transition"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
                        <button onclick="confirmarEliminarInsumo('${ins.id}')" class="p-1.5 text-slate-300 hover:text-red-500 transition"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                    </div>` : ''}
                </div>

                <div class="flex justify-between items-end mb-2">
                    <span class="text-3xl font-black ${numColor}">${ins.cantidad}</span>
                    <span class="text-slate-400 font-bold text-xs text-right">
                        ${ins.unidad}<br>
                        <span class="text-slate-300">mín ${ins.stockMinimo}</span>
                    </span>
                </div>

                <div class="h-2 bg-slate-100 rounded-full overflow-hidden mb-4">
                    <div class="${barColor} h-full rounded-full transition-all duration-500" style="width:${pct}%"></div>
                </div>

                ${esAdmin ? `<button onclick="abrirModalAjuste('${ins.id}')"
                    class="w-full py-2.5 rounded-2xl font-bold text-sm border-2 border-slate-200 text-slate-500 hover:border-blue-400 hover:text-blue-600 transition flex items-center justify-center gap-2">
                    <i data-lucide="sliders-horizontal" class="w-3.5 h-3.5"></i> Ajustar
                </button>` : ''}
            </div>
        `;
    }).join('');
    lucide.createIcons();
}

function abrirModalInsumo(insId = null) {
    insumoEditandoId = insId;
    document.getElementById('modal-insumo-titulo').innerText = insId ? 'Editar Insumo' : 'Nuevo Insumo';
    if (insId) {
        const ins = insumos.find(i => i.id === insId);
        document.getElementById('ins-nombre').value   = ins.nombre;
        document.getElementById('ins-cantidad').value = ins.cantidad;
        document.getElementById('ins-unidad').value   = ins.unidad;
        document.getElementById('ins-minimo').value   = ins.stockMinimo;
    } else {
        document.getElementById('ins-nombre').value   = '';
        document.getElementById('ins-cantidad').value = '';
        document.getElementById('ins-unidad').value   = 'kg';
        document.getElementById('ins-minimo').value   = '';
    }
    const modal = document.getElementById('modal-insumo');
    modal.classList.remove('hidden'); modal.classList.add('flex');
    lucide.createIcons();
}

function cerrarModalInsumo() {
    document.getElementById('modal-insumo').classList.add('hidden');
    document.getElementById('modal-insumo').classList.remove('flex');
    insumoEditandoId = null;
}

async function guardarInsumoModal() {
    const nombre   = document.getElementById('ins-nombre').value.trim();
    const cantidad = parseFloat(document.getElementById('ins-cantidad').value);
    const unidad   = document.getElementById('ins-unidad').value;
    const minimo   = parseFloat(document.getElementById('ins-minimo').value);
    if (!nombre)                        { mostrarToast('El nombre es obligatorio', true); return; }
    if (isNaN(cantidad) || cantidad < 0) { mostrarToast('Ingresá una cantidad válida', true); return; }
    if (isNaN(minimo)   || minimo <= 0)  { mostrarToast('Ingresá un mínimo válido', true); return; }

    const data = { nombre, cantidad, unidad, stockMinimo: minimo, orden: insumos.length + 1 };
    try {
        if (insumoEditandoId) {
            await setDoc(doc(db, 'locales', localId, 'insumos', insumoEditandoId), data);
            const idx = insumos.findIndex(i => i.id === insumoEditandoId);
            if (idx !== -1) insumos[idx] = { id: insumoEditandoId, ...data };
            mostrarToast('Insumo actualizado ✓');
        } else {
            const ref = await addDoc(collection(db, 'locales', localId, 'insumos'), data);
            insumos.push({ id: ref.id, ...data });
            mostrarToast('Insumo agregado ✓');
        }
        cerrarModalInsumo();
        renderizarStock();
    } catch (e) { mostrarToast('Error al guardar', true); }
}

async function confirmarEliminarInsumo(insId) {
    if (!confirm('¿Eliminar este insumo?')) return;
    try {
        await deleteDoc(doc(db, 'locales', localId, 'insumos', insId));
        insumos = insumos.filter(i => i.id !== insId);
        renderizarStock();
        mostrarToast('Insumo eliminado');
    } catch (e) { mostrarToast('Error al eliminar', true); }
}

function abrirModalAjuste(insId) {
    insumoAjustandoId = insId;
    const ins = insumos.find(i => i.id === insId);
    document.getElementById('ajuste-nombre').innerText          = ins.nombre;
    document.getElementById('ajuste-unidad').innerText          = ins.unidad;
    document.getElementById('ajuste-cantidad-actual').innerText = `${ins.cantidad} ${ins.unidad}`;
    document.getElementById('ajuste-nueva-cantidad').value      = ins.cantidad;
    const modal = document.getElementById('modal-ajuste');
    modal.classList.remove('hidden'); modal.classList.add('flex');
}

function cerrarModalAjuste() {
    document.getElementById('modal-ajuste').classList.add('hidden');
    document.getElementById('modal-ajuste').classList.remove('flex');
    insumoAjustandoId = null;
}

function cambiarCantidadAjuste(delta) {
    const input = document.getElementById('ajuste-nueva-cantidad');
    const actual = parseFloat(input.value) || 0;
    input.value = Math.max(0, actual + delta);
}

async function guardarAjusteModal() {
    const nuevaCantidad = parseFloat(document.getElementById('ajuste-nueva-cantidad').value);
    if (isNaN(nuevaCantidad) || nuevaCantidad < 0) { mostrarToast('Cantidad inválida', true); return; }
    try {
        await setDoc(doc(db, 'locales', localId, 'insumos', insumoAjustandoId),
            { cantidad: nuevaCantidad }, { merge: true });
        const idx = insumos.findIndex(i => i.id === insumoAjustandoId);
        if (idx !== -1) insumos[idx].cantidad = nuevaCantidad;
        cerrarModalAjuste();
        renderizarStock();
        mostrarToast('Stock actualizado ✓');
    } catch (e) { mostrarToast('Error al actualizar', true); }
}

// ==========================================
// 8. ARQUEO DE CAJA
// ==========================================

async function cargarArqueo() {
    if (!localId) return;

    const hoy = new Date();
    const fechaEl = document.getElementById('arqueo-fecha');
    if (fechaEl) fechaEl.innerText = hoy.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const inicio = new Date();
    inicio.setHours(0, 0, 0, 0);

    const q = query(
        collection(db, 'locales', localId, 'pedidos'),
        where('timestamp', '>=', Timestamp.fromDate(inicio)),
        orderBy('timestamp', 'desc')
    );
    const snap = await getDocs(q);
    const pedidos = snap.docs.map(d => d.data());

    ventasPorMetodo = { efectivo: 0, debito: 0, credito: 0, qr: 0, transferencia: 0 };
    let totalVentas = 0;
    pedidos.forEach(p => {
        const m = p.metodoPago || 'efectivo';
        ventasPorMetodo[m] = (ventasPorMetodo[m] || 0) + (p.total || 0);
        totalVentas += (p.total || 0);
    });

    const labels = { efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito', qr: 'QR', transferencia: 'Transferencia' };
    const contenedor = document.getElementById('arqueo-ventas');
    if (contenedor) {
        const filas = Object.entries(ventasPorMetodo)
            .filter(([, monto]) => monto > 0)
            .map(([metodo, monto]) => `
                <div class="flex justify-between items-center p-3 rounded-2xl ${metodo === 'efectivo' ? 'bg-blue-50 border border-blue-100' : 'bg-slate-50'}">
                    <span class="font-bold text-sm text-slate-600">${labels[metodo]}</span>
                    <span class="font-black ${metodo === 'efectivo' ? 'text-blue-600' : 'text-slate-700'}">$${monto.toLocaleString('es-AR')}</span>
                </div>
            `).join('');
        contenedor.innerHTML = filas || '<p class="text-slate-400 italic text-sm">Sin ventas registradas hoy</p>';
    }

    const totalEl    = document.getElementById('arqueo-total-ventas');
    const efectivoEl = document.getElementById('arqueo-efectivo-ventas');
    if (totalEl)    totalEl.innerText    = `$${totalVentas.toLocaleString('es-AR')}`;
    if (efectivoEl) efectivoEl.innerText = `$${ventasPorMetodo.efectivo.toLocaleString('es-AR')}`;

    calcularArqueo();
    await cargarHistorialArqueos();
    lucide.createIcons();
}

function calcularArqueo() {
    const fondo   = parseFloat(document.getElementById('arqueo-fondo')?.value)   || 0;
    const retiros = parseFloat(document.getElementById('arqueo-retiros')?.value) || 0;
    const contado = parseFloat(document.getElementById('arqueo-contado')?.value);

    const resultadoEl  = document.getElementById('arqueo-resultado');
    if (isNaN(contado) && fondo === 0) {
        resultadoEl?.classList.add('hidden');
        return;
    }

    const esperado   = fondo + (ventasPorMetodo.efectivo || 0) - retiros;
    const diferencia = (isNaN(contado) ? 0 : contado) - esperado;

    const esperadoEl   = document.getElementById('arqueo-esperado');
    const diferenciaEl = document.getElementById('arqueo-diferencia');

    if (resultadoEl)  resultadoEl.classList.remove('hidden');
    if (esperadoEl)   esperadoEl.innerText = `$${esperado.toLocaleString('es-AR')}`;

    if (diferenciaEl) {
        const abs = Math.abs(diferencia);
        diferenciaEl.innerText   = `${diferencia >= 0 ? '+' : '−'}$${abs.toLocaleString('es-AR')}`;
        diferenciaEl.className   = `font-black text-2xl ${diferencia === 0 ? 'text-green-600' : diferencia > 0 ? 'text-blue-600' : 'text-red-600'}`;
    }
    if (resultadoEl) {
        resultadoEl.className = `mt-6 p-5 rounded-2xl space-y-2 ${diferencia === 0 ? 'bg-green-50' : diferencia > 0 ? 'bg-blue-50' : 'bg-red-50'}`;
    }
}

async function guardarArqueo() {
    const fondo   = parseFloat(document.getElementById('arqueo-fondo')?.value)   || 0;
    const retiros = parseFloat(document.getElementById('arqueo-retiros')?.value) || 0;
    const contado = parseFloat(document.getElementById('arqueo-contado')?.value);
    const notas   = document.getElementById('arqueo-notas')?.value.trim() || '';

    if (isNaN(contado)) { mostrarToast('Ingresá el efectivo contado', true); return; }

    const esperado    = fondo + (ventasPorMetodo.efectivo || 0) - retiros;
    const diferencia  = contado - esperado;
    const totalVentas = Object.values(ventasPorMetodo).reduce((s, v) => s + v, 0);

    const btn = document.getElementById('btn-guardar-arqueo');
    if (btn) { btn.disabled = true; btn.innerText = 'Guardando...'; }

    try {
        await addDoc(collection(db, 'locales', localId, 'arqueos'), {
            fecha:            serverTimestamp(),
            ventasPorMetodo,
            totalVentas,
            fondoInicial:     fondo,
            retiros,
            efectivoEsperado: esperado,
            efectivoContado:  contado,
            diferencia,
            notas,
        });
        mostrarToast('Arqueo guardado ✓');
        ['arqueo-fondo', 'arqueo-retiros', 'arqueo-contado', 'arqueo-notas'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.getElementById('arqueo-resultado')?.classList.add('hidden');
        await cargarHistorialArqueos();
    } catch (e) {
        console.error(e);
        mostrarToast('Error al guardar', true);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="lock" class="w-5 inline mr-2"></i>Cerrar y Guardar Arqueo';
            lucide.createIcons();
        }
    }
}

async function cargarHistorialArqueos() {
    if (!localId) return;
    const q = query(
        collection(db, 'locales', localId, 'arqueos'),
        orderBy('fecha', 'desc')
    );
    const snap = await getDocs(q);
    const arqueos = snap.docs.slice(0, 10).map(d => ({ id: d.id, ...d.data() }));

    const contenedor = document.getElementById('arqueo-historial');
    if (!contenedor) return;
    if (arqueos.length === 0) {
        contenedor.innerHTML = '<p class="text-slate-400 italic text-sm text-center py-4">Sin arqueos registrados</p>';
        return;
    }
    contenedor.innerHTML = arqueos.map(a => {
        const fecha    = a.fecha?.toDate ? a.fecha.toDate() : new Date();
        const fechaStr = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const horaStr  = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        const dif      = a.diferencia || 0;
        const difStr   = `${dif >= 0 ? '+' : '−'}$${Math.abs(dif).toLocaleString('es-AR')}`;
        const difColor = dif === 0 ? 'text-green-600' : dif > 0 ? 'text-blue-600' : 'text-red-600';
        return `
            <div class="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
                <div>
                    <p class="font-bold text-sm">${fechaStr} · ${horaStr}</p>
                    <p class="text-xs text-slate-400 font-medium">Total ventas: $${(a.totalVentas || 0).toLocaleString('es-AR')}${a.notas ? ' · ' + a.notas : ''}</p>
                </div>
                <span class="font-black ${difColor} text-lg">${difStr}</span>
            </div>
        `;
    }).join('');
}

// ==========================================
// 9. DASHBOARD — DATOS REALES DE FIRESTORE
// ==========================================

function fechaKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function cambiarPeriodoDashboard(periodo) {
    periodoActualDashboard = periodo;
    const labels = { dia: 'de hoy', semana: 'esta semana', mes: 'este mes' };
    ['dia', 'semana', 'mes'].forEach(p => {
        const btn = document.getElementById(`dash-btn-${p}`);
        if (!btn) return;
        if (p === periodo) {
            btn.classList.add('bg-blue-600', 'text-white', 'shadow-sm');
            btn.classList.remove('bg-white', 'text-slate-500', 'border', 'border-slate-200');
        } else {
            btn.classList.remove('bg-blue-600', 'text-white', 'shadow-sm');
            btn.classList.add('bg-white', 'text-slate-500', 'border', 'border-slate-200');
        }
    });
    document.querySelectorAll('.dash-periodo-label').forEach(el => el.innerText = labels[periodo]);
    cargarDashboard(periodo);
}

async function cargarDashboard(periodo) {
    if (!localId) return;

    const ahora = new Date();
    const inicio = new Date();
    if (periodo === 'dia') {
        inicio.setHours(0, 0, 0, 0);
    } else if (periodo === 'semana') {
        inicio.setDate(ahora.getDate() - 6);
        inicio.setHours(0, 0, 0, 0);
    } else {
        inicio.setDate(ahora.getDate() - 29);
        inicio.setHours(0, 0, 0, 0);
    }

    try {
        const q = query(
            collection(db, 'locales', localId, 'pedidos'),
            where('timestamp', '>=', Timestamp.fromDate(inicio)),
            orderBy('timestamp', 'desc')
        );
        const snap = await getDocs(q);
        const pedidos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        const totalVentas   = pedidos.reduce((s, p) => s + (p.total || 0), 0);
        const ticketPromedio = pedidos.length > 0 ? Math.round(totalVentas / pedidos.length) : 0;

        document.getElementById('dash-ventas').innerText = totalVentas > 0 ? `$${totalVentas.toLocaleString('es-AR')}` : '$0';
        document.getElementById('dash-ticket').innerText = ticketPromedio > 0 ? `$${ticketPromedio.toLocaleString('es-AR')}` : '-';
        document.getElementById('dash-mesas').innerText  = pedidos.length;

        const iaEl = document.getElementById('dash-ia-texto');
        if (iaEl) iaEl.innerHTML = generarMensajeIA(pedidos, periodo);

        renderizarVentasRecientes(pedidos.slice(0, 5));
        await renderizarGraficoSemanal();

    } catch (error) {
        console.error('Error al cargar dashboard:', error);
        mostrarToast('Error al cargar métricas', true);
    }
}

function generarMensajeIA(pedidos, periodo) {
    const periodoLabel = periodo === 'dia' ? 'hoy' : periodo === 'semana' ? 'esta semana' : 'este mes';
    if (pedidos.length === 0) {
        return `Sin ventas registradas ${periodoLabel} todavía. Los datos van a aparecer acá ni bien cierres la primera mesa.`;
    }
    const total = pedidos.reduce((s, p) => s + (p.total || 0), 0);
    const ticket = Math.round(total / pedidos.length);
    const conteoItems = {};
    pedidos.forEach(p => (p.items || []).forEach(item => {
        conteoItems[item.nombre] = (conteoItems[item.nombre] || 0) + 1;
    }));
    const masVendido = Object.entries(conteoItems).sort((a, b) => b[1] - a[1])[0];
    if (masVendido) {
        return `${periodoLabel === 'hoy' ? 'Hoy' : 'En este período'} el más pedido fue <strong>${masVendido[0]}</strong> (${masVendido[1]} ${masVendido[1] === 1 ? 'vez' : 'veces'}). Ticket promedio: <strong>$${ticket.toLocaleString('es-AR')}</strong>.`;
    }
    return `Llevan <strong>${pedidos.length} mesas atendidas</strong> ${periodoLabel} con un ticket promedio de <strong>$${ticket.toLocaleString('es-AR')}</strong>.`;
}

function renderizarVentasRecientes(pedidos) {
    const contenedor = document.getElementById('dash-ventas-recientes');
    if (!contenedor) return;
    if (pedidos.length === 0) {
        contenedor.innerHTML = '<p class="text-slate-400 text-center italic text-sm py-8">Sin ventas en este período</p>';
        return;
    }
    contenedor.innerHTML = pedidos.map(p => {
        const fecha = p.timestamp?.toDate ? p.timestamp.toDate() : new Date();
        const hora  = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        const cant  = (p.items || []).length;
        return `
            <div class="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
                <div>
                    <p class="font-bold text-sm">Mesa ${p.numeroMesa || '?'} · ${p.sector || 'Salón'}</p>
                    <p class="text-[11px] text-slate-400 font-bold uppercase">${cant} ${cant === 1 ? 'ítem' : 'ítems'} · ${hora}</p>
                </div>
                <span class="font-black text-slate-700">$${(p.total || 0).toLocaleString('es-AR')}</span>
            </div>
        `;
    }).join('');
}

async function renderizarGraficoSemanal() {
    if (!localId) return;
    const inicioSemana = new Date();
    inicioSemana.setDate(inicioSemana.getDate() - 6);
    inicioSemana.setHours(0, 0, 0, 0);

    const q = query(
        collection(db, 'locales', localId, 'pedidos'),
        where('timestamp', '>=', Timestamp.fromDate(inicioSemana)),
        orderBy('timestamp', 'asc')
    );
    const snap = await getDocs(q);

    const dias = {};
    for (let i = 0; i < 7; i++) {
        const d = new Date(inicioSemana);
        d.setDate(inicioSemana.getDate() + i);
        dias[fechaKey(d)] = 0;
    }
    snap.docs.forEach(doc => {
        const data = doc.data();
        if (!data.timestamp) return;
        const k = fechaKey(data.timestamp.toDate());
        if (dias[k] !== undefined) dias[k] += (data.total || 0);
    });

    const valores  = Object.values(dias);
    const keys     = Object.keys(dias);
    const maximo   = Math.max(...valores, 1);
    const hoyKey   = fechaKey(new Date());
    const nombres  = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    const contenedor = document.getElementById('dash-grafico');
    if (!contenedor) return;
    contenedor.innerHTML = keys.map((key, i) => {
        const pct      = Math.round((valores[i] / maximo) * 100);
        const fecha    = new Date(key + 'T12:00:00');
        const nombreDia = nombres[fecha.getDay()];
        const esHoy    = key === hoyKey;
        const label    = valores[i] > 0 ? `$${Math.round(valores[i]/1000)}k` : '';
        return `
            <div class="flex flex-col items-center gap-1 flex-1 h-full justify-end">
                <span class="text-[9px] font-bold text-slate-400 h-4">${label}</span>
                <div class="w-full rounded-t-xl ${esHoy ? 'bg-blue-600' : 'bg-blue-200'}" style="height:${Math.max(pct, 3)}%"></div>
                <span class="text-[10px] font-bold ${esHoy ? 'text-blue-600' : 'text-slate-400'}">${nombreDia}</span>
            </div>
        `;
    }).join('');
}

// ==========================================
// 4. EXPORTACIÓN GLOBAL
// ==========================================
window.cambiarPestaña = cambiarPestaña;
window.cambiarPeriodoDashboard = cambiarPeriodoDashboard;
window.agregarNuevaMesa = agregarNuevaMesa;
window.cambiarSector = cambiarSector;
window.agregarNuevoSector = agregarNuevoSector;
window.seleccionarCategoriaPOS = seleccionarCategoriaPOS;
window.seleccionarCategoriaCarta = seleccionarCategoriaCarta;
window.abrirModalProducto = abrirModalProducto;
window.cerrarModalProducto = cerrarModalProducto;
window.guardarProductoModal = guardarProductoModal;
window.confirmarEliminarProducto = confirmarEliminarProducto;
window.agregarVarianteModal = agregarVarianteModal;
window.eliminarVarianteModal = eliminarVarianteModal;
window.abrirModalCategoria = abrirModalCategoria;
window.cerrarModalCategoria = cerrarModalCategoria;
window.guardarCategoriaModal = guardarCategoriaModal;
window.agregarItem = agregarItem;
window.eliminarItem = eliminarItem;
window.editarProducto = editarProducto;
window.cerrarModal = cerrarModal;
window.guardarCambiosModal = guardarCambiosModal;
window.toggleModoEdicion = toggleModoEdicion;
window.abrirPOS = abrirPOS;
window.cerrarPOS = cerrarPOS;
window.confirmarYCobrar = confirmarYCobrar;
window.cerrarSesion = () => signOut(auth).then(() => window.location.href = "login.html");
window.cargarArqueo = cargarArqueo;
window.calcularArqueo = calcularArqueo;
window.guardarArqueo = guardarArqueo;
window.abrirModalInsumo = abrirModalInsumo;
window.cerrarModalInsumo = cerrarModalInsumo;
window.guardarInsumoModal = guardarInsumoModal;
window.confirmarEliminarInsumo = confirmarEliminarInsumo;
window.abrirModalAjuste = abrirModalAjuste;
window.cerrarModalAjuste = cerrarModalAjuste;
window.cambiarCantidadAjuste = cambiarCantidadAjuste;
window.guardarAjusteModal = guardarAjusteModal;
window.cerrarModalCobro = cerrarModalCobro;
window.seleccionarMetodoPago = seleccionarMetodoPago;
window.cambiarTipoDescuento = cambiarTipoDescuento;
window.actualizarResumenCobro = actualizarResumenCobro;
window.confirmarCobroModal = confirmarCobroModal;