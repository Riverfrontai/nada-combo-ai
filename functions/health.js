const fs = require('fs');
const path = require('path');

exports.handler = async () => {
  try {
    const p = path.resolve(process.cwd(), 'assets', 'nada_menu.json');
    fs.accessSync(p);
    return { statusCode: 200, body: 'ok' };
  } catch (e) {
    return { statusCode: 500, body: 'asset not found' };
  }
};
