
const tmi = require('tmi.js');
const axios = require('axios');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ==========================================
// TWITCH
// ==========================================

const BOT_USERNAME = 'cgamer_bot';
const CHANNEL = 'cgamer__';

const client = new tmi.Client({
    options: { debug: false },
    connection: { reconnect: true, secure: true },
    identity: {
        username: BOT_USERNAME,
        password: process.env.TWITCH_OAUTH
    },
    channels: [CHANNEL]
});

// ==========================================
// RENDER HTTP
// ==========================================

const PORT = process.env.PORT || 10000;

http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Twitch bot is running!');
}).listen(PORT, '0.0.0.0', () => {
    console.log(`HTTP сервер запущен: ${PORT}`);
});

// ==========================================
// ПОДКЛЮЧЕНИЕ
// ==========================================

client.connect().catch(console.error);

client.on('connected', (address, port) => {
    console.log(`Подключено: ${address}:${port}`);
    console.log('TWITCH BOT ПОДКЛЮЧЁН!');
    console.log(`Канал: ${CHANNEL}`);
});

client.on('disconnected', reason => {
    console.log('Отключение:', reason);
});

// ==========================================
// ИГРОВАЯ БАЗА
// ==========================================

const DATA_FILE = path.join(__dirname, 'profiles.json');

let database = { users: {} };

try {
    if (fs.existsSync(DATA_FILE)) {
        database = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        if (!database.users) database.users = {};
    }
} catch (error) {
    console.error('Ошибка загрузки базы:', error);
}

function saveDatabase() {
    try {
        fs.writeFileSync(
            DATA_FILE,
            JSON.stringify(database, null, 2)
        );
    } catch (error) {
        console.error('Ошибка сохранения базы:', error);
    }
}

function getProfile(username) {
    username = username.toLowerCase();

    if (!database.users[username]) {
        database.users[username] = {
            coins: 100,
            xp: 0,
            level: 1,
            fishCaught: 0,
            rareFish: 0,
            fishingCount: 0,
            rod: 'basic',
            lastDaily: 0
        };

        saveDatabase();
    }

    return database.users[username];
}

// ==========================================
// ОПЫТ И УРОВНИ
// ==========================================

function addXP(username, amount) {
    const user = getProfile(username);

    user.xp += amount;

    let needed = user.level * 100;

    while (user.xp >= needed) {
        user.xp -= needed;
        user.level++;
        user.coins += 50;

        client.say(
            CHANNEL,
            `🎉 ${username} достиг ${user.level} уровня! Бонус: 50 монет!`
        );

        needed = user.level * 100;
    }

    saveDatabase();
}

// ==========================================
// МАГАЗИН
// ==========================================

const shop = {
    'удочка': {
        name: 'Улучшенная удочка',
        price: 500,
        id: 'advanced'
    },
    'золотая удочка': {
        name: 'Золотая удочка',
        price: 2000,
        id: 'gold'
    }
};

function showShop() {
    return '🛒 Магазин: удочка — 500 монет | золотая удочка — 2000 монет. Покупка: !купить удочка';
}

function buyItem(username, itemName) {
    const user = getProfile(username);
    const item = shop[itemName.toLowerCase()];

    if (!item) {
        return '❌ Такого товара нет в магазине.';
    }

    const rodPower = {
        basic: 0,
        advanced: 1,
        gold: 2
    };

    if (rodPower[user.rod] >= rodPower[item.id]) {
        return '❌ У тебя уже есть такая или более хорошая удочка.';
    }

    if (user.coins < item.price) {
        return `❌ Не хватает монет. Нужно ${item.price}, у тебя ${user.coins}.`;
    }

    user.coins -= item.price;
    user.rod = item.id;

    saveDatabase();

    return `🎉 ${username} купил: ${item.name}!`;
}

// ==========================================
// ЕЖЕДНЕВНАЯ НАГРАДА
// ==========================================

