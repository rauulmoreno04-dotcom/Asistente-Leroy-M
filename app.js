// ==========================================
// CONFIGURACIÓN GLOBAL Y MAPA (ALTA RESOLUCIÓN)
// ==========================================
const ENTRADA = { x: 760, y: 730 }; 
const G = 10, COLS = 120, ROWS = 80; 
let grid = [];
let inventario = [];

let rutaPendiente = null;
let itemPendiente = null;

const btnVoz = document.getElementById('btn-voz');
const modalOverlay = document.getElementById('modal-overlay');
const btnCerrarModal = document.getElementById('btn-cerrar-modal');

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    try {
        const respuesta = await fetch('inventario.json');
        inventario = await respuesta.json();
    } catch (error) {
        console.error("Error cargando inventario.", error);
    }
    initGrid(); 
});

// Listar voces disponibles en la consola por si quieres cambiar el 'tipo' después
window.speechSynthesis.onvoiceschanged = () => {
    const voces = window.speechSynthesis.getVoices();
    console.log("--- LISTA DE VOCES DISPONIBLES ---");
    voces.forEach((v, i) => {
        if(v.lang.includes('es')) console.log(`${i}: ${v.name} (${v.lang})`);
    });
};

// ==========================================
// MOTOR DE RUTAS (A* CON PRECISIÓN DE PASILLO)
// ==========================================
function initGrid() {
    for(let y=0; y<ROWS; y++) { grid[y] = []; for(let x=0; x<COLS; x++) grid[y][x] = true; }
    document.querySelectorAll('#capa-obstaculos rect').forEach(o => {
        let ox = Math.floor(o.getAttribute('x')/G), oy = Math.floor(o.getAttribute('y')/G);
        let ow = Math.ceil(o.getAttribute('width')/G), oh = Math.ceil(o.getAttribute('height')/G);
        for(let y=oy; y<oy+oh; y++) for(let x=ox; x<ox+ow; x++) if(y>=0 && y<ROWS && x>=0 && x<COLS) grid[y][x] = false;
    });
}

function findPath(sx, sy, ex, ey) {
    let s = {x: Math.floor(sx/G), y: Math.floor(sy/G)};
    let targetX = Math.floor(ex/G), targetY = Math.floor(ey/G);
    let e = findNearest(targetX, targetY);
    
    let openSet = [s], cameFrom = {}, gScore = {[`${s.x},${s.y}`]: 0};
    let heuristic = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    let fScore = {[`${s.x},${s.y}`]: heuristic(s, e)};
    
    while(openSet.length > 0) {
        openSet.sort((a, b) => fScore[`${a.x},${a.y}`] - fScore[`${b.x},${b.y}`]);
        let current = openSet.shift();
        if(current.x === e.x && current.y === e.y) {
            let path = [], currStr = `${current.x},${current.y}`;
            while(cameFrom[currStr]) {
                let coords = currStr.split(',').map(Number);
                path.push([coords[0]*G + G/2, coords[1]*G + G/2]);
                currStr = cameFrom[currStr];
            }
            path.push([s.x*G + G/2, s.y*G + G/2]);
            return path.reverse();
        }
        let neighbors = [{x: 0, y: -1}, {x: 0, y: 1}, {x: -1, y: 0}, {x: 1, y: 0}];
        for(let n of neighbors) {
            let neighbor = {x: current.x + n.x, y: current.y + n.y}, nStr = `${neighbor.x},${neighbor.y}`;
            if(neighbor.y >= 0 && neighbor.y < ROWS && neighbor.x >= 0 && neighbor.x < COLS && grid[neighbor.y][neighbor.x]) {
                let tentative_gScore = gScore[`${current.x},${current.y}`] + 1;
                if(gScore[nStr] === undefined || tentative_gScore < gScore[nStr]) {
                    cameFrom[nStr] = `${current.x},${current.y}`;
                    gScore[nStr] = tentative_gScore;
                    fScore[nStr] = tentative_gScore + heuristic(neighbor, e);
                    if(!openSet.some(node => node.x === neighbor.x && node.y === neighbor.y)) openSet.push(neighbor);
                }
            }
        }
    }
    return null;
}

function findNearest(gx, gy) {
    for(let r=1; r<50; r++) {
        let checks = [{x: gx, y: gy+r}, {x: gx, y: gy-r}, {x: gx+r, y: gy}, {x: gx-r, y: gy}];
        for(let p of checks) if(p.y>=0 && p.y<ROWS && p.x>=0 && p.x<COLS && grid[p.y][p.x]) return p;
    }
    return {x: gx, y: gy};
}

// ==========================================
// INTERFAZ DE VOZ Y NLP (IA)
// ==========================================
const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
const rec = Rec ? new Rec() : null;
const synth = window.speechSynthesis;

if(rec) {
    rec.lang = 'es-ES'; 
    rec.onresult = e => procesarIA(e.results[0][0].transcript.toLowerCase());
    rec.onstart = () => { btnVoz.className = 'escuchando'; document.getElementById('txt-micro').innerText = 'ESCUCHANDO...'; };
    rec.onend = () => { btnVoz.className = ''; document.getElementById('txt-micro').innerText = 'PULSAR PARA HABLAR'; };
}

btnVoz.addEventListener('click', () => { if(rec) { synth.cancel(); rec.start(); } });

