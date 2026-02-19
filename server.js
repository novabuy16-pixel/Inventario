// ============================================================
//  server.js  —  Inventario Pactra
//  Base de datos SQLite (sql.js puro JS) + API REST
// ============================================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const puppeteer = require('puppeteer-core');

// Busca Chrome o Edge instalado en el sistema
const CHROME_PATHS = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const CHROME_EXE = CHROME_PATHS.find(p => fs.existsSync(p)) || null;


const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'inventario.db');

// ── Iniciar sql.js (async) ───────────────────────────────────
let db; // será el objeto Database de sql.js

async function initDB() {
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();

    // Cargar base de datos existente o crear nueva
    if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
        console.log('  📂 Base de datos cargada:', DB_PATH);
    } else {
        db = new SQL.Database();
        console.log('  🆕 Nueva base de datos creada:', DB_PATH);
    }

    // Crear tabla si no existe
    db.run(`
        CREATE TABLE IF NOT EXISTS movimientos (
            id_movimiento   INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo_movimiento TEXT    DEFAULT '',
            fecha           TEXT    DEFAULT '',
            cliente         TEXT    DEFAULT '',
            contenedor      TEXT    DEFAULT '',
            factura         TEXT    DEFAULT '',
            modelo          TEXT    DEFAULT '',
            no_lote         TEXT    DEFAULT '',
            pallets         INTEGER DEFAULT 0,
            piezas          INTEGER DEFAULT 0,
            piezas_danadas  INTEGER DEFAULT 0,
            danado          INTEGER DEFAULT 0
        )
    `);
    saveDB(); // guardar estructura inicial
}