function dailyReward(username) {
    const user = getProfile(username);
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    if (now - user.lastDaily < day) {
        const remaining = day - (now - user.lastDaily);
        const hours = Math.ceil(remaining / (60 * 60 * 1000));

        return `⏳ ${username}, следующая награда через ${hours} ч.`;
    }

    user.lastDaily = now;
    user.coins += 100;

    addXP(username, 20);
    saveDatabase();

    return `🎁 ${username} получил 100 монет и 20 опыта!`;
}

// ==========================================
// РЫБАЛКА
// ==========================================

const fish = [
    { name: 'карася', coins: 15, xp: 10 },
    { name: 'окуня', coins: 20, xp: 12 },
    { name: 'плотву', coins: 10, xp: 8 },
    { name: 'леща', coins: 25, xp: 15 },
    { name: 'карпа', coins: 35, xp: 20 },
    { name: 'щуку', coins: 45, xp: 25 },
    { name: 'судака', coins: 55, xp: 30 },
    { name: 'сома', coins: 80, xp: 40 },
    { name: 'форель', coins: 100, xp: 50 }
];

const rareFish = [
    { name: 'золотую рыбку', coins: 250, xp: 100 },
    { name: 'легендарного осетра', coins: 500, xp: 150 },
    { name: 'мифического карпа', coins: 1000, xp: 250 }
];

const fishingCooldown = new Map();

function fishing(username) {
    const now = Date.now();
    const last = fishingCooldown.get(username);

    if (last && now - last < 15000) {
        const seconds = Math.ceil((15000 - (now - last)) / 1000);
        return `⏳ ${username}, подожди ${seconds} сек.`;
    }

    fishingCooldown.set(username, now);

    const user = getProfile(username);
    user.fishingCount++;

    let chance = Math.random();

    const bonus = {
        basic: 0,
        advanced: 0.05,
        gold: 0.12
    };

    const rareChance = 0.05 + bonus[user.rod];

    let caught;

    if (chance < rareChance) {
        caught = rareFish[
            Math.floor(Math.random() * rareFish.length)
        ];

        user.rareFish++;
    } else if (chance < rareChance + 0.20) {
        saveDatabase();
        return `🎣 ${username} закинул удочку, но сегодня без улова!`;
    } else {
        caught = fish[
            Math.floor(Math.random() * fish.length)
        ];
    }

    user.coins += caught.coins;
    user.fishCaught++;

    addXP(username, caught.xp);
    saveDatabase();

    return `🎣 ${username} поймал ${caught.name}! +${caught.coins} монет, +${caught.xp} опыта.`;
}

// ==========================================
// ПРОФИЛЬ
// ==========================================

function showProfile(username) {
    const user = getProfile(username);

    return `👤 ${username} | ⭐ Уровень: ${user.level} | Опыт: ${user.xp}/${user.level * 100} | 💰 Монеты: ${user.coins} | 🐟 Рыбы: ${user.fishCaught} | 🌟 Редкие рыбы: ${user.rareFish}`;
}

// ==========================================
// БАЛАНС
// ==========================================

function showBalance(username) {
    const user = getProfile(username);

    return `💰 ${username}, твой баланс: ${user.coins} монет.`;
}

// ==========================================
// ТОП
// ==========================================

function showTop() {
    const users = Object.entries(database.users)
        .sort((a, b) => b[1].coins - a[1].coins)
        .slice(0, 5);

    if (!users.length) return '🏆 Пока нет участников рейтинга.';

    const result = users.map((entry, index) =>
        `${index + 1}. ${entry[0]} — ${entry[1].coins} монет`
    );

    return `🏆 ТОП зрителей: ${result.join(' | ')}`;
}

function showFisherTop() {
    const users = Object.entries(database.users)
        .sort((a, b) => b[1].fishCaught - a[1].fishCaught)
        .slice(0, 5);

    if (!users.length) return '🎣 Пока никто не рыбачил.';

    const result = users.map((entry, index) =>
        `${index + 1}. ${entry[0]} — ${entry[1].fishCaught} рыб`
    );

    return `🎣 ТОП рыбаков: ${result.join(' | ')}`;
}

