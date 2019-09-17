const Ping = require('../src/lib/ping')

const p = new Ping('www.baidu.com')

p.on('up', () => console.log('up'))
p.on('down', () => console.log('down'))