// ── Guardar db al disco ──────────────────────────────────────
function saveDB() {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// ── Helper: query que devuelve array de objetos ──────────────
function queryAll(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
}

function queryRun(sql, params = []) {
    db.run(sql, params);
    return db.exec('SELECT last_insert_rowid() as id')[0]?.values[0][0];
}

// ── Convertir fila a objeto JS ───────────────────────────────
function toJS(row) {
    return {
        id_movimiento: row.id_movimiento,
        tipo_movimiento: row.tipo_movimiento || '',
        fecha: row.fecha || '',
        cliente: row.cliente || '',
        contenedor: row.contenedor || '',
        factura: row.factura || '',
        modelo: row.modelo || '',
        no_lote: row.no_lote || '',
        pallets: row.pallets || 0,
        piezas: row.piezas || 0,
        piezas_danadas: row.piezas_danadas || 0,
        dañado: row.danado === 1,
    };
}

// ── Middlewares ──────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'inventario')));

// ── API REST ─────────────────────────────────────────────────

// GET /api/movimientos
app.get('/api/movimientos', (req, res) => {
    try {
        const rows = queryAll('SELECT * FROM movimientos ORDER BY id_movimiento ASC');
        res.json(rows.map(toJS));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/movimientos/bulk  — importación masiva (va ANTES de /:id)
app.post('/api/movimientos/bulk', (req, res) => {
    try {
        const { rows = [], replace = false } = req.body;
        if (replace) db.run('DELETE FROM movimientos');

        const sql = `INSERT INTO movimientos
            (tipo_movimiento,fecha,cliente,contenedor,factura,modelo,no_lote,pallets,piezas,piezas_danadas,danado)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`;

        for (const r of rows) {
            const pzDan = parseInt(r.piezas_danadas) || 0;
            db.run(sql, [
                r.tipo_movimiento || '', r.fecha || '', r.cliente || '',
                r.contenedor || '', r.factura || '', r.modelo || '', r.no_lote || '',
                parseInt(r.pallets) || 0, parseInt(r.piezas) || 0, pzDan,
                (pzDan > 0 || r.dañado) ? 1 : 0,
            ]);
        }
        saveDB();
        res.json({ ok: true, count: rows.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/movimientos — crear uno
app.post('/api/movimientos', (req, res) => {
    try {
        const r = req.body;
        const pzDan = parseInt(r.piezas_danadas) || 0;
        const sql = `INSERT INTO movimientos
            (tipo_movimiento,fecha,cliente,contenedor,factura,modelo,no_lote,pallets,piezas,piezas_danadas,danado)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`;
        const lastId = queryRun(sql, [
            r.tipo_movimiento || '', r.fecha || '', r.cliente || '',
            r.contenedor || '', r.factura || '', r.modelo || '', r.no_lote || '',
            parseInt(r.pallets) || 0, parseInt(r.piezas) || 0, pzDan,
            (pzDan > 0 || r.dañado) ? 1 : 0,
        ]);
        saveDB();
        const newRow = queryAll('SELECT * FROM movimientos WHERE id_movimiento=?', [lastId])[0];
        res.json(toJS(newRow));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/movimientos/:id
app.put('/api/movimientos/:id', (req, res) => {
    try {
        const r = req.body;
        const pzDan = parseInt(r.piezas_danadas) || 0;
        db.run(`UPDATE movimientos SET
            tipo_movimiento=?,fecha=?,cliente=?,contenedor=?,factura=?,
            modelo=?,no_lote=?,pallets=?,piezas=?,piezas_danadas=?,danado=?
            WHERE id_movimiento=?`, [
            r.tipo_movimiento || '', r.fecha || '', r.cliente || '',
            r.contenedor || '', r.factura || '', r.modelo || '', r.no_lote || '',
            parseInt(r.pallets) || 0, parseInt(r.piezas) || 0, pzDan,
            (pzDan > 0 || r.dañado) ? 1 : 0,
            parseInt(req.params.id),
        ]);
        saveDB();
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/movimientos/:id
app.delete('/api/movimientos/:id', (req, res) => {
    try {
        db.run('DELETE FROM movimientos WHERE id_movimiento=?', [parseInt(req.params.id)]);
        saveDB();
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/modelos — modelos únicos del inventario
app.get('/api/modelos', (req, res) => {
    try {
        const rows = queryAll("SELECT DISTINCT modelo FROM movimientos WHERE modelo != '' ORDER BY modelo ASC");
        res.json(rows.map(r => r.modelo));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/contenedores?modelo=xxx  — versión con query param (maneja chars especiales)
app.get('/api/contenedores', (req, res) => {
    try {
        const modelo = req.query.modelo || '';
        if (!modelo) return res.json([]);
        const rows = queryAll(
            "SELECT DISTINCT contenedor FROM movimientos WHERE modelo=? AND contenedor != '' ORDER BY contenedor ASC",
            [modelo]
        );
        res.json(rows.map(r => r.contenedor));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/contenedores/:modelo — versión con path param (compatibilidad)
app.get('/api/contenedores/:modelo', (req, res) => {
    try {
        const modelo = decodeURIComponent(req.params.modelo);
        const rows = queryAll(
            "SELECT DISTINCT contenedor FROM movimientos WHERE modelo=? AND contenedor != '' ORDER BY contenedor ASC",
            [modelo]
        );
        res.json(rows.map(r => r.contenedor));
    } catch (e) { res.status(500).json({ error: e.message }); }
});


// POST /api/packing-list — rellena la plantilla DOCX con los datos del formulario
app.post('/api/packing-list', (req, res) => {
    const TMPL = path.join(__dirname, 'plantilla_packing.docx');

    if (!fs.existsSync(TMPL)) {
        return res.status(404).json({
            error: 'Plantilla no encontrada. Por favor descarga el Google Doc como .docx y guárdalo como plantilla_packing.docx en la carpeta del proyecto.'
        });
    }

    try {
        const D = req.body;

        // Formatear fecha dd/mm/yyyy
        function fmtDate(d) {
            if (!d) return '';
            const [y, m, day] = String(d).split('-');
            return `${day}/${m}/${y}`;
        }

        const data = {
            NOMBRECLIENTE: D.cliente || '',
            Direccion: D.direccion || '',
            Ciudad: D.ciudad || '',
            InvoiceNo: D.invoiceNo || '',
            InvoiceDate: fmtDate(D.invoiceDate),
            Truck: D.truck || '',
            Driver: D.driver || '',
            Plates: D.plates || '',
            Container: D.container || '',
            Lote: D.lote || '',
            Pallet: String(D.pallets || 0),
            Saco: String(D.sacos || 0),
            Modelo: D.modelo || '',
            Peso: String(D.peso || 0),
            PesoBruto: String(D.pesoBruto || 0),
        };

        const content = fs.readFileSync(TMPL, 'binary');
        const zip = new PizZip(content);
        const doc = new Docxtemplater(zip, {
            delimiters: { start: '<<', end: '>>' },
            paragraphLoop: true,
            linebreaks: true,
            nullGetter: () => '',   // campo vacío si no existe
        });

        doc.render(data);

        const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
        const fname = `PackingList_${(D.invoiceNo || 'SN').replace(/[^\w-]/g, '_')}_${new Date().toISOString().slice(0, 10)}.docx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
        res.setHeader('Content-Length', buf.length);
        res.send(buf);

    } catch (e) {
        console.error('Error generando packing list:', e);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/packing-pdf — genera PDF con Chrome headless a partir del HTML de la plantilla
app.post('/api/packing-pdf', async (req, res) => {
    if (!CHROME_EXE) {
        return res.status(500).json({ error: 'No se encontró Chrome o Edge instalado en el sistema.' });
    }
    try {
        const D = req.body;
        function fmtD(d) {
            if (!d) return ''; const [y, m, day] = String(d).split('-'); return `${day}/${m}/${y}`;
        }
        function e(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

        const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,sans-serif;font-size:10pt;color:#000;background:#fff}
.page{width:100%;padding:12mm 14mm 8mm 14mm}
h1.title{font-size:16pt;font-weight:700;text-align:center;letter-spacing:.05em;border-bottom:2px solid #000;padding-bottom:5px;margin-bottom:0}
.ht{width:100%;border-collapse:collapse;border:1px solid #000}
.ht td{border:1px solid #000;padding:5px 7px;vertical-align:top;font-size:9.5pt}
.lbl{font-size:7pt;color:#555;display:block;margin-bottom:2px}
.val{font-size:9.5pt;color:#000}
.val.b{font-weight:700}
.cl{width:52%}.cr{width:48%}
.dt{width:100%;border-collapse:collapse}
.dt th{border:1px solid #000;padding:5px 4px;text-align:center;font-weight:700;font-size:9.5pt;background:#fff}
.dt td{border:1px solid #000;padding:6px 4px;text-align:center;font-size:10pt}
.logo{border:1px solid #000;border-top:none;padding:5px;text-align:center}
.ln{font-size:14pt;font-weight:700;color:#1a4fb5;letter-spacing:.12em}
.ls{font-size:7pt;color:#555;margin-top:2px}
.sf{display:flex;width:100%}
.sb{flex:1;border:1px solid #000;border-top:none;height:26mm;background:#ffffa0;display:flex;align-items:flex-end;justify-content:center;padding-bottom:5px;font-size:8pt;color:#333}
.sb:not(:last-child){border-right:none}
@page{size:letter portrait;margin:0}
</style></head><body><div class="page">
<h1 class="title">PACKING LIST</h1>
<table class="ht">
<tr>
  <td class="cl"><span class="lbl">1.&nbsp;&nbsp;Shipper/Exporter</span><span class="val b">Pactra Mexico S. de R.L. de C.V.</span><br/><span class="val">Blvd. Rogelio Pérez Arrambide 4502,</span><br/><span class="val">Centro de Pesquería, 66653 Pesquería, N.L.</span></td>
  <td class="cr"><span class="lbl">6.&nbsp;&nbsp;Invoice no. &amp; date</span><span class="val b">${e(D.invoiceNo)}</span><br/><span class="val">${fmtD(D.invoiceDate)}</span></td>
</tr>
<tr>
  <td class="cl"><span class="lbl">2.&nbsp;&nbsp;For account &amp; risk of Messrs.</span><span class="val b">${e(D.cliente)}</span><br/><span class="val">${e(D.direccion)}</span></td>
  <td class="cr"><span class="lbl">7.&nbsp;&nbsp;Carrier</span><span class="val"><b>TRUCK:</b> ${e(D.truck)}</span><br/><span class="val"><b>DRIVER:</b> ${e(D.driver)}</span><br/><span class="val"><b>PLATES:</b> ${e(D.plates)}</span></td>
</tr>
<tr>
  <td class="cl"><span class="lbl">3.&nbsp;&nbsp;Notify party</span><span class="val">Same as above</span></td>
  <td class="cr"><span class="lbl">8.&nbsp;&nbsp;Sailing on or about</span><span class="val">${fmtD(D.invoiceDate)}</span></td>
</tr>
<tr>
  <td class="cl"><span class="lbl">4.&nbsp;&nbsp;Port of loading</span><span class="val b">PESQUERIA NL</span></td>
  <td class="cr"><span class="lbl">5.&nbsp;&nbsp;Final destination</span><span class="val b">${e(D.ciudad)}</span></td>
</tr>
<tr>
  <td class="cl"><span class="lbl">REMARKS</span><span class="val">${e(D.remarks) || '&nbsp;'}</span></td>
  <td class="cr"><span class="lbl">CONTAINER</span><span class="val b">${e(D.container)}</span></td>
</tr>
</table>
<table class="dt">
<thead><tr><th>LOTE</th><th>Pallet</th><th>Saco</th><th>MODELO</th><th>PESO</th><th>Peso bruto</th></tr></thead>
<tbody><tr><td>${e(D.lote)}</td><td>${D.pallets || 0}</td><td>${D.sacos || 0}</td><td>${e(D.modelo)}</td><td>${D.peso || 0} kg</td><td>${D.pesoBruto || 0} kg</td></tr></tbody>
</table>
<div class="logo"><div class="ln">PACTRA</div><div class="ls">Pactra Mexico S. de R.L. de C.V.</div></div>
<div class="sf">
  <div class="sb">firma bodega salida</div>
  <div class="sb">firma operador</div>
  <div class="sb">firma bodega arribo</div>
</div>
</div></body></html>`;

        const browser = await puppeteer.launch({
            executablePath: CHROME_EXE,
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
        });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'domcontentloaded' });
        const pdfBuf = await page.pdf({
            format: 'Letter',
            printBackground: true,
            margin: { top: '0', right: '0', bottom: '0', left: '0' },
        });
        await browser.close();

        const fname = `PackingList_${(D.invoiceNo || 'SN').replace(/[^\w-]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
        res.setHeader('Content-Length', pdfBuf.length);
        res.send(pdfBuf);

    } catch (e) {
        console.error('Error generando PDF:', e);
        res.status(500).json({ error: e.message });
    }
});

// Ruta raíz
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'inventario', 'index.html'));
});




// ── Arranque ─────────────────────────────────────────────────
initDB().then(() => {
    app.listen(PORT, () => {
        console.log('\n╔══════════════════════════════════════════╗');
        console.log('║   📦  Inventario Pactra  —  Servidor OK  ║');
        console.log('╠══════════════════════════════════════════╣');
        console.log(`║  🌐  http://localhost:${PORT}               ║`);
        console.log(`║  🗄️   Base de datos: inventario.db         ║`);
        console.log('║  🛑  Para detener: Ctrl + C               ║');
        console.log('╚══════════════════════════════════════════╝\n');
    });
}).catch(err => {
    console.error('❌ Error iniciando base de datos:', err);
    process.exit(1);
});