// ==========================================
// ВАЛЮТЫ
// ==========================================

const currencyDict = {
    доллар: 'USD',
    долларов: 'USD',
    доллара: 'USD',
    usd: 'USD',
    евро: 'EUR',
    eur: 'EUR',
    фунт: 'GBP',
    gbp: 'GBP',
    юань: 'CNY',
    cny: 'CNY',
    йена: 'JPY',
    иена: 'JPY',
    jpy: 'JPY',
    лира: 'TRY',
    try: 'TRY',
    рубль: 'RUB',
    рублей: 'RUB',
    руб: 'RUB',
    rub: 'RUB',
    тенге: 'KZT',
    kzt: 'KZT',
    гривна: 'UAH',
    uah: 'UAH',
    дирхам: 'AED',
    aed: 'AED',
    рупия: 'INR',
    inr: 'INR'
};

let currencyCache = null;
let currencyCacheTime = 0;

function normalizeCurrency(value) {
    if (!value) return null;

    const key = value.toLowerCase().trim();

    return currencyDict[key] ||
        (/^[a-z]{3}$/i.test(key) ? key.toUpperCase() : null);
}

async function getCurrencyRates() {
    if (
        currencyCache &&
        Date.now() - currencyCacheTime < 600000
    ) {
        return currencyCache;
    }

    const response = await axios.get(
        'https://www.cbr-xml-daily.ru/daily_json.js',
        { timeout: 10000 }
    );

    currencyCache = response.data;
    currencyCacheTime = Date.now();

    return currencyCache;
}

// ==========================================
// ПОГОДА
// ==========================================

const weatherCache = new Map();

async function getWeather(city) {
    const key = city.toLowerCase();
    const cached = weatherCache.get(key);

    if (cached && Date.now() - cached.time < 600000) {
        return cached.data;
    }

    const response = await axios.get(
        `https://wttr.in/${encodeURIComponent(city)}`,
        {
            params: { format: 'j1', lang: 'ru' },
            timeout: 12000
        }
    );

    const current = response.data.current_condition[0];

    const result = {
        temperature: current.temp_C,
        feelsLike: current.FeelsLikeC,
        description:
            current.lang_ru?.[0]?.value ||
            current.weatherDesc?.[0]?.value ||
            'Нет описания',
        humidity: current.humidity,
        wind: current.windspeedKmph
    };

    weatherCache.set(key, {
        data: result,
        time: Date.now()
    });

    return result;
}

// ==========================================
// ВРЕМЯ И ЧАСОВЫЕ ПОЯСА
// ==========================================

