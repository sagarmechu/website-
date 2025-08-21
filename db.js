const sqlite3 = require('sqlite3');
const path = require('path');
const DB_PATH = path.join(__dirname, 'results.db');

const db = new sqlite3.Database(DB_PATH);

function init() {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game TEXT,
        result TEXT,
        result_time TEXT,
        date TEXT,
        source TEXT
      )
    `, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function upsertChart({chart_date, game, result, source}){
  return new Promise((resolve, reject) => {
    db.serialize(()=>{
      db.run(`DELETE FROM charts WHERE chart_date = ? AND UPPER(game) = UPPER(?)`, [chart_date, game], function(delErr){
        if (delErr) return reject(delErr);
        db.run(
          `INSERT INTO charts (chart_date, game, result, source) VALUES (?,?,?,?)`,
          [chart_date, game, result, source],
          function(insErr){
            if (insErr) return reject(insErr);
            resolve(this.lastID);
          }
        );
      });
    });
  });
}

function initCharts() {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS charts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chart_date TEXT,
        game TEXT,
        result TEXT,
        source TEXT
      )
    `, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function insertResult({game, result, result_time, date, source}){
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO results (game, result, result_time, date, source) VALUES (?,?,?,?,?)`,
      [game, result, result_time, date, source],
      function(err){
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  });
}

function insertChart({chart_date, game, result, source}){
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO charts (chart_date, game, result, source) VALUES (?,?,?,?)`,
      [chart_date, game, result, source],
      function(err){
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  });
}

function listResults(limit=100) {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM results ORDER BY id DESC LIMIT ?`, [limit], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    })
  })
}

function latestByGame() {
  return new Promise((resolve, reject) => {
    // Select the latest row per game using a subquery that finds max(id) per game
    const sql = `SELECT r1.* FROM results r1 INNER JOIN (
      SELECT game, MAX(id) as maxid FROM results WHERE game IS NOT NULL GROUP BY game
    ) r2 ON r1.game = r2.game AND r1.id = r2.maxid ORDER BY r1.id DESC`;
    db.all(sql, [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function listCharts(limit = 1000){
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM charts ORDER BY id DESC LIMIT ?`, [limit], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    })
  });
}

function clearChartsBySource(source){
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM charts WHERE source = ?`, [source], function(err){
      if (err) return reject(err);
      resolve(this.changes);
    });
  });
}

function clearAllCharts(){
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM charts`, function(err){
      if (err) return reject(err);
      resolve(this.changes);
    });
  });
}

module.exports = { init, insertResult, listResults, latestByGame, initCharts, insertChart, upsertChart, listCharts };

// --- Admin helpers ---
function getResultById(id){
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM results WHERE id = ?`, [id], (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function updateResult(id, {game, result, result_time, date, source}){
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE results SET game = ?, result = ?, result_time = ?, date = ?, source = ? WHERE id = ?`,
      [game, result, result_time, date, source, id],
      function(err){
        if (err) return reject(err);
        resolve(this.changes);
      }
    );
  });
}

function deleteResult(id){
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM results WHERE id = ?`, [id], function(err){
      if (err) return reject(err);
      resolve(this.changes);
    });
  });
}

module.exports.getResultById = getResultById;
module.exports.updateResult = updateResult;
module.exports.deleteResult = deleteResult;

