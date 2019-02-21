const Promise = require('bluebird');
const redis = require('redis');
const request = require('request-promise');
const ProxyAgent = require('https-proxy-agent');
const fs = require('promise-fs');
const settings = require('./settings');

const execute_template = fs.readFileSync(`${__dirname}/execute.vk`, {encoding: 'utf8'});

Promise.promisifyAll(redis);
const flatten = (arr) => [].concat.apply([], arr);
const stale_tokens = new Set;

const main = async () => {
	const tokens = settings.tokens;
	const per_request = settings.users_per_request;
	const proxies = settings.proxies.map(addr => new ProxyAgent(addr))
		.concat([undefined]); // for requests without proxy

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

	await Promise.all(tokens.map(async (token) => {
		return await Promise.all(proxies.map(async (proxy) => {
			let last = Date.now() - settings.request_interval - 100;
			while (keep_running && !stale_tokens.has(token)) {
				const delay = last + settings.request_interval - Date.now();
				if (delay > 0)
					await Promise.delay(delay);
				last = Date.now();

				const task = (await getTasks(redis_db, per_request));
				const completed = await getLinks(token, task.start, task.amount, proxy);

				await saveLinks(local_db, completed);
				console.log(`[${(new Date()).toLocaleString()}][*] ${stat_users_loaded += completed.length} юзеров | ${Math.round(stat_users_loaded/(Date.now() - stat_start_time)*1000)} в сек`);
			}
		}));
	}));

	for (let stale of stale_tokens)
		console.log(`[!] Удалите заблокированный токен: ${stale}`);

	redis_db.quit();
};

const getLinks = async (access_token, start_user_id, amount, agent) => {
	const url = `https://api.vk.com/method/execute`;
	const code = execute_template
		.replace('__start__', start_user_id-1)
		.replace('__count__', amount+1);
	const data = await request.post(url, {agent, form: {code, access_token, v:'5.92'}, json: true});

	if (data.error) {
		if (data.error.error_code === 13) {
			console.log(`[${(new Date()).toLocaleString()}][!] Ошибка execute.. Возможно, следует снизить количество пользователей на запрос`);
			await Promise.delay(settings.request_interval);
			const first_part = await getLinks(access_token, start_user_id, Math.floor(amount/2));
			const last_part = await getLinks(access_token, start_user_id+Math.floor(amount/2), Math.ceil(amount/2));
			return [...first_part, ...last_part];
		}

		if (data.error.error_code === 5) {
			console.log(`[${(new Date()).toLocaleString()}][!!!] Токен ${access_token.substr(0,8)} невалидный`);
			settings.tokens.splice(settings.tokens.indexOf(access_token), 1);
			stale_tokens.add(access_token);
			return await getLinks(settings.tokens[0],start_user_id,amount);
		}

		if (data.error.error_code === 6) {
			console.log(`[${(new Date()).toLocaleString()}][!] Слишком много запросов в секунду, токен ${access_token.substr(0,8)}`);
			await Promise.delay(settings.request_interval);
			return await getLinks(access_token,start_user_id,amount);
		}

		console.error(`[${(new Date()).toLocaleString()}][!!!] Неожиданная ошибка: `, data.error);
	}
	return data.response || []; // [id, [...photos]];
};

const getTasks = async (db, amount) => {
	const offset = await db.incrbyAsync(settings.redis_key, amount);
	return {start: offset-amount, amount};
};

const saveLinks = async (db, links) => {
	const clear_links = links.map(([user,photos]) => {
		return [user, photos.filter(photo => {
			if (!photo) console.log(`[${(new Date()).toLocaleString()}][!!] Отсутствует ссылка на фото пользователя ${user}`);
			return !!photo;
		})];
	});
	const lines = flatten(clear_links.map(([user, photos]) => photos.map(photo => `${photo.replace('https:\/\/','')}\t${user}`)));
	return await fs.appendFile(db, lines.join('\n'));
};

main();