const timeZones = {
    'москва': 'Europe/Moscow',
    'санкт-петербург': 'Europe/Moscow',
    'питер': 'Europe/Moscow',
    'казань': 'Europe/Moscow',
    'набережные челны': 'Europe/Moscow',
    'челны': 'Europe/Moscow',
    'нижний новгород': 'Europe/Moscow',
    'воронеж': 'Europe/Moscow',
    'ростов-на-дону': 'Europe/Moscow',
    'краснодар': 'Europe/Moscow',
    'сочи': 'Europe/Moscow',
    'уфа': 'Asia/Yekaterinburg',
    'екатеринбург': 'Asia/Yekaterinburg',
    'челябинск': 'Asia/Yekaterinburg',
    'пермь': 'Asia/Yekaterinburg',
    'ижевск': 'Europe/Samara',
    'самара': 'Europe/Samara',
    'саратов': 'Europe/Saratov',
    'астрахань': 'Europe/Astrakhan',
    'омск': 'Asia/Omsk',
    'новосибирск': 'Asia/Novosibirsk',
    'томск': 'Asia/Tomsk',
    'красноярск': 'Asia/Krasnoyarsk',
    'иркутск': 'Asia/Irkutsk',
    'улан-удэ': 'Asia/Irkutsk',
    'чита': 'Asia/Chita',
    'якутск': 'Asia/Yakutsk',
    'владивосток': 'Asia/Vladivostok',
    'хабаровск': 'Asia/Vladivostok',
    'магадан': 'Asia/Magadan',
    'калининград': 'Europe/Kaliningrad',
    'лондон': 'Europe/London',
    'дублин': 'Europe/Dublin',
    'берлин': 'Europe/Berlin',
    'париж': 'Europe/Paris',
    'рим': 'Europe/Rome',
    'мадрид': 'Europe/Madrid',
    'варшава': 'Europe/Warsaw',
    'прага': 'Europe/Prague',
    'стамбул': 'Europe/Istanbul',
    'нью-йорк': 'America/New_York',
    'вашингтон': 'America/New_York',
    'торонто': 'America/Toronto',
    'чикаго': 'America/Chicago',
    'лос-анджелес': 'America/Los_Angeles',
    'токио': 'Asia/Tokyo',
    'осака': 'Asia/Tokyo',
    'пекин': 'Asia/Shanghai',
    'шанхай': 'Asia/Shanghai',
    'сеул': 'Asia/Seoul',
    'сингапур': 'Asia/Singapore',
    'бангкок': 'Asia/Bangkok',
    'дели': 'Asia/Kolkata',
    'дубай': 'Asia/Dubai',
    'ташкент': 'Asia/Tashkent',
    'алматы': 'Asia/Almaty',
    'тбилиси': 'Asia/Tbilisi',
    'ереван': 'Asia/Yerevan',
    'баку': 'Asia/Baku',
    'сидней': 'Australia/Sydney',
    'мельбурн': 'Australia/Melbourne',
    'перт': 'Australia/Perth',
    'окленд': 'Pacific/Auckland'
};

function isValidTimeZone(zone) {
    try {
        new Intl.DateTimeFormat('ru-RU', { timeZone: zone });
        return true;
    } catch {
        return false;
    }
}

function formatTime(city, zone) {
    const now = new Date();

    const time = new Intl.DateTimeFormat('ru-RU', {
        timeZone: zone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }).format(now);

    const date = new Intl.DateTimeFormat('ru-RU', {
        timeZone: zone,
        dateStyle: 'long'
    }).format(now);

    const offset = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        timeZoneName: 'longOffset'
    }).formatToParts(now)
        .find(part => part.type === 'timeZoneName')?.value || '';

    return `🕐 ${city}: ${time} | ${date} | ${offset} | ${zone}`;
}

async function getTime(city) {
    const key = city.toLowerCase().trim();

    if (isValidTimeZone(city)) {
        return formatTime(city, city);
    }

    if (timeZones[key]) {
        return formatTime(city, timeZones[key]);
    }

    const response = await axios.get(
        'https://geocoding-api.open-meteo.com/v1/search',
        {
            params: {
                name: city,
                count: 10,
                language: 'ru',
                format: 'json'
            },
            timeout: 10000
        }
    );

    const place = response.data.results?.find(item => item.timezone);

    if (!place) throw new Error('Город не найден');

    return formatTime(place.name, place.timezone);
}

// ==========================================
// ПЕРЕВОДЧИК
// ==========================================

const languageAliases = {
    'русский': 'ru',
    'английский': 'en',
    'немецкий': 'de',
    'французский': 'fr',
    'испанский': 'es',
    'итальянский': 'it',
    'португальский': 'pt',
    'японский': 'ja',
    'китайский': 'zh-CN',
    'корейский': 'ko',
    'турецкий': 'tr',
    'польский': 'pl',
    'украинский': 'uk',
    'белорусский': 'be',
    'казахский': 'kk',
    'узбекский': 'uz',
    'арабский': 'ar',
    'хинди': 'hi',
    'нидерландский': 'nl',
    'голландский': 'nl',
    'шведский': 'sv',
    'норвежский': 'no',
    'финский': 'fi',
    'чешский': 'cs',
    'греческий': 'el',
    'румынский': 'ro',
    'венгерский': 'hu',
    'тайский': 'th',
    'вьетнамский': 'vi',
    'иврит': 'he',
    'персидский': 'fa',
    'индонезийский': 'id',
    'малайский': 'ms',
    'сербский': 'sr',
    'болгарский': 'bg',
    'датский': 'da',
    'латинский': 'la'
};

