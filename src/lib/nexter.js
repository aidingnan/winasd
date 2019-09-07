/**
nexter is a constructor.

It generates a higher order function which could be called multiple times, 
with a bound function as the argument. 
nexter sequentially calls those bound functions to avoid races.

Be careful that the bound function must accepts a callback.
If the function has no callback, nexter won't work properly, 
since it has no way to know when the function finishes.
*/
const nexter = () => {
  const q = []
  const run = () => q[0](() => (q.shift(), q.length && run()))
  return bf => (q.push(bf), (q.length === 1) && run())
}

module.exports = nexter

