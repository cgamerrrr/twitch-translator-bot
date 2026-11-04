
const tmi = require('tmi.js');
const axios = require('axios');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ==================================================
// НАСТРОЙКИ
// ==================================================

const CHANNEL = 'cgamer__';
const BOT_NAME = 'cgamer_bot';
const PORT = process.env.PORT || 10000;
const DATA_FILE = path.join(__dirname, 'fish_data.json');

if (!process.env.TWITCH_OAUTH) {
    console.error('ОШИБКА: Не задан TWITCH_OAUTH!');
    process.exit(1);
}

const client = new tmi.Client({
    options: {
        debug: false
    },
    connection: {
        secure: true,
        reconnect: true
    },
    identity: {
        username: BOT_NAME,
        password: process.env.TWITCH_OAUTH
    },
    channels: [CHANNEL]
});

const ignoredUsers = [
    'cgamer_bot',
    'nightbot',
    'streamelements',
    'moobot',
    'sery_bot',
    'jeetbot'
];

// ==================================================
// HTTP СЕРВЕР RENDER
// ==================================================

http.createServer((req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8'
    });

    res.end('Twitch bot is running!');
}).listen(PORT, '0.0.0.0', () => {
    console.log(`HTTP сервер запущен на порту ${PORT}`);
});

// ==================================================
// ИГРОВЫЕ ПРОФИЛИ
// ==================================================

let profiles = {};

function loadProfiles() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            profiles = JSON.parse(
                fs.readFileSync(DATA_FILE, 'utf8')
            );

            if (
                !profiles ||
                typeof profiles !== 'object' ||
                Array.isArray(profiles)
            ) {
                profiles = {};
            }
        }

        console.log('Игровые профили загружены.');
    } catch (error) {
        console.log('Ошибка загрузки профилей:', error.message);
        profiles = {};
    }
}

function saveProfiles() {
    try {
        fs.writeFileSync(
            DATA_FILE,
            JSON.stringify(profiles, null, 2)
        );
    } catch (error) {
        console.log('Ошибка сохранения:', error.message);
    }
}

function getProfile(username) {
    username = username.toLowerCase();

    if (!profiles[username]) {
        profiles[username] = {
            coins: 100,
            xp: 0,
            level: 1,
            fish: 0,
            rareFish: 0,
            rod: 'обычная',
            lastDaily: '',
            lastFish: 0
        };
    }

    const p = profiles[username];

    p.coins ??= 100;
    p.xp ??= 0;
    p.level ??= 1;
    p.fish ??= 0;
    p.rareFish ??= 0;
    p.rod ??= 'обычная';
    p.lastDaily ??= '';
    p.lastFish ??= 0;

    return p;
}

function addXP(username, amount) {
    const profile = getProfile(username);

    profile.xp += amount;

    while (profile.xp >= profile.level * 100) {
        profile.xp -= profile.level * 100;
        profile.level++;
        profile.coins += 50;

        client.say(
            `#${CHANNEL}`,
            `🎉 @${username}, новый уровень: ${profile.level}! Бонус: 50 монет!`
        );
    }

    saveProfiles();
}

// ==================================================
// АВТОПЕРЕВОД НА РУССКИЙ
// ==================================================

const autoTranslateCooldown = new Map();
const AUTO_TRANSLATE_COOLDOWN = 8000;

async function autoTranslateToRussian(message) {
    const response = await axios.get(
        'https://translate.googleapis.com/translate_a/single',
        {
            params: {
                client: 'gtx',
                sl: 'auto',
                tl: 'ru',
                dt: 't',
                q: message
            },
            timeout: 10000
        }
    );

    const data = response.data;

    if (!Array.isArray(data) || !Array.isArray(data[0])) {
        throw new Error('Некорректный ответ переводчика');
    }

    const translated = data[0]
        .map(part => part[0] || '')
        .join('');

    const detectedLanguage = data[2];

    if (!translated.trim() || detectedLanguage === 'ru') {
        return null;
    }

    return translated;
}

// ==================================================
// ЯЗЫКИ
// ==================================================

