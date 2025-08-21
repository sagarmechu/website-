Lucky Satta Importer

Quick scaffold to import result data for a Lucky Satta-style site and serve a minimal API and static pages.

Files
- `import.js`: config-driven scraper to fetch and parse results from target pages.
- `db.js`: lightweight SQLite wrapper to store results.
- `server.js`: minimal Express server exposing an API and static site.
- `sample-config.json`: example selectors and URL to adapt to the real site's HTML.

Usage
1. npm install
2. Configure `sample-config.json` selectors to match your site's HTML.
3. npm run import
4. npm start

Notes
- This scaffold assumes legal rights to scrape and rehost the site's data. Verify before running against third-party sites.
