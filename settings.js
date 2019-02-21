module.exports = {
	redis_url: 'redis://localhost',
	local_csv: 'dumped.csv',
	redis_key: 'vpd:current_user',
	users_per_request: 25,
	request_interval: 1000/3,
	tokens: [
		'' // any access_token with scope=offline,photos
	],
	proxies: []
};