const languages = {
    'английский': 'en',
    'английском': 'en',
    'немецкий': 'de',
    'немецком': 'de',
    'французский': 'fr',
    'французском': 'fr',
    'испанский': 'es',
    'испанском': 'es',
    'итальянский': 'it',
    'итальянском': 'it',
    'польский': 'pl',
    'польском': 'pl',
    'китайский': 'zh-CN',
    'китайском': 'zh-CN',
    'японский': 'ja',
    'японском': 'ja',
    'корейский': 'ko',
    'корейском': 'ko',
    'турецкий': 'tr',
    'турецком': 'tr',
    'украинский': 'uk',
    'украинском': 'uk',
    'белорусский': 'be',
    'белорусском': 'be',
    'казахский': 'kk',
    'казахском': 'kk',
    'португальский': 'pt',
    'португальском': 'pt',
    'арабский': 'ar',
    'арабском': 'ar',
    'чешский': 'cs',
    'чешском': 'cs',
    'нидерландский': 'nl',
    'нидерландском': 'nl',
    'шведский': 'sv',
    'шведском': 'sv',
    'греческий': 'el',
    'греческом': 'el',
    'хинди': 'hi',
    'вьетнамский': 'vi',
    'вьетнамском': 'vi',
    'румынский': 'ro',
    'румынском': 'ro',
    'финский': 'fi',
    'финском': 'fi',
    'норвежский': 'no',
    'норвежском': 'no',
    'русский': 'ru',
    'русском': 'ru',
    'тайский': 'th',
    'тайском': 'th',
    'иврит': 'he',
    'иврите': 'he',
    'индонезийский': 'id',
    'индонезийском': 'id',
    'болгарский': 'bg',
    'болгарском': 'bg',
    'сербский': 'sr',
    'сербском': 'sr',
    'словацкий': 'sk',
    'словацком': 'sk',
    'венгерский': 'hu',
    'венгерском': 'hu',
    'датский': 'da',
    'датском': 'da',
    'персидский': 'fa',
    'персидском': 'fa',
    'грузинский': 'ka',
    'грузинском': 'ka',
    'армянский': 'hy',
    'армянском': 'hy',
    'эстонский': 'et',
    'эстонском': 'et',
    'латышский': 'lv',
    'латышском': 'lv',
    'литовский': 'lt',
    'литовском': 'lt'
};

async function translateText(text, from, to) {
    const response = await axios.get(
        'https://translate.googleapis.com/translate_a/single',
        {
            params: {
                client: 'gtx',
                sl: from,
                tl: to,
                dt: 't',
                q: text
            },
            timeout: 10000
        }
    );

    if (
        !Array.isArray(response.data) ||
        !Array.isArray(response.data[0])
    ) {
        throw new Error('Не удалось получить перевод');
    }

    return response.data[0]
        .map(part => part[0] || '')
        .join('');
}

// ==================================================
// КУРСЫ ВАЛЮТ
// ==================================================

const currencyDict = {
    'доллар': 'USD',
    'доллара': 'USD',
    'долларов': 'USD',
    'доллары': 'USD',
    'usd': 'USD',

    'евро': 'EUR',
    'eur': 'EUR',

    'фунт': 'GBP',
    'фунта': 'GBP',
    'фунтов': 'GBP',
    'gbp': 'GBP',

    'юань': 'CNY',
    'юаня': 'CNY',
    'cny': 'CNY',

    'лира': 'TRY',
    'лиры': 'TRY',
    'try': 'TRY',

    'тенге': 'KZT',
    'kzt': 'KZT',

    'дирхам': 'AED',
    'aed': 'AED',

    'йена': 'JPY',
    'иена': 'JPY',
    'jpy': 'JPY',

    'франк': 'CHF',
    'chf': 'CHF'
};

async function getCurrencyRate(currency) {
    const response = await axios.get(
        'https://www.cbr-xml-daily.ru/daily_json.js',
        { timeout: 10000 }
    );

    const item = response.data.Valute[currency];

    if (!item) {
        throw new Error('Валюта не найдена в ЦБ РФ');
    }

    return {
        value: item.Value,
        nominal: item.Nominal,
        name: item.Name
    };
}

// ==================================================
// ПОГОДА
// ==================================================

async function getWeather(city) {
    const geo = await axios.get(
        'https://geocoding-api.open-meteo.com/v1/search',
        {
            params: {
                name: city,
                count: 1,
                language: 'ru',
                format: 'json'
            },
            timeout: 10000
        }
    );

    if (!geo.data.results || !geo.data.results.length) {
        throw new Error('Город не найден');
    }

    const place = geo.data.results[0];

    const weather = await axios.get(
        'https://api.open-meteo.com/v1/forecast',
        {
            params: {
                latitude: place.latitude,
                longitude: place.longitude,
                current: 'temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m',
                timezone: 'auto'
            },
            timeout: 10000
        }
    );

    const current = weather.data.current;

    return {
        city: place.name,
        country: place.country,
        temperature: current.temperature_2m,
        feels: current.apparent_temperature,
        humidity: current.relative_humidity_2m,
        wind: current.wind_speed_10m
    };
}

