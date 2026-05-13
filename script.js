import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ==========================================
// 1. SEGURIDAD Y ROLES (DINÁMICO DESDE FIRESTORE)
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const userDoc = await getDoc(doc(db, "usuarios", user.uid));

            if (userDoc.exists()) {
                const datos = userDoc.data();
                const esAdmin = datos.rol === 'admin';

                // Guardar localId globalmente — lo usan guardarPlano y cargarPlano
                localId = datos.localId || user.uid;

                const btnEditar = document.getElementById('btn-editar');
                const btnDash   = document.getElementById('btn-dashboard');
                if (btnEditar) btnEditar.style.display = esAdmin ? 'flex' : 'none';
                if (btnDash)   btnDash.style.display   = esAdmin ? 'block' : 'none';

                if (!esAdmin) {
                    const style = document.createElement('style');
                    style.innerHTML = `.btn-editar-interno { display: none !important; }`;
                    document.head.appendChild(style);
                }
            } else {
                // Doc no existe → usuario sin configurar, tratarlo como staff
                localId = user.uid;
                const btnEditar = document.getElementById('btn-editar');
                if (btnEditar) btnEditar.style.display = 'none';
            }

            // Cargar el plano guardado del local
            await cargarPlano();

        } catch (error) {
            console.error("Error al inicializar sesión:", error);
        }

        lucide.createIcons();
    } else {
        window.location.href = "login.html";
    }
});

// ==========================================
// 2. BASE DE DATOS LOCAL (PRODUCTOS)
// ==========================================
let productos = [
    { id: 1, categoria: "cafe", nombre: "Flat White", icono: "☕", variantes: [{ nombre: "Estándar", precio: 4500 }, { nombre: "Avena", precio: 5200 }] },
    { id: 2, categoria: "cafe", nombre: "Latte", icono: "🥛", variantes: [{ nombre: "XL", precio: 4800 }, { nombre: "Vainilla", precio: 5300 }] },
    { id: 3, categoria: "cafe", nombre: "Espresso", icono: "⚡", variantes: [{ nombre: "Simple", precio: 3500 }, { nombre: "Doble", precio: 4200 }] },
    { id: 4, categoria: "cafe", nombre: "Capuccino", icono: "🍫", variantes: [{ nombre: "Italiano", precio: 4700 }, { nombre: "Cacao", precio: 4900 }] },
    { id: 5, categoria: "cafe", nombre: "Filtrado", icono: "⚖️", variantes: [{ nombre: "V60", precio: 5500 }, { nombre: "Chemex", precio: 9500 }] }
];

// ==========================================
// 3. ESTADO GLOBAL Y LÓGICA
// ==========================================
let localId = null;
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

async function confirmarYCobrar() {
    const items = carritos[mesaActivaEnPOS] || [];
    if (items.length === 0) {
        mostrarToast('No hay productos en el pedido', true);
        return;
    }

    const mesaEl    = document.getElementById(mesaActivaEnPOS);
    const sectorId  = mesaEl?.closest('.sector-canvas')?.dataset.sector;
    const sector    = sectores.find(s => s.id === sectorId)?.nombre || 'Salón';
    const total     = items.reduce((sum, item) => sum + item.precio, 0);
    const numero    = mesaActivaEnPOS.replace('mesa-', '');

    const btnCobrar = document.getElementById('btn-cobrar');
    btnCobrar.disabled  = true;
    btnCobrar.innerText = 'Guardando...';

    try {
        await addDoc(collection(db, 'locales', localId, 'pedidos'), {
            mesaId:      mesaActivaEnPOS,
            numeroMesa:  parseInt(numero),
            sector,
            items,
            total,
            timestamp:   serverTimestamp(),
            estado:      'cerrado'
        });

        carritos[mesaActivaEnPOS] = [];
        actualizarTotalMesa(mesaActivaEnPOS);
        cerrarPOS();
        mostrarToast(`Mesa ${numero} cobrada ✓  $${total.toLocaleString('es-AR')}`);
    } catch (error) {
        console.error('Error al guardar pedido:', error);
        mostrarToast('Error al guardar el pedido', true);
    } finally {
        btnCobrar.disabled  = false;
        btnCobrar.innerText = 'Confirmar y Cobrar';
    }
}

function renderizarProductosPOS() {
    const contenedor = document.querySelector('#pos-screen main div');
    contenedor.innerHTML = "";
    productos.forEach(prod => {
        const card = document.createElement('div');
        card.className = "bg-white p-4 rounded-[1.5rem] shadow-sm border border-slate-200 flex flex-col items-center text-center hover:shadow-md transition";
        const contenidoVariantes = prod.variantes.map((v, index) => `
            <div class="flex items-center gap-1 w-full">
                <button onclick="agregarItem('${prod.nombre} ${v.nombre}', ${v.precio})" 
                        class="flex-1 bg-slate-50 py-2 rounded-xl text-[10px] font-bold hover:bg-blue-600 hover:text-white transition italic">
                    ${v.nombre} ($${(v.precio/1000).toFixed(1)}k)
                </button>
                <button onclick="editarProducto(${prod.id}, ${index})" class="btn-editar-interno p-2 text-slate-300 hover:text-blue-500 transition">
                    <i data-lucide="edit-3" class="w-3 h-3"></i>
                </button>
            </div>
        `).join('');
        card.innerHTML = `<span class="text-xl">${prod.icono}</span><h4 class="font-bold text-slate-800 text-sm mt-1 uppercase">${prod.nombre}</h4><div class="mt-3 w-full space-y-2">${contenidoVariantes}</div>`;
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

function guardarCambiosModal() {
    if (!productoSiendoEditado) return;
    const nuevoNombre = document.getElementById('edit-nombre').value;
    const nuevoPrecio = document.getElementById('edit-precio').value;
    if (nuevoNombre && nuevoPrecio) {
        productoSiendoEditado.variantes[varianteIndexSiendoEditada].nombre = nuevoNombre;
        productoSiendoEditado.variantes[varianteIndexSiendoEditada].precio = parseInt(nuevoPrecio);
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
// 4. EXPORTACIÓN GLOBAL
// ==========================================
window.cambiarPestaña = cambiarPestaña;
window.agregarNuevaMesa = agregarNuevaMesa;
window.cambiarSector = cambiarSector;
window.agregarNuevoSector = agregarNuevoSector;
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