function procesarIA(txt) {
    botMsg(`Has dicho: "${txt}"`);
    ocultarRutaDOM();
    const stopWords = ["hola", "donde", "hay", "esta", "estan", "puedo", "encontrar", "busco", "necesito", "quiero", "un", "una", "el", "la","necesito", "dame", "pillar", "tomar", "coger", "brindar", "tomar" ];
    let textoLimpio = txt.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    
    // ==========================================
    // TRATAMIENTO ESPECIAL PARA ASEOS/BAÑOS
    // ==========================================
    if (textoLimpio.includes("aseo") || textoLimpio.includes("bano") || textoLimpio.includes("servicio")) {
        let mejorProducto = inventario.find(item => item.zona === "Aseos");
        if (mejorProducto) {
            let ruta = findPath(ENTRADA.x, ENTRADA.y, mejorProducto.x, mejorProducto.y);
            if (ruta) {
                let m = "Están a la derecha de la entrada a tienda.";
                botMsg(m); hablar(m);
                dibujarRutaDOM(ruta); // Dibuja la ruta directamente, sin PopUp
                return; // Salimos de la función aquí para no hacer nada más
            }
        }
    }
    // ==========================================

    let palabrasUsuario = textoLimpio.split(" ").filter(p => !stopWords.includes(p) && p.length > 2);

    let mejorProducto = null, mejorPuntuacion = 0;
    inventario.forEach(item => {
        let puntuacion = 0;
        let palabrasItem = item.nombre.toLowerCase().split(" ").concat(item.tags);
        palabrasUsuario.forEach(p => { if(palabrasItem.some(it => it.includes(p))) puntuacion++; });
        if(puntuacion > mejorPuntuacion) { mejorPuntuacion = puntuacion; mejorProducto = item; }
    });

    if(mejorProducto) {
        let ruta = findPath(ENTRADA.x, ENTRADA.y, mejorProducto.x, mejorProducto.y);
        if(ruta) {
            let altTxt = mejorProducto.altura === 1 ? 'suelo' : mejorProducto.altura === 2 ? 'media' : 'alta';
            let m = `He encontrado ${mejorProducto.nombre} en ${mejorProducto.zona}, pasillo ${mejorProducto.pasillo}, estantería ${mejorProducto.estanteria}, a altura ${altTxt}.`;
            botMsg(m); hablar(m);
            itemPendiente = mejorProducto; rutaPendiente = ruta;
            mostrarPopUp(mejorProducto, ruta); // Solo los productos abren el modal
        }
    } else {
        let m = "Lo siento, no encuentro ese producto.";
        botMsg(m); hablar(m);
    }
}

// ==========================================
// MOTOR DE VOZ: 10 TIPOS DE ASISTENTES
// ==========================================
function hablar(t) {
    const u = new SpeechSynthesisUtterance(t);
    const voces = synth.getVoices();
    
    // Cambia este número para probar los 10 estilos
    let tipo = 1; 

    switch(tipo) {
        case 1: // El Profesional (Google Español - Voz de Hombre seria)
            u.voice = voces.find(v => v.name.includes('Google') && v.lang.includes('es'));
            u.pitch = 0.9; u.rate = 1.0; break;
        case 2: // El Enérgico
            u.pitch = 1.2; u.rate = 1.3; break;
        case 3: // El Sereno (Grave y lento)
            u.pitch = 0.7; u.rate = 0.8; break;
        case 4: // El Narrador
            u.pitch = 1.0; u.rate = 0.9; break;
        case 5: // El Tecnológico
            u.pitch = 1.5; u.rate = 1.1; break;
        case 6: // El Ejecutivo
            u.pitch = 0.8; u.rate = 1.2; break;
        case 7: // El Joven
            u.pitch = 1.1; u.rate = 1.1; break;
        case 8: // El Clásico
            u.voice = voces.find(v => v.name.includes('Microsoft') && v.name.includes('Pablo'));
            u.pitch = 1.0; u.rate = 1.0; break;
        case 9: // El Amigable
            u.pitch = 1.0; u.rate = 1.05; break;
        case 10: // El Maestro
            u.pitch = 0.95; u.rate = 0.85; break;
    }

    u.lang = 'es-ES';
    synth.speak(u);
}

// ==========================================
// INTERFAZ Y MODAL
// ==========================================
function mostrarPopUp(item, ruta) {
    document.getElementById('modal-producto-nombre').innerText = item.nombre;
    const lista = document.getElementById('modal-lista-relacionados');
    lista.innerHTML = ""; 
    item.related.forEach(prod => {
        const li = document.createElement("li"); li.innerText = "➕ " + prod;
        lista.appendChild(li);
    });
    modalOverlay.classList.remove('oculto');
}

btnCerrarModal.addEventListener('click', () => {
    modalOverlay.classList.add('oculto');
    if(rutaPendiente) dibujarRutaDOM(rutaPendiente);
});

function dibujarRutaDOM(p) {
    const r = document.getElementById('ruta-inteligente');
    const d = document.getElementById('destino-punto');
    r.setAttribute('points', p.map(pt => pt.join(',')).join(' '));
    r.style.display = 'block';
    d.setAttribute('cx', p[p.length-1][0]); d.setAttribute('cy', p[p.length-1][1]);
    d.style.display = 'block';
}

function ocultarRutaDOM() { 
    document.getElementById('ruta-inteligente').style.display='none'; 
    document.getElementById('destino-punto').style.display='none'; 
}

function botMsg(t) { document.getElementById('chat').innerHTML = `<div class="msg-bot">${t}</div>` + document.getElementById('chat').innerHTML; }
