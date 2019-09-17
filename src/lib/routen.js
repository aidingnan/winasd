const child = require('child_process')

module.exports = callback =>
  child.exec('route -n', (err, stdout) =>
    callback(err, !err && stdout
      .toString()
      .split('\n')
      .slice(2)
      .filter(l => !!l)
      .map(line =>
        line.split(' ')
          .filter(s => !!s)
          .reduce((o, c, i) =>
            Object.assign(o, {
              [['destination', 'gateway', 'genmask', 'flags', 'metric', 'ref', 'use', 'iface'][i]]: (i > 3 && i < 7) ? parseInt(c) : c
            }), {}))))
