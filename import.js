#!/usr/bin/env node
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const db = require('./db');

const args = process.argv.slice(2);
const cfgPath = args[0] || 'sample-config.json';

async function loadConfig(p){
  const full = path.resolve(p);
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

function extractTimeAndGame(text){
  if (!text) return { game: '', time: '' };
  // Try to locate a time like 01:40 PM or 1:40 PM
  const timeRe = /(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))/;
  const m = text.match(timeRe);
  if (m){
    const time = m[0].trim();
    const game = text.replace(m[0], '').replace(/\s{2,}/g, ' ').trim();
    return { game, time };
  }
  // fallback: split by two or more spaces, assume last token is time
  const parts = text.split(/\s{2,}/).map(s=>s.trim()).filter(Boolean);
  if (parts.length >= 2){
    return { game: parts.slice(0, -1).join(' '), time: parts[parts.length-1] };
  }
  return { game: text.trim(), time: '' };
}

async function parseMainPage($, sourceUrl){
  const results = [];
  // try common structures: rows with two tds in tables
  $('table').each((ti, table) => {
    const $table = $(table);
    $table.find('tr').each((ri, tr) => {
      const tds = $(tr).find('td');
      if (tds.length >= 2){
        const first = $(tds[0]).text().trim().replace(/\s+/g, ' ');
        const second = $(tds[1]).text().trim();
        if (!first) return;
        const { game, time } = extractTimeAndGame(first);
        // try to extract date from page header later; for now empty
        results.push({ game, result: second, time, date: '', source: sourceUrl });
      }
    });
  });
  return results;
}

async function parseChartPage($, chartUrl){
  const results = [];
  // Find chart tables: header th contain game names, first column is Date
  $('table').each((ti, table) => {
    const $table = $(table);
    const headers = [];
    // try thead first
    $table.find('thead th').each((i, th) => {
      headers.push($(th).text().trim());
    });
    // fallback: if no thead, try first tr cells (th or td) as header row
    if (headers.length < 2) {
      const firstRow = $table.find('tr').first();
      firstRow.find('th,td').each((i, cell) => {
        headers.push($(cell).text().trim());
      });
    }
    // If headers look like ['Date', 'SADAR BAZAR', ...]
    if (headers.length < 2) {
      // still nothing useful; try to parse any rows treating first col as date and others as anonymous columns
      $table.find('tr').each((ri, tr) => {
        const tds = $(tr).find('td');
        if (tds.length < 2) return;
        const day = $(tds[0]).text().trim();
        for (let ci = 1; ci < tds.length; ci++){
          const game = `COL${ci}`;
          const val = $(tds[ci]).text().trim();
          results.push({ game, result: val, result_time: '', date: day, source: chartUrl });
        }
      });
    } else {
      const firstHeader = headers[0].toLowerCase();
      // if header's first column is not a date label, we'll still proceed but treat first column as date
      $table.find('tbody tr, tr').each((ri, tr) => {
        const tds = $(tr).find('td');
        if (tds.length < 2) return;
        const day = $(tds[0]).text().trim();
        for (let ci = 1; ci < tds.length && ci < headers.length; ci++){
          const game = headers[ci] || `COL${ci}`;
          const val = $(tds[ci]).text().trim();
          if (!game) continue;
          results.push({ game, result: val, result_time: '', date: day, source: chartUrl });
        }
      });
    }
  });
  return results;
}

async function run(){
  const cfg = await loadConfig(cfgPath);
  await db.init();
  if (typeof db.initCharts === 'function') await db.initCharts();
  const allFound = [];

  if (cfg.source){
    console.log('Fetching main page', cfg.source);
    const res = await axios.get(cfg.source, { headers: { 'User-Agent': 'lucky-satta-importer/0.1' } });
    const $ = cheerio.load(res.data);
    // try configured selector first
    if (cfg.listSelector){
      const rows = $(cfg.listSelector);
      if (rows.length){
        console.log('Found', rows.length, 'rows with configured selector');
        rows.each((i, el) => {
          const game = cfg.mappings && cfg.mappings.game ? $(el).find(cfg.mappings.game).text().trim() : $(el).children().first().text().trim();
          const result = cfg.mappings && cfg.mappings.result ? $(el).find(cfg.mappings.result).text().trim() : $(el).children().eq(1).text().trim();
          const time = cfg.mappings && cfg.mappings.time ? $(el).find(cfg.mappings.time).text().trim() : '';
          const date = cfg.mappings && cfg.mappings.date ? $(el).find(cfg.mappings.date).text().trim() : '';
          if (game && result) allFound.push({ game, result, result_time: time, date, source: cfg.source });
        });
      }
    }

    // fallback generic table parsing
    if (!allFound.length){
      console.log('No rows from selector, trying table-based parsing...');
      const parsed = await parseMainPage($, cfg.source);
      parsed.forEach(r => allFound.push({ game: r.game, result: r.result, result_time: r.time, date: r.date, source: cfg.source }));
      console.log('Table parsing produced', parsed.length, 'entries');
    }
  }

  // Parse chart pages if provided
  if (cfg.charts && Array.isArray(cfg.charts)){
    for (const chartUrl of cfg.charts){
      try{
        // clear previous rows for this chart URL to avoid duplication
        if (typeof db.clearChartsBySource === 'function'){
          try{ await db.clearChartsBySource(chartUrl); }catch(e){}
        }
        console.log('Fetching chart', chartUrl);
        const cres = await axios.get(chartUrl, { headers: { 'User-Agent': 'lucky-satta-importer/0.1' } });
        const $c = cheerio.load(cres.data);
        const parsed = await parseChartPage($c, chartUrl);
        console.log('Chart parsing produced', parsed.length, 'entries');
        // Insert chart rows into charts table and also collect into allFound
        for (const r of parsed){
          try{
            await db.insertChart({ chart_date: r.date || '', game: r.game, result: r.result, source: chartUrl });
          }catch(err){
            console.error('chart insert error', err.message);
          }
          allFound.push({ game: r.game, result: r.result, result_time: r.result_time || '', date: r.date || '', source: chartUrl });
        }
      }catch(err){
        console.error('Chart fetch/parse error', chartUrl, err.message);
      }
    }
  }

  console.log('Total items to insert:', allFound.length);
  let inserted = 0;
  for (const item of allFound){
    if (!item.game || !item.result) continue;
    try{
      await db.insertResult({ game: item.game, result: item.result, result_time: item.result_time || '', date: item.date || '', source: item.source || cfg.source });
      inserted++;
    }catch(err){
      console.error('db insert error', err.message);
    }
  }

  console.log('Inserted:', inserted);
}

if (require.main === module) {
  run().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { run };
