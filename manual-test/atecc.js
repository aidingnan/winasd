const atecc = require('../src/lib/atecc/atecc')

const mainAsync = async () => {
	let count = 0
while (true) {
	let serial = await new Promise((resolve, reject) => 
		atecc.serialNumber({}, (err, data) => err ? reject(err) : resolve(data)))
	console.log(count, serial)
	await new Promise((resolve, reject) => {
		setTimeout(() => resolve(), 1600)
	})
	count++
}
}

mainAsync()
	.then(() => {})
	.catch(e => console.log(e))
