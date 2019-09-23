const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.split('')

/* sn is a hex string (9 bytes/18 characters, 0123xxxxxxxxxxxxee) */
module.exports = (sn, debug) => {
  const L = []
  let n = parseInt(sn.slice(4, 16), 16)

  if (debug) {
    console.log('sn', sn)
    console.log('n', n)
  }

  for (let i = 0; i < 7; i++) {
    L.unshift(a[n % 32])
    n = Math.floor(n / 32)
  }

  if (debug) console.log('hn', n)

  const H1 = (n % 96 + 3).toString().padStart(2, '0')
  const H0 = (Math.floor(n / 96) + 10).toString().padStart(2, '0')

  if (debug) {
    console.log('H0', H0)
    console.log('H1', H1)
    for (let i = 0; i < 7; i++) 
      console.log(`L${i}`, L[i])
  }

  return `${H0}${H1}-E${L[0]}${L[1]}${L[2]}-${L[3]}${L[4]}${L[5]}${L[6]}`
}
