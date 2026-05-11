import { auth, db } from './firebase-config.js'; // Agregado el .js obligatorio
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// PROTECCIÓN DE RUTA: Si no hay usuario, al login
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "login.html";
    } else {
        console.log("GastroAI listo para:", user.email);
        lucide.createIcons();
    }
});

// EXPORTAR FUNCIONES AL WINDOW
// Como ahora es un módulo, el HTML no "ve" las funciones a menos que las hagamos globales
window.cambiarPestaña = cambiarPestaña;
window.agregarItem = agregarItem;
window.eliminarItem = eliminarItem;
window.editarProducto = editarProducto;
window.cerrarModal = cerrarModal;
window.guardarCambiosModal = guardarCambiosModal;
window.toggleModoEdicion = toggleModoEdicion;
window.agregarNuevaMesa = agregarNuevaMesa;
window.abrirPOS = abrirPOS;
window.cerrarPOS = cerrarPOS;

// ... (El resto de tu código de productos y lógica de mesas sigue igual abajo)

// ==========================================
// 1. BASE DE DATOS LOCAL (PRODUCTOS)
// ==========================================
let productos = [
    {
        id: 1,
        categoria: "cafe",
        nombre: "Flat White",
        icono: "☕",
        variantes: [
            { nombre: "Estándar", precio: 4500 },
            { nombre: "Avena", precio: 5200 }
        ]
    },
    {
        id: 2,
        categoria: "cafe",
        nombre: "Latte",
        icono: "🥛",
        variantes: [
            { nombre: "XL", precio: 4800 },
            { nombre: "Vainilla", precio: 5300 }
        ]
    },
    {
        id: 3,
        categoria: "cafe",
        nombre: "Espresso",
        icono: "⚡",
        variantes: [
            { nombre: "Simple", precio: 3500 },
            { nombre: "Doble", precio: 4200 }
        ]
    },
    {
        id: 4,
        categoria: "cafe",
        nombre: "Capuccino",
        icono: "🍫",
        variantes: [
            { nombre: "Italiano", precio: 4700 },
            { nombre: "Cacao", precio: 4900 }
        ]
    },
    {
        id: 5,
        categoria: "cafe",
        nombre: "Filtrado",
        icono: "⚖️",
        variantes: [
            { nombre: "V60", precio: 5500 },
            { nombre: "Chemex", precio: 9500 }
        ]
    }
];

// ==========================================
// 2. ESTADO GLOBAL
// ==========================================
let modoEdicion = false;
let mesaSeleccionada = null;
let offset = { x: 0, y: 0 };
let consumoActual = [];

// ==========================================
// 3. NAVEGACIÓN Y PESTAÑAS
// ==========================================
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

// ==========================================
// 4. MAPA DE SALÓN (MESAS)
// ==========================================
function toggleModoEdicion() {
    modoEdicion = !modoEdicion;
    const btn = document.getElementById('btn-editar');
    const area = document.getElementById('area-salon');

    if (modoEdicion) {
        btn.innerHTML = '<i data-lucide="save" class="w-4"></i> Guardar Plano';
        btn.classList.replace('bg-slate-900', 'bg-green-600');
        area.classList.add('bg-slate-100', 'border-blue-300');
    } else {
        btn.innerHTML = '<i data-lucide="move" class="w-4"></i> Editar Plano';
        btn.classList.replace('bg-green-600', 'bg-slate-900');
        area.classList.remove('bg-slate-100', 'border-blue-300');
    }
    lucide.createIcons();
}

function agregarNuevaMesa() {
    const numero = prompt("¿Número de mesa?");
    if (!numero) return;

    const area = document.getElementById('area-salon');
    const nuevaMesa = document.createElement('div');
    nuevaMesa.id = `mesa-${numero}`;
    nuevaMesa.className = "mesa absolute p-6 rounded-3xl border-2 border-slate-200 bg-white shadow-sm hover:shadow-md transition-all cursor-pointer";
    nuevaMesa.style.top = "200px";
    nuevaMesa.style.left = "200px";
    nuevaMesa.style.width = "140px";

    nuevaMesa.innerHTML = `
        <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">${numero}</div>
        <div class="text-2xl font-black text-slate-800 my-2 italic text-center">Mesa</div>
        <div class="text-[10px] font-bold text-blue-600 mt-2 tracking-widest uppercase text-center">Disponible</div>
    `;

    area.appendChild(nuevaMesa);
    if (!modoEdicion) toggleModoEdicion();
    lucide.createIcons();
}

// Draggable Logic
document.addEventListener('mousedown', (e) => {
    if (!modoEdicion) return;
    const mesa = e.target.closest('.mesa');
    if (mesa) {
        mesaSeleccionada = mesa;
        const rect = mesa.getBoundingClientRect();
        offset.x = e.clientX - rect.left;
        offset.y = e.clientY - rect.top;
        mesa.style.transition = 'none';
        mesa.style.zIndex = 1000;
    }
});