// ==================================================
// ВРЕМЯ В ГОРОДАХ
// ==================================================

async function getCityTime(city) {
    const geo = await axios.get(
        'https://geocoding-api.open-meteo.com/v1/search',
        {
            params: {
                name: city,
                count: 1,
                language: 'ru',
                format: 'json'
            },
            timeout: 10000
        }
    );

    if (!geo.data.results || !geo.data.results.length) {
        throw new Error('Город не найден');
    }

    const place = geo.data.results[0];

    if (!place.timezone) {
        throw new Error('Часовой пояс не найден');
    }

    const time = new Intl.DateTimeFormat('ru-RU', {
        timeZone: place.timezone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }).format(new Date());

    return {
        city: place.name,
        country: place.country,
        time,
        timezone: place.timezone
    };
}

// ==================================================
// РЫБАЛКА
// ==================================================

const fishList = [
    { name: 'Карась', price: 10, rare: false },
    { name: 'Окунь', price: 15, rare: false },
    { name: 'Плотва', price: 12, rare: false },
    { name: 'Щука', price: 30, rare: false },
    { name: 'Сом', price: 50, rare: false },
    { name: 'Золотая рыбка', price: 150, rare: true },
    { name: 'Мифическая рыба', price: 500, rare: true },
    { name: 'Легендарный дракон', price: 1000, rare: true }
];

const rods = {
    'обычная': {
        price: 0,
        rareChance: 0.05
    },
    'улучшенная': {
        price: 500,
        rareChance: 0.15
    },
    'золотая': {
        price: 1500,
        rareChance: 0.30
    }
};

async function fishing(username) {
    const profile = getProfile(username);
    const now = Date.now();

    if (now - profile.lastFish < 30000) {
        const seconds = Math.ceil(
            (30000 - (now - profile.lastFish)) / 1000
        );

        return `⏳ @${username}, подожди ${seconds} сек.`;
    }

    profile.lastFish = now;

    const rod = rods[profile.rod] || rods['обычная'];

    if (Math.random() < rod.rareChance) {
        const rareFish = fishList.filter(fish => fish.rare);

        const fish = rareFish[
            Math.floor(Math.random() * rareFish.length)
        ];

        profile.fish++;
        profile.rareFish++;
        profile.coins += fish.price;

        addXP(username, 30);
        saveProfiles();

        return `🌟 @${username} поймал редкую рыбу: ${fish.name}! +${fish.price} монет!`;
    }

    if (Math.random() < 0.20) {
        addXP(username, 5);
        saveProfiles();

        return `🐟 @${username}, рыба сорвалась с крючка! +5 XP`;
    }

    const normalFish = fishList.filter(fish => !fish.rare);

    const fish = normalFish[
        Math.floor(Math.random() * normalFish.length)
    ];

    profile.fish++;
    profile.coins += fish.price;

    addXP(username, 15);
    saveProfiles();

    return `🎣 @${username} поймал ${fish.name}! +${fish.price} монет!`;
}

// ==================================================
// ЕЖЕДНЕВНАЯ НАГРАДА
// ==================================================

function dailyReward(username) {
    const profile = getProfile(username);

    const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Moscow'
    }).format(new Date());

    if (profile.lastDaily === today) {
        return `⏳ @${username}, ежедневную награду ты уже получил сегодня.`;
    }

    profile.lastDaily = today;
    profile.coins += 200;

    addXP(username, 25);
    saveProfiles();

    return `🎁 @${username}, ты получил 200 монет и 25 XP!`;
}

// ==================================================
// МАГАЗИН
// ==================================================

function showShop() {
    return '🛒 Магазин: обычная удочка — бесплатно | улучшенная — 500 монет | золотая — 1500 монет. Покупка: !купить улучшенная или !купить золотая';
}

function buyRod(username, rodName) {
    const profile = getProfile(username);

    if (!rods[rodName]) {
        return '❌ Такой удочки нет. Доступно: улучшенная, золотая.';
    }

    if (rodName === 'обычная') {
        return 'У тебя уже есть обычная удочка.';
    }

    if (profile.rod === 'золотая') {
        return 'У тебя уже есть золотая удочка!';
    }

    if (
        profile.rod === 'улучшенная' &&
        rodName === 'улучшенная'
    ) {
        return 'У тебя уже есть улучшенная удочка.';
    }

    const price = rods[rodName].price;

    if (profile.coins < price) {
        return `❌ Недостаточно монет. Нужно ${price}, у тебя ${profile.coins}.`;
    }

    profile.coins -= price;
    profile.rod = rodName;

    saveProfiles();

    return `✅ @${username}, ты купил удочку "${rodName}"!`;
}

