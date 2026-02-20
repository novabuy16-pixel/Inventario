// ============================================================
//  server.js  —  Inventario Pactra
//  Base de datos SQLite (sql.js puro JS) + API REST
// ============================================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
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

// POST /api/packing-pdf — genera PDF con docxtemplater y MS Word (vía PowerShell)
app.post('/api/packing-pdf', async (req, res) => {
    const TMPL = path.join(__dirname, 'plantilla_packing.docx');

    if (!fs.existsSync(TMPL)) {
        return res.status(404).json({
            error: 'Plantilla no encontrada. Por favor asegúrate de que plantilla_packing.docx esté en la carpeta del proyecto.'
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
            'Ciudad ': D.ciudad || '',
            Ciudad: D.ciudad || '',
            InvoiceNo: D.invoiceNo || '',
            InvoiceDate: fmtDate(D.invoiceDate),
            Truck: D.truck || '',
            Driver: D.driver || '',
            Plates: D.plates || '',
            Container: D.container || '',
            Lote: D.lote || '',
            Pallets: String(D.pallets || 0),
            Sacos: String(D.sacos || 0),
            Modelo: D.modelo || '',
            Peso: String(D.peso || 0),
            PesoBruto: String(D.pesoBruto || 0),
            Remarks: D.remarks || '',
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

        // Guardar docx a nivel temporal
        const ts = Date.now();
        const tmpDocx = path.join(__dirname, `temp_pack_${ts}.docx`);
        const tmpPdf = path.join(__dirname, `temp_pack_${ts}.pdf`);

        fs.writeFileSync(tmpDocx, buf);

        const { exec } = require('child_process');

        // Determinar el comando dependiendo del OS
        let cmd = '';
        if (os.platform() === 'win32') {
            // En Windows local: Usar Microsoft Word mediante PowerShell
            const psScript = path.join(__dirname, 'docx_to_pdf.ps1');
            cmd = `powershell -ExecutionPolicy Bypass -File "${psScript}" -DocPath "${tmpDocx}" -PdfPath "${tmpPdf}"`;
        } else {
            // En la Nube (Linux) / macOS: Usar LibreOffice headless
            cmd = `libreoffice --headless --convert-to pdf "${tmpDocx}" --outdir "${__dirname}"`;
        }

        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.error('Error al convertir PDF:', error, stderr);
                if (fs.existsSync(tmpDocx)) fs.unlinkSync(tmpDocx);
                if (fs.existsSync(tmpPdf)) fs.unlinkSync(tmpPdf);
                return res.status(500).json({ error: 'Hubo un error convirtiendo a PDF. Si estás en la nube (Linux), asegúrate de que "libreoffice" está instalado.' });
            }

            // Si llegamos aquí, el PDF existe
            if (fs.existsSync(tmpPdf)) {
                const pdfBuf = fs.readFileSync(tmpPdf);
                const fname = `PackingList_${(D.invoiceNo || 'SN').replace(/[^\w-]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;

                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
                res.setHeader('Content-Length', pdfBuf.length);
                res.send(pdfBuf);

                // Limpiar temporales
                try {
                    fs.unlinkSync(tmpDocx);
                    fs.unlinkSync(tmpPdf);
                } catch (e) { /* ignore */ }
            } else {
                if (fs.existsSync(tmpDocx)) fs.unlinkSync(tmpDocx);
                res.status(500).json({ error: 'El archivo PDF no se generó correctamente.' });
            }
        });

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
