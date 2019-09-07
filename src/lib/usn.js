const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.split('')

/* sn is a hex string (9 bytes/18 characters, 0123xxxxxxxxxxxxee) */
module.exports = sn => {
  const L = []
  let n = parseInt(sn.slice(4, 16), 16)
  for (let i = 0; i < 7; i++) {
    L.unshift(a[n % 32])
    n = Math.floor(n / 32)
  }
  const H1 = (n % 96 + 3).toString().padStart(2, '0')
  const H0 = (Math.floor(n / 96) + 10).toString().padStart(2, '0')
  return `${H0}${H1}-E${L[0]}${L[1]}${L[2]}-${L[3]}${L[4]}${L[5]}${L[6]}`
}
