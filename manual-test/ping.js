const Ping = require('../src/lib/ping')

const p = new Ping('10.10.9.1')

p.on('up', () => console.log('up'))
p.on('down', () => console.log('down'))

