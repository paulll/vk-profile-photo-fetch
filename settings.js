module.exports = {
	redis_url: 'redis://localhost',
	local_csv: 'dumped.csv',
	redis_key: 'vpd:current_user',
	users_per_request: 25,
	request_interval: 1000/3,
	tokens: [
		'there was a private token',
		'there was a private token',
		'there was a private token',
		'there was a private token',
		'there was a private token'
	],
	proxies: Array(0) // количество
		.fill(10000) // стартовый порт
		.map((x,i)=>`http://user:password@proxy.local:${x+i}`)
	// можно указать и просто списком ['http://...', 'http://...']
};
