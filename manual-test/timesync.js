const TimeSync = require('../src/lib/timesync')

const ts = new TimeSync()
ts.on('synced', () => console.log(ts))
