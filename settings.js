module.exports = {
	redis_url: 'redis://localhost',
	local_csv: 'dumped.csv',
	users_per_request: 26,
	request_interval: 1000/3,
	tokens: [
		'there was a private token',
		'there was a private token',
		'there was a private token',
		'there was a private token',
		'there was a private token'
	],
	socks: Array(10) // количество
		.fill(10000) // стартовый порт
		.map((x,i)=>`http://user:password@proxy.local:${x+i}`)
	// можно указать и просто списком ['http://...', 'http://...']
};