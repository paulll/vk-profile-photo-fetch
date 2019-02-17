const Promise = require('bluebird');
const redis = require('redis');
const request = require('request-promise');
const fs = require('promise-fs');

const settings = {
	redis_url: 'redis://localhost',
	local_csv: 'dumped.csv',
	tokens: [
		'there was a private token',
		'there was a private token'
	]
};

const main = async () => {;
	const tokens = settings.tokens;

	const redis_db = redis.createClient(settings.redis_url);
	const local_db = settings.local_csv;

	let stat_users_loaded = 0;
	let stat_start_time = Date.now();

	let keep_running = true;
	let force_exit = false;

	const exit = () => {
		if (force_exit) process.exit();
		console.log(`[!] Ждем завершения последнего запроса. Нажмите ^C повторно для принудительного завершения`);
		keep_running = false;
		force_exit = true;
	};

	process.on('SIGTERM', exit);
	process.on('SIGINT', exit);

	while (keep_running) {
		const tasks = (await getTasks(redis_db, 25*tokens.length)).chunk(25).chunk(tokens.length);

		for (let parallel_chunk of tasks) {
			const completed = flatten(await Promise.all(parallel_chunk.map((task,i) => getLinks(tokens[i%tokens.length], task[0]))));
			await saveLinks(local_db, completed);

			console.log(`[*] Загружено ${stat_users_loaded += completed.length} юзеров | ${Math.round(stat_users_loaded/(Date.now() - stat_start_time)*1000)} в сек`);
		}
	}

	redis_db.quit();
};

let lastRequestPerToken = new Map;
const getLinks = async (access_token, start_user_id) => {
	// throttle
	if (lastRequestPerToken.has(access_token)) {
		const delay = lastRequestPerToken.get(access_token) + 333 - Date.now();
		if (delay > 0)
			await Promise.delay(delay);
	}
	lastRequestPerToken.set(access_token, Date.now());

	const url = `https://api.vk.com/method/execute.getAllPhotos`;
	const data = await request.post(url, {form: {s: start_user_id, access_token, v:'5.92'}, json: true});
	return data.response; // [id, [...photos]];
};

const getTasks = async (db, amount) => {
	const offset = await db.incrbyAsync('vpd:current_user', amount);
	return Array(amount).fill(offset-amount).map( (x,i) => x + i);
};

const saveLinks = async (db, links) => {
	const lines = flatten(links.map(([user, photos]) => photos.map(photo => `${photo.replace('https:\/\/','')}\t${user}`)));
	return await fs.appendFile(db, lines.join('\n'));
};

// etc

Promise.promisifyAll(redis);

Object.defineProperty(Array.prototype, 'chunk', {
	value: function (chunkSize) {
		let R = [];
		for (let i=0; i<this.length; i+=chunkSize)
			R.push(this.slice(i,i+chunkSize));
		return R;
	}
});

const flatten = (arr) => {
	return [].concat.apply([], arr);
};

main();