document.addEventListener('mousemove', (e) => {
    if (!modoEdicion || !mesaSeleccionada) return;
    const area = document.getElementById('area-salon').getBoundingClientRect();
    let x = e.clientX - area.left - offset.x;
    let y = e.clientY - area.top - offset.y;
    x = Math.max(0, Math.min(x, area.width - mesaSeleccionada.offsetWidth));
    y = Math.max(0, Math.min(y, area.height - mesaSeleccionada.offsetHeight));
    mesaSeleccionada.style.left = `${x}px`;
    mesaSeleccionada.style.top = `${y}px`;
});

document.addEventListener('mouseup', () => {
    if (mesaSeleccionada) {
        mesaSeleccionada.style.transition = 'all 0.2s';
        mesaSeleccionada.style.zIndex = '';
        mesaSeleccionada = null;
    }
});

// ==========================================
// 5. LÓGICA DEL POS (PEDIDOS)
// ==========================================
document.addEventListener('click', (e) => {
    const mesa = e.target.closest('.mesa');
    if (mesa && !modoEdicion) {
        const numMesa = mesa.id.replace('mesa-', '');
        abrirPOS(numMesa);
    }
});

function abrirPOS(numeroMesa) {
    document.getElementById('pos-mesa-titulo').innerText = `Mesa ${numeroMesa}`;
    document.getElementById('pos-screen').classList.remove('hidden');
    renderizarProductosPOS();
    renderizarPedido();
}

function cerrarPOS() {
    document.getElementById('pos-screen').classList.add('hidden');
}

function renderizarProductosPOS() {
    const contenedor = document.querySelector('#pos-screen main div');
    contenedor.innerHTML = "";

    productos.forEach(prod => {
        const card = document.createElement('div');
        card.className = "bg-white p-4 rounded-[1.5rem] shadow-sm border border-slate-200 flex flex-col items-center text-center hover:shadow-md transition";
        
        // Mapeamos las variantes y agregamos un botón de edición minúsculo al lado de cada una
        const contenidoVariantes = prod.variantes.map((v, index) => `
            <div class="flex items-center gap-1 w-full">
                <button onclick="agregarItem('${prod.nombre} ${v.nombre}', ${v.precio})" 
                        class="flex-1 bg-slate-50 py-2 rounded-xl text-[10px] font-bold hover:bg-blue-600 hover:text-white transition italic">
                    ${v.nombre} ($${(v.precio/1000).toFixed(1)}k)
                </button>
                <button onclick="editarProducto(${prod.id}, ${index})" class="p-2 text-slate-300 hover:text-blue-500 transition">
                    <i data-lucide="edit-3" class="w-3 h-3"></i>
                </button>
            </div>
        `).join('');

        card.innerHTML = `
            <span class="text-xl">${prod.icono}</span>
            <h4 class="font-bold text-slate-800 text-sm mt-1 uppercase">${prod.nombre}</h4>
            <div class="mt-3 w-full space-y-2">
                ${contenidoVariantes}
            </div>
        `;
        contenedor.appendChild(card);
    });
    lucide.createIcons();
}

let productoSiendoEditado = null;
let varianteIndexSiendoEditada = null;

function editarProducto(id, indexVariante) {
    const producto = productos.find(p => p.id === id);
    if (!producto) return;

    // Guardamos qué producto y qué variante específica estamos tocando
    productoSiendoEditado = producto;
    varianteIndexSiendoEditada = indexVariante; 

    const variante = producto.variantes[indexVariante];
    
    // Cargamos los datos en el modal (ahora sí dinámicos)
    document.getElementById('edit-nombre').value = variante.nombre;
    document.getElementById('edit-precio').value = variante.precio;

    // Abrir modal
    const modal = document.getElementById('modal-editar');
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    document.getElementById('btn-guardar-cambios').onclick = guardarCambiosModal;
    lucide.createIcons();
}

function cerrarModal() {
    const modal = document.getElementById('modal-editar');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
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
        
        // Un pequeño feedback visual
        console.log("Variante actualizada con éxito");
    }
}

function agregarItem(nombre, precio) {
    consumoActual.push({ nombre, precio });
    renderizarPedido();
}

function renderizarPedido() {
    const lista = document.getElementById('pos-lista-items');
    const totalFinal = document.getElementById('pos-total-final');
    const totalSuperior = document.getElementById('pos-total-superior');
    
    if (consumoActual.length === 0) {
        lista.innerHTML = '<p class="text-slate-400 text-center italic text-sm mt-10">No hay productos cargados</p>';
        totalFinal.innerText = "0";
        totalSuperior.innerText = "0";
        return;
    }

    let total = 0;
    lista.innerHTML = consumoActual.map((item, index) => {
        total += item.precio;
        return `
            <div class="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100 animate-fade-in text-center">
                <div class="flex-1">
                    <p class="font-bold text-slate-800 text-sm">${item.nombre}</p>
                    <p class="text-[10px] text-slate-400 font-bold uppercase">$${item.precio.toLocaleString('es-AR')}</p>
                </div>
                <button onclick="eliminarItem(${index})" class="text-red-400 hover:text-red-600 p-1">
                    <i data-lucide="trash-2" class="w-4"></i>
                </button>
            </div>
        `;
    }).join('');
    
    totalFinal.innerText = total.toLocaleString('es-AR');
    totalSuperior.innerText = total.toLocaleString('es-AR');
    lucide.createIcons();
}

function eliminarItem(index) {
    consumoActual.splice(index, 1);
    renderizarPedido();
}

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
});