// ==================================================
// ОБРАБОТКА СООБЩЕНИЙ TWITCH
// ==================================================

client.on('message', async (channel, tags, message, self) => {
    if (self) return;

    const username = tags.username?.toLowerCase();

    if (!username || ignoredUsers.includes(username)) return;

    const trimmedMessage = message.trim();

    if (!trimmedMessage) return;

    const args = trimmedMessage.split(/\s+/);
    const command = args[0].toLowerCase();
    const text = args.slice(1).join(' ');

    try {

        // ==================================================
        // АВТОПЕРЕВОД
        // ==================================================

        if (
            !trimmedMessage.startsWith('!') &&
            !trimmedMessage.startsWith('/') &&
            trimmedMessage.length >= 3 &&
            !/^https?:\/\//i.test(trimmedMessage)
        ) {
            const now = Date.now();

            const lastTranslation =
                autoTranslateCooldown.get(username) || 0;

            if (now - lastTranslation >= AUTO_TRANSLATE_COOLDOWN) {
                autoTranslateCooldown.set(username, now);

                try {
                    const translated =
                        await autoTranslateToRussian(trimmedMessage);

                    if (translated && translated.trim()) {
                        client.say(
                            channel,
                            `🌐 ${username}: ${translated.slice(0, 350)}`
                        );
                    }
                } catch (error) {
                    console.log(
                        'Ошибка автоперевода:',
                        error.message
                    );
                }
            }
        }

        // ==================================================
        // ПОМОЩЬ
        // ==================================================

        if (command === '!помощь' || command === '!help') {
            client.say(
                channel,
                '📌 !профиль !баланс !рыбалка !ежедневно !магазин !купить !топ !топрыбаки !погода город !время город !курс валюта !перевод текст !на язык текст'
            );
        }

        // ==================================================
        // ПРОФИЛЬ
        // ==================================================

        else if (command === '!профиль') {
            const p = getProfile(username);

            client.say(
                channel,
                `👤 @${username} | Уровень: ${p.level} | XP: ${p.xp}/${p.level * 100} | Монеты: ${p.coins} | Рыбы: ${p.fish} | Редкой рыбы: ${p.rareFish} | Удочка: ${p.rod}`
            );
        }

        // ==================================================
        // БАЛАНС
        // ==================================================

        else if (
            command === '!баланс' ||
            command === '!деньги'
        ) {
            const p = getProfile(username);

            client.say(
                channel,
                `💰 @${username}, твой баланс: ${p.coins} монет.`
            );
        }

        // ==================================================
        // РЫБАЛКА
        // ==================================================

        else if (
            command === '!рыбалка' ||
            command === '!рыба' ||
            command === '!fish'
        ) {
            const result = await fishing(username);
            client.say(channel, result);
        }

        // ==================================================
        // ЕЖЕДНЕВНО
        // ==================================================

        else if (command === '!ежедневно') {
            client.say(channel, dailyReward(username));
        }

        // ==================================================
        // МАГАЗИН
        // ==================================================

        else if (command === '!магазин') {
            client.say(channel, showShop());
        }

        // ==================================================
        // ПОКУПКА
        // ==================================================

        else if (command === '!купить') {
            const rodName = args
                .slice(1)
                .join(' ')
                .toLowerCase();

            client.say(
                channel,
                buyRod(username, rodName)
            );
        }

        // ==================================================
        // ТОП ИГРОКОВ
        // ==================================================

        else if (command === '!топ') {
            const top = Object.entries(profiles)
                .sort((a, b) =>
                    (b[1].coins || 0) - (a[1].coins || 0)
                )
                .slice(0, 5)
                .map((entry, index) =>
                    `${index + 1}. ${entry[0]} — ${entry[1].coins || 0} монет`
                );

            client.say(
                channel,
                top.length
                    ? `🏆 Топ игроков: ${top.join(' | ')}`
                    : 'Пока нет игроков.'
            );
        }

        // ==================================================
        // ТОП РЫБАКОВ
        // ==================================================

        else if (command === '!топрыбаки') {
            const top = Object.entries(profiles)
                .sort((a, b) =>
                    (b[1].fish || 0) - (a[1].fish || 0)
                )
                .slice(0, 5)
                .map((entry, index) =>
                    `${index + 1}. ${entry[0]} — ${entry[1].fish || 0} рыб`
                );

            client.say(
                channel,
                top.length
                    ? `🎣 Топ рыбаков: ${top.join(' | ')}`
                    : 'Пока нет рыбаков.'
            );
        }

        // ==================================================
        // ПОГОДА
        // ==================================================

        else if (
            command === '!погода' ||
            command === '!weather'
        ) {
            if (!text) {
                client.say(
                    channel,
                    'Напиши город: !погода Москва'
                );
                return;
            }

            const w = await getWeather(text);

            client.say(
                channel,
                `🌤 ${w.city}, ${w.country}: ${w.temperature}°C, ощущается ${w.feels}°C, влажность ${w.humidity}%, ветер ${w.wind} км/ч.`
            );
        }

        // ==================================================
        // ВРЕМЯ
        // ==================================================

        else if (
            command === '!время' ||
            command === '!time'
        ) {
            if (!text) {
                client.say(
                    channel,
                    'Напиши город: !время Токио'
                );
                return;
            }

            const t = await getCityTime(text);

            client.say(
                channel,
                `🕒 ${t.city}, ${t.country}: ${t.time} (${t.timezone})`
            );
        }

        // ==================================================
        // КУРС ВАЛЮТ
        // ==================================================

        else if (
            command === '!курс' ||
            command === '!rate'
        ) {
            if (!text) {
                client.say(
                    channel,
                    'Напиши валюту: !курс доллар'
                );
                return;
            }

            const currency =
                currencyDict[text.toLowerCase()] ||
                text.toUpperCase();

            const rate = await getCurrencyRate(currency);

            const value = rate.value / rate.nominal;

            client.say(
                channel,
                `💱 ${rate.name}: ${value.toFixed(2)} RUB за 1 единицу.`
            );
        }

        // ==================================================
        // ПЕРЕВОД НА РУССКИЙ
        // ==================================================

        else if (
            command === '!перевод' ||
            command === '!translate'
        ) {
            if (!text) {
                client.say(
                    channel,
                    'Используй: !перевод Hello'
                );
                return;
            }

            const translated = await translateText(
                text,
                'auto',
                'ru'
            );

            client.say(
                channel,
                `🌐 @${username}: ${translated.slice(0, 350)}`
            );
        }

        // ==================================================
        // ПЕРЕВОД С РУССКОГО НА ДРУГОЙ ЯЗЫК
        // ==================================================

        else if (command === '!на') {
            const targetName = args[1]?.toLowerCase();

            const translationText = args
                .slice(2)
                .join(' ');

            if (!targetName || !translationText) {
                client.say(
                    channel,
                    'Используй: !на английский Привет или !на en Привет'
                );
                return;
            }

            const targetLanguage =
                languages[targetName] || targetName;

            if (
                !/^[a-z]{2,3}(-[a-z]{2,4})?$/i.test(targetLanguage)
            ) {
                client.say(
                    channel,
                    '❌ Неизвестный код языка.'
                );
                return;
            }

            const translated = await translateText(
                translationText,
                'ru',
                targetLanguage
            );

            client.say(
                channel,
                `🌐 @${username}: ${translated.slice(0, 350)}`
            );
        }

    } catch (error) {

        console.error('========== ОШИБКА БОТА ==========');
        console.error('Команда:', command);
        console.error('Пользователь:', username);
        console.error('Сообщение:', error.message);
        console.error('Код:', error.code);
        console.error('HTTP статус:', error.response?.status);
        console.error('Ответ сервера:', error.response?.data);
        console.error('=================================');

        client.say(
            channel,
            `❌ @${username}, ошибка выполнения команды. Попробуй позже.`
        );
    }
});

// ==================================================
// ЗАПУСК БОТА
// ==================================================

loadProfiles();

client.connect().catch(error => {
    console.error('Ошибка подключения к Twitch:', error);
});

client.on('connected', (address, port) => {
    console.log(`Подключено к Twitch: ${address}:${port}`);

    console.log('TWITCH BOT ПОДКЛЮЧЁН!');
    console.log(`Канал: ${CHANNEL}`);
    console.log('Автоперевод включён');
    console.log('Игровые профили включены');
    console.log('Рыбалка включена');
    console.log('Погода включена');
    console.log('Валюты включены');
    console.log('Время включено');
});

client.on('disconnected', reason => {
    console.log('Отключение от Twitch:', reason);
});
