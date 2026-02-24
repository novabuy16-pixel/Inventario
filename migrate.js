require('dotenv').config();
const fs = require('fs');
const initSqlJs = require('sql.js');
const { Client } = require('pg');

async function migrate() {
    console.log("Conectando a SQLite...");
    const SQL = await initSqlJs();
    const fileBuffer = fs.readFileSync('inventario.db');
    const db = new SQL.Database(fileBuffer);

    const rows = [];
    const stmt = db.prepare("SELECT * FROM movimientos ORDER BY id_movimiento ASC");
    while (stmt.step()) {
        rows.push(stmt.getAsObject());
    }
    stmt.free();
    console.log(`Leídos ${rows.length} registros de SQLite.`);

    console.log("Conectando a PostgreSQL (Supabase)...");
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log("Creando tabla en PostgreSQL si no existe...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS movimientos (
                id_movimiento   SERIAL PRIMARY KEY,
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
            );
        `);

        // Borrar datos anteriores por si se ejecuta múltiples veces
        await client.query('TRUNCATE TABLE movimientos RESTART IDENTITY');

        console.log("Insertando registros...");
        const CHUNK_SIZE = 50;
        for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
            const chunk = rows.slice(i, i + CHUNK_SIZE);

            // Build a single bulk insert query for the chunk
            const valuesParams = [];
            const flatValues = [];
            let paramOffset = 1;

            chunk.forEach(r => {
                valuesParams.push(`($${paramOffset++}, $${paramOffset++}, $${paramOffset++}, $${paramOffset++}, $${paramOffset++}, $${paramOffset++}, $${paramOffset++}, $${paramOffset++}, $${paramOffset++}, $${paramOffset++}, $${paramOffset++}, $${paramOffset++})`);
                flatValues.push(
                    r.id_movimiento, r.tipo_movimiento || '', r.fecha || '', r.cliente || '',
                    r.contenedor || '', r.factura || '', r.modelo || '', r.no_lote || '',
                    r.pallets || 0, r.piezas || 0, r.piezas_danadas || 0, r.danado || 0
                );
            });

            await client.query(`
                INSERT INTO movimientos 
                (id_movimiento, tipo_movimiento, fecha, cliente, contenedor, factura, modelo, no_lote, pallets, piezas, piezas_danadas, danado)
                VALUES ${valuesParams.join(', ')}
            `, flatValues);

            console.log(`Progreso: ${Math.min(i + CHUNK_SIZE, rows.length)} de ${rows.length}...`);
        }

        // Reset serial sequence in Postgres to the maximum id
        await client.query(`
            SELECT setval('movimientos_id_movimiento_seq', (SELECT MAX(id_movimiento) FROM movimientos));
        `);

        console.log("¡Migración completada con éxito!");
    } catch (e) {
        console.error("Error durante la migración:", e);
    } finally {
        await client.end();
    }
}

migrate();