const translationCache = new Map();

function normalizeLanguage(language) {
    const key = language.toLowerCase().trim();

    return languageAliases[key] || key;
}

async function translateText(text, from, to) {
    const cacheKey = `${from}|${to}|${text.toLowerCase()}`;

    if (translationCache.has(cacheKey)) {
        return translationCache.get(cacheKey);
    }

    const response = await axios.get(
        'https://api.mymemory.translated.net/get',
        {
            params: {
                q: text,
                langpair: `${from}|${to}`
            },
            timeout: 15000
        }
    );

    if (response.data.responseStatus !== 200) {
        throw new Error(
            response.data.responseDetails || 'Ошибка перевода'
        );
    }

    const translated =
        response.data.responseData?.translatedText;

    if (!translated) {
        throw new Error('Перевод не найден');
    }

    translationCache.set(cacheKey, translated);

    return translated;
}

// ==========================================
// ИГНОРИРУЕМЫЕ ПОЛЬЗОВАТЕЛИ
// ==========================================

const ignoredUsers = [
    BOT_USERNAME,
    'nightbot',
    'streamelements',
    'moobot',
    'sery_bot',
    'jeetbot'
];

// ==========================================
// ОБРАБОТКА КОМАНД
// ==========================================

client.on('message', async (channel, tags, message, self) => {
    if (self) return;

    const username = tags.username?.toLowerCase();

    if (!username || ignoredUsers.includes(username)) return;

    const text = message.trim();

    if (!text.startsWith('!')) return;

    console.log(`Команда от ${username}: ${text}`);

    const parts = text.split(/\s+/);
    const command = parts[0].toLowerCase();

    try {

        // ПОМОЩЬ

        if (['!помощь', '!help'].includes(command)) {
            client.say(channel,
                '📋 !профиль | !баланс | !топ | !топрыбаки | !магазин | !купить удочка | !ежедневно | !рыбалка | !время город | !погода город | !курс доллар | !деньги 100 доллар | !перевод текст | !на en текст'
            );
        }

        // ПРОФИЛЬ

        else if (command === '!профиль') {
            client.say(channel, showProfile(username));
        }

        // БАЛАНС

        else if (command === '!баланс') {
            client.say(channel, showBalance(username));
        }

        // ТОП

        else if (command === '!топ') {
            client.say(channel, showTop());
        }

        // ТОП РЫБАКОВ

        else if (command === '!топрыбаки') {
            client.say(channel, showFisherTop());
        }

        // МАГАЗИН

        else if (command === '!магазин') {
            client.say(channel, showShop());
        }

        // ПОКУПКА

        else if (command === '!купить') {
            const item = parts.slice(1).join(' ');
            client.say(channel, buyItem(username, item));
        }

        // ЕЖЕДНЕВНАЯ НАГРАДА

        else if (command === '!ежедневно') {
            client.say(channel, dailyReward(username));
        }

        // РЫБАЛКА

        else if (['!рыбалка', '!рыба', '!fish'].includes(command)) {
            client.say(channel, fishing(username));
        }

        // ВРЕМЯ

        else if (['!время', '!time'].includes(command)) {
            const city = parts.slice(1).join(' ');

            if (!city) {
                return client.say(channel,
                    '🕐 Пример: !время Казань или !время Europe/Moscow'
                );
            }

            client.say(channel, await getTime(city));
        }

        // ПОГОДА

        else if (['!погода', '!weather'].includes(command)) {
            const city = parts.slice(1).join(' ');

            if (!city) {
                return client.say(channel,
                    '🌤️ Пример: !погода Казань'
                );
            }

            const weather = await getWeather(city);

            client.say(channel,
                `🌤️ ${city}: ${weather.temperature}°C, ощущается ${weather.feelsLike}°C. ${weather.description}. Влажность ${weather.humidity}%, ветер ${weather.wind} км/ч.`
            );
        }

        // КУРС ВАЛЮТ

        else if (['!курс', '!rate'].includes(command)) {
            const currency = normalizeCurrency(parts[1] || 'USD');

            if (!currency) {
                return client.say(channel, '💱 Пример: !курс доллар');
            }

            const data = await getCurrencyRates();

            if (currency === 'RUB') {
                return client.say(channel,
                    '💱 Российский рубль — базовая валюта ЦБ РФ.'
                );
            }

            const item = data.Valute[currency];

            if (!item) {
                return client.say(channel,
                    `❌ Валюта ${currency} не найдена.`
                );
            }

            client.say(channel,
                `💱 ${item.Name}: ${(item.Value / item.Nominal).toFixed(2)} RUB.`
            );
        }

        // КОНВЕРТЕР

        else if (['!деньги', '!money'].includes(command)) {
            const amount = Number(parts[1]);
            const currency = normalizeCurrency(parts[2]);

            if (!Number.isFinite(amount) || amount <= 0 || !currency) {
                return client.say(channel,
                    '💰 Пример: !деньги 100 доллар'
                );
            }

            const data = await getCurrencyRates();

            if (currency === 'RUB') {
                return client.say(channel,
                    `💰 ${amount} RUB = ${amount} RUB.`
                );
            }

            const item = data.Valute[currency];

            if (!item) {
                return client.say(channel,
                    `❌ Валюта ${currency} не найдена.`
                );
            }

            const result = amount * item.Value / item.Nominal;

            client.say(channel,
                `💰 ${amount} ${currency} = ${result.toFixed(2)} RUB.`
            );
        }

        // ПЕРЕВОД НА РУССКИЙ
        // !перевод Hello
        // !перевод en ru Hello

        else if (['!перевод', '!translate'].includes(command)) {
            let from = 'autodetect';
            let to = 'ru';
            let originalText;

            if (
                parts.length >= 4 &&
                /^[a-z]{2,5}$/i.test(parts[1]) &&
                /^[a-z-]{2,8}$/i.test(parts[2])
            ) {
                from = normalizeLanguage(parts[1]);
                to = normalizeLanguage(parts[2]);
                originalText = parts.slice(3).join(' ');
            } else {
                originalText = parts.slice(1).join(' ');
            }

            if (!originalText) {
                return client.say(channel,
                    '🌍 Пример: !перевод Hello — перевод на русский.'
                );
            }

            const translated = await translateText(
                originalText,
                from,
                to
            );

            client.say(channel,
                `🌍 Перевод на ${to === 'ru' ? 'русский' : to}: ${translated}`.slice(0, 450)
            );
        }

        // С РУССКОГО НА ЛЮБОЙ ЯЗЫК
        // !на en Привет
        // !на немецкий Привет

        else if (['!на', '!to'].includes(command)) {
            const target = parts[1];

            const originalText = parts.slice(2).join(' ');

            if (!target || !originalText) {
                return client.say(channel,
                    '🌍 Пример: !на en Привет или !на японский Привет'
                );
            }

            const to = normalizeLanguage(target);

            const translated = await translateText(
                originalText,
                'ru',
                to
            );

            client.say(channel,
                `🌍 Перевод на ${target}: ${translated}`.slice(0, 450)
            );
        }

    } catch (error) {
        console.error(`Ошибка ${command}:`, error.message);

        client.say(channel,
            '⚠️ Ошибка выполнения команды. Попробуй позже.'
        );
    }
});

console.log('Бот запускается...');
