const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// La cadena de conexión viene de una variable de entorno (nunca la pongas
// directamente en el código). En Render: Environment → Add Environment Variable
// -> DATABASE_URL = tu connection string de Supabase.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // requerido por Supabase
});

function generateId(bytes) {
  return crypto.randomBytes(bytes).toString('hex');
}

// Crear una sala nueva (la llama el admin al abrir la página por primera vez)
app.post('/rooms', async (req, res) => {
  try {
    const roomId = generateId(4);
    const adminToken = generateId(16);
    await pool.query(
      'insert into rooms (room, admin_token, value) values ($1, $2, $3)',
      [roomId, adminToken, 55]
    );
    res.json({ room: roomId, adminToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'error creando la sala' });
  }
});

// Cualquiera (admin o viewer) puede consultar el estado actual
app.get('/status/:room', async (req, res) => {
  try {
    const result = await pool.query(
      'select value, updated_at from rooms where room = $1',
      [req.params.room]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'sala no encontrada' });
    }
    const row = result.rows[0];
    res.json({ value: row.value, updatedAt: row.updated_at });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'error leyendo el estado' });
  }
});

// Solo el admin puede publicar un nuevo estado (requiere el adminToken correcto)
app.post('/status/:room', async (req, res) => {
  try {
    const { value, adminToken } = req.body || {};
    const num = Number(value);
    if (Number.isNaN(num) || num < 0 || num > 100) {
      return res.status(400).json({ error: 'valor inválido' });
    }

    const result = await pool.query(
      `update rooms
         set value = $1, updated_at = now()
       where room = $2 and admin_token = $3
       returning value, updated_at`,
      [num, req.params.room, adminToken]
    );

    if (result.rows.length === 0) {
      // O la sala no existe, o el token no coincide -> no revelamos cuál
      return res.status(403).json({ error: 'no autorizado' });
    }

    const row = result.rows[0];
    res.json({ value: row.value, updatedAt: row.updated_at });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'error publicando el estado' });
  }
});

app.get('/', (req, res) => {
  res.send('Kirameter backend activo ✅ (con Postgres/Supabase)');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Servidor escuchando en puerto ' + PORT);
});
