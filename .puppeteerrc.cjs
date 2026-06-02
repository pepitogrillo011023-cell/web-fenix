const {join} = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Obliga a Render a instalar el Chrome fantasma adentro de tu proyecto
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};