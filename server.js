const express = require('express');
const path = require('path');
const { DatabaseSync } = require('node:sqlite'); // sin error GLIBC

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({limit: '5mb'})); // para foto base64
app.use(express.static(path.join(__dirname)));

const db = new DatabaseSync('comentarios.db');
db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY, nombre TEXT, foto TEXT,
  es_moderador INTEGER DEFAULT 0, quiere_ser_moderador INTEGER DEFAULT 0,
  fecha DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS comentarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id TEXT, texto TEXT,
  estado TEXT DEFAULT 'pendiente', fecha DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

app.get('/', (req,res) => res.sendFile(path.join(__dirname, 'index.html')));

// API - todo con el mismo host del túnel
app.post('/perfil/foto', (req,res) => {
  const {usuario_id, foto_base64, nombre} = req.body;
  db.prepare('INSERT OR REPLACE INTO usuarios(id,foto,nombre) VALUES(?,?,?)').run(usuario_id, foto_base64, nombre);
  res.json({ok:true});
});
app.post('/solicitar-mod', (req,res) => {
  db.prepare('UPDATE usuarios SET quiere_ser_moderador=1 WHERE id=?').run(req.body.usuario_id);
  res.json({ok:true});
});
app.post('/comentar', (req,res) => {
  db.prepare('INSERT INTO comentarios(usuario_id,texto) VALUES(?,?)').run(req.body.usuario_id, req.body.texto);
  res.json({ok:true});
});
app.get('/comentarios', (req,res) => {
  const rows = db.prepare(`
    SELECT c.*, u.nombre, u.foto FROM comentarios c 
    LEFT JOIN usuarios u ON u.id=c.usuario_id 
    WHERE c.estado='aprobado' ORDER BY c.fecha DESC`).all();
  res.json(rows);
});
app.get('/menu/:id', (req,res) => {
  const perfil = db.prepare('SELECT * FROM usuarios WHERE id=?').get(req.params.id);
  const mis = db.prepare('SELECT * FROM comentarios WHERE usuario_id=? ORDER BY fecha DESC').all(req.params.id);
  res.json({perfil, mis_comentarios: mis});
});
app.get('/mod/cola', (req,res) => {
  const mod = db.prepare('SELECT es_moderador FROM usuarios WHERE id=?').get(req.query.mod_id);
  if(!mod?.es_moderador) return res.json([]);
  res.json(db.prepare("SELECT * FROM comentarios WHERE estado='pendiente' ORDER BY fecha DESC").all());
});
app.post('/mod/aprobar/:id', (req,res) => {
  db.prepare("UPDATE comentarios SET estado='aprobado' WHERE id=?").run(req.params.id);
  res.json({ok:true});
});
app.post('/mod/rechazar/:id', (req,res) => {
  db.prepare("UPDATE comentarios SET estado='rechazado' WHERE id=?").run(req.params.id);
  res.json({ok:true});
});
app.post('/ser-mod-ahora', (req,res) => {
  const {usuario_id, nombre} = req.body;
  // crea usuario si no existe y lo hace mod directo
  db.prepare(`
    INSERT INTO usuarios(id, nombre, es_moderador, quiere_ser_moderador) 
    VALUES(?, ?, 1, 0)
    ON CONFLICT(id) DO UPDATE SET es_moderador=1, nombre=?
  `).run(usuario_id, nombre || 'Mod', nombre || 'Mod');
  
  console.log(`Nuevo mod instantaneo: ${usuario_id}`);
  res.json({ok: true, es_moderador: true});
});
app.listen(PORT, '0.0.0.0', () => console.log(`http://0.0.0.0:${PORT} - listo para tunel`));