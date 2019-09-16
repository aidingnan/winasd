const child = require('child_process')

const f = (iface, callback) =>
  child.exec(`iwlist ${iface} scan | grep ESSID`, (err, stdout, stderr) => {
    if (err) {
      callback(err)
    } else {
      const names = stdout.split('\n')
        .map(l => l.trim())
        .filter(l => l.length)
        .map(l => l.split(':'))
        .filter(l => l[0] === 'ESSID')
        .map(l => l[1])
        .filter(l => l.startsWith('"') && l.endsWith('"'))
        .map(l => l.slice(1, l.length - 1))
        .filter(l => l.length)

      const dedup = Array.from(new Set(names))
      callback(null, dedup)
    }
  })

const fAsync = async iface =>
  new Promise((resolve, reject) =>
    f(iface, (err, names) => err ? reject(err) : resolve(names)))

const delayAsync = async timeout =>
  new Promise((resolve, reject) =>
    setTimeout(() => resolve(), timeout * 1000))

const iwfindAsync = async (iface, name, times) => {
  while (times) {
    try {
      const names = await fAsync(iface)
      if (names.includes(name)) return true
      times--
    } catch (e) {
      await delayAsync(1)
    }
  }

  return false
}

const iwfind = (iface, name, times, callback) =>
  iwfindAsync(iface, name, times)
    .then(found => callback(null, found))
    .catch(e => callback(e))

module.exports = iwfind
