
const tmi = require('tmi.js');
const axios = require('axios');
const http = require('http');

// ==========================================
// НАСТРОЙКИ TWITCH
// ==========================================

const BOT_USERNAME = 'cgamer_bot';
const CHANNEL = 'cgamer__';

const opts = {
    options: {
        debug: false
    },
    connection: {
        reconnect: true,
        secure: true
    },
    identity: {
        username: BOT_USERNAME,
        password: process.env.TWITCH_OAUTH
    },
    channels: [CHANNEL]
};

// ==========================================
// HTTP СЕРВЕР ДЛЯ RENDER
// ==========================================

const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Twitch bot is running!');
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`HTTP сервер запущен на порту ${PORT}`);
});

// ==========================================
// TWITCH ПОДКЛЮЧЕНИЕ
// ==========================================

const client = new tmi.Client(opts);

client.connect().catch(err => {
    console.error('Ошибка подключения к Twitch:', err);
});

client.on('connected', (address, port) => {
    console.log(`Подключено к Twitch: ${address}:${port}`);
    console.log('TWITCH BOT ПОДКЛЮЧЁН!');
    console.log(`Канал: ${CHANNEL}`);
});

client.on('disconnected', reason => {
    console.log('Отключение от Twitch:', reason);
});

// ==========================================
// ОБЩИЕ НАСТРОЙКИ
// ==========================================

const ignoredUsers = [
    'cgamer_bot',
    'nightbot',
    'streamelements',
    'moobot',
    'sery_bot',
    'jeetbot'
];

const weatherCache = new Map();
const currencyCache = {
    data: null,
    time: 0
};
const translationCache = new Map();
const timeCache = new Map();
const fishingCooldown = new Map();

const CACHE_TIME = 10 * 60 * 1000;

// ==========================================
// ВАЛЮТЫ
// ==========================================

const currencyDict = {
    'доллар': 'USD',
    'долларов': 'USD',
    'доллара': 'USD',
    'бакс': 'USD',
    'баксов': 'USD',
    'usd': 'USD',

    'евро': 'EUR',
    'eur': 'EUR',

    'фунт': 'GBP',
    'фунтов': 'GBP',
    'gbp': 'GBP',

    'юань': 'CNY',
    'юаней': 'CNY',
    'cny': 'CNY',

    'йена': 'JPY',
    'иена': 'JPY',
    'jpy': 'JPY',

    'лира': 'TRY',
    'лир': 'TRY',
    'try': 'TRY',

    'рубль': 'RUB',
    'рублей': 'RUB',
    'руб': 'RUB',
    'rub': 'RUB',

    'тенге': 'KZT',
    'kzt': 'KZT',

    'гривна': 'UAH',
    'гривен': 'UAH',
    'uah': 'UAH',

    'белорусский рубль': 'BYN',
    'byn': 'BYN',

    'дирхам': 'AED',
    'aed': 'AED',

    'рупия': 'INR',
    'inr': 'INR'
};

function normalizeCurrency(value) {
    if (!value) return null;

    const key = value.toLowerCase().trim();

    if (currencyDict[key]) {
        return currencyDict[key];
    }

    const code = key.toUpperCase();

    if (/^[A-Z]{3}$/.test(code)) {
        return code;
    }

    return null;
}

async function getCurrencyRates() {
    if (
        currencyCache.data &&
        Date.now() - currencyCache.time < CACHE_TIME
    ) {
        return currencyCache.data;
    }

    const response = await axios.get(
        'https://www.cbr-xml-daily.ru/daily_json.js',
        { timeout: 10000 }
    );

    currencyCache.data = response.data;
    currencyCache.time = Date.now();

    return response.data;
}

// ==========================================
// ПОГОДА
// ==========================================

async function getWeather(city) {
    const key = city.toLowerCase();

    const cached = weatherCache.get(key);

    if (cached && Date.now() - cached.time < CACHE_TIME) {
        return cached.data;
    }

    const response = await axios.get(
        `https://wttr.in/${encodeURIComponent(city)}`,
        {
            params: {
                format: 'j1',
                lang: 'ru'
            },
            timeout: 12000
        }
    );

    const current = response.data.current_condition[0];

    const result = {
        city,
        temperature: current.temp_C,
        feelsLike: current.FeelsLikeC,
        description: current.lang_ru?.[0]?.value || current.weatherDesc?.[0]?.value,
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
// ЧАСОВЫЕ ПОЯСА И ГОРОДА
// ==========================================

const timeZones = {

    // РОССИЯ

    'москва': 'Europe/Moscow',
    'санкт-петербург': 'Europe/Moscow',
    'питер': 'Europe/Moscow',
    'казань': 'Europe/Moscow',
    'набережные челны': 'Europe/Moscow',
    'челны': 'Europe/Moscow',
    'нижний новгород': 'Europe/Moscow',
    'воронеж': 'Europe/Moscow',
    'липецк': 'Europe/Moscow',
    'ростов-на-дону': 'Europe/Moscow',
    'краснодар': 'Europe/Moscow',
    'сочи': 'Europe/Moscow',
    'волгоград': 'Europe/Volgograd',
    'уфа': 'Asia/Yekaterinburg',
    'екатеринбург': 'Asia/Yekaterinburg',
    'челябинск': 'Asia/Yekaterinburg',
    'пермь': 'Asia/Yekaterinburg',
    'ижевск': 'Europe/Samara',
    'самара': 'Europe/Samara',
    'саратов': 'Europe/Saratov',
    'астрахань': 'Europe/Astrakhan',
    'киров': 'Europe/Kirov',
    'йошкар-ола': 'Europe/Moscow',
    'чебоксары': 'Europe/Moscow',
    'ульяновск': 'Europe/Ulyanovsk',
    'тольятти': 'Europe/Samara',
    'оренбург': 'Asia/Yekaterinburg',
    'омск': 'Asia/Omsk',
    'новосибирск': 'Asia/Novosibirsk',
    'томск': 'Asia/Tomsk',
    'кемерово': 'Asia/Novokuznetsk',
    'новокузнецк': 'Asia/Novokuznetsk',
    'барнаул': 'Asia/Barnaul',
    'горно-алтайск': 'Asia/Barnaul',
    'красноярск': 'Asia/Krasnoyarsk',
    'абакан': 'Asia/Krasnoyarsk',
    'иркутск': 'Asia/Irkutsk',
    'улан-удэ': 'Asia/Irkutsk',
    'чита': 'Asia/Chita',
    'якутск': 'Asia/Yakutsk',
    'благовещенск': 'Asia/Yakutsk',
    'хабаровск': 'Asia/Vladivostok',
    'владивосток': 'Asia/Vladivostok',
    'южно-сахалинск': 'Asia/Sakhalin',
    'магадан': 'Asia/Magadan',
    'петропавловск-камчатский': 'Asia/Kamchatka',
    'анадырь': 'Asia/Anadyr',
    'калининград': 'Europe/Kaliningrad',

    // ЕВРОПА

    'лондон': 'Europe/London',
    'дублин': 'Europe/Dublin',
    'лиссабон': 'Europe/Lisbon',
    'берлин': 'Europe/Berlin',
    'париж': 'Europe/Paris',
    'мадрид': 'Europe/Madrid',
    'рим': 'Europe/Rome',
    'варшава': 'Europe/Warsaw',
    'прага': 'Europe/Prague',
    'вена': 'Europe/Vienna',
    'амстердам': 'Europe/Amsterdam',
    'брюссель': 'Europe/Brussels',
    'стокгольм': 'Europe/Stockholm',
    'осло': 'Europe/Oslo',
    'хельсинки': 'Europe/Helsinki',
    'афины': 'Europe/Athens',
    'бухарест': 'Europe/Bucharest',
    'киев': 'Europe/Kyiv',
    'минск': 'Europe/Minsk',
    'стамбул': 'Europe/Istanbul',
    'цюрих': 'Europe/Zurich',

    // АМЕРИКА

    'нью-йорк': 'America/New_York',
    'вашингтон': 'America/New_York',
    'майами': 'America/New_York',
    'торонто': 'America/Toronto',
    'чикаго': 'America/Chicago',
    'денвер': 'America/Denver',
    'лос-анджелес': 'America/Los_Angeles',
    'сан-франциско': 'America/Los_Angeles',
    'лас-вегас': 'America/Los_Angeles',
    'мехико': 'America/Mexico_City',
    'сан-паулу': 'America/Sao_Paulo',
    'буэнос-айрес': 'America/Argentina/Buenos_Aires',

    // АЗИЯ

    'токио': 'Asia/Tokyo',
    'осaka': 'Asia/Tokyo',
    'пекин': 'Asia/Shanghai',
    'шанхай': 'Asia/Shanghai',
    'гонконг': 'Asia/Hong_Kong',
    'сеул': 'Asia/Seoul',
    'тайбэй': 'Asia/Taipei',
    'сингапур': 'Asia/Singapore',
    'бангкок': 'Asia/Bangkok',
    'дели': 'Asia/Kolkata',
    'мумбаи': 'Asia/Kolkata',
    'дубай': 'Asia/Dubai',
    'абу-даби': 'Asia/Dubai',
    'ташкент': 'Asia/Tashkent',
    'алматы': 'Asia/Almaty',
    'астана': 'Asia/Almaty',
    'бишкек': 'Asia/Bishkek',
    'тбилиси': 'Asia/Tbilisi',
    'ереван': 'Asia/Yerevan',
    'баку': 'Asia/Baku',
    'иерусалим': 'Asia/Jerusalem',

    // ОКЕАНИЯ

    'сидней': 'Australia/Sydney',
    'мельбурн': 'Australia/Melbourne',
    'перт': 'Australia/Perth',
    'брисбен': 'Australia/Brisbane',
    'окленд': 'Pacific/Auckland',
    'фиджи': 'Pacific/Fiji'
};

function isValidTimeZone(zone) {
    try {
        new Intl.DateTimeFormat('ru-RU', {
            timeZone: zone
        });
        return true;
    } catch {
        return false;
    }
}

function formatCityTime(city, zone) {
    const now = new Date();

    const time = new Intl.DateTimeFormat('ru-RU', {
        timeZone: zone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }).format(now);

    const date = new Intl.DateTimeFormat('ru-RU', {
        timeZone: zone,
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    }).format(now);

    const offset = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        timeZoneName: 'longOffset'
    })
        .formatToParts(now)
        .find(part => part.type === 'timeZoneName')?.value || '';

    return {
        city,
        time,
        date,
        offset,
        zone
    };
}

async function getTime(city) {
    const input = city.trim();
    const key = input.toLowerCase();

    // Проверяем прямой ввод часового пояса
    if (isValidTimeZone(input)) {
        return formatCityTime(input, input);
    }

    // Проверяем готовый список городов
    if (timeZones[key]) {
        return formatCityTime(input, timeZones[key]);
    }

    // Проверяем кэш найденных городов
    const cached = timeCache.get(key);

    if (cached && Date.now() - cached.time < 24 * 60 * 60 * 1000) {
        return formatCityTime(cached.city, cached.zone);
    }

    // Ищем остальные города через Open-Meteo
    const response = await axios.get(
        'https://geocoding-api.open-meteo.com/v1/search',
        {
            params: {
                name: input,
                count: 10,
                language: 'ru',
                format: 'json'
            },
            timeout: 10000
        }
    );

    const places = response.data.results;

    if (!places || places.length === 0) {
        throw new Error('Город не найден');
    }

    const place = places.find(item => item.timezone);

    if (!place) {
        throw new Error('Часовой пояс не найден');
    }

    timeCache.set(key, {
        city: place.name,
        zone: place.timezone,
        time: Date.now()
    });

    return formatCityTime(place.name, place.timezone);
}

// ==========================================
// ПЕРЕВОДЧИК
// ==========================================

async function translateText(text, from, to) {
    const cacheKey = `${from}_${to}_${text.toLowerCase()}`;

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
            timeout: 12000
        }
    );

    const translated = response.data.responseData?.translatedText;

    if (!translated) {
        throw new Error('Не удалось выполнить перевод');
    }

    translationCache.set(cacheKey, translated);

    return translated;
}

// ==========================================
// РЫБАЛКА
// ==========================================

const fishList = [
    'карася',
    'окуня',
    'щуку',
    'леща',
    'карпа',
    'сома',
    'плотву',
    'судака',
    'форель',
    'осетра'
];

const rareFish = [
    'золотую рыбку',
    'легендарного осетра',
    'огромного сома',
    'редкую форель'
];

function fishing(user) {
    const now = Date.now();
    const last = fishingCooldown.get(user);

    if (last && now - last < 15000) {
        const seconds = Math.ceil((15000 - (now - last)) / 1000);
        return `⏳ ${user}, подожди ещё ${seconds} сек. перед следующей рыбалкой!`;
    }

    fishingCooldown.set(user, now);

    const chance = Math.random();

    if (chance < 0.05) {
        const fish = rareFish[
            Math.floor(Math.random() * rareFish.length)
        ];

        return `🎣 ${user} закинул удочку! 🌟 Поймал ${fish}! Редкая удача!`;
    }

    if (chance < 0.25) {
        return `🎣 ${user} закинул удочку! 🥲 Сегодня без улова!`;
    }

    const fish = fishList[
        Math.floor(Math.random() * fishList.length)
    ];

    return `🎣 ${user} закинул удочку! 🐠 Поймал ${fish}!`;
}

// ==========================================
// КОМАНДЫ TWITCH
// ==========================================

client.on('message', async (channel, tags, message, self) => {
    if (self) return;

    const username = tags.username?.toLowerCase();

    if (!username || ignoredUsers.includes(username)) {
        return;
    }

    const text = message.trim();

    if (!text.startsWith('!')) return;

    console.log(`Команда от ${username}: ${text}`);

    const parts = text.split(/\s+/);
    const command = parts[0].toLowerCase();

    try {

        // ----------------------------------
        // ПОМОЩЬ
        // ----------------------------------

        if (['!помощь', '!help'].includes(command)) {
            client.say(channel,
                '📋 Команды: !время [город] | !погода [город] | !курс [валюта] | !деньги [сумма] [валюта] | !перевод [язык1] [язык2] [текст] | !рыбалка'
            );
        }

        // ----------------------------------
        // ВРЕМЯ
        // ----------------------------------

        else if (['!время', '!time'].includes(command)) {
            const city = parts.slice(1).join(' ');

            if (!city) {
                return client.say(channel,
                    '🕐 Укажи город или часовой пояс. Например: !время Казань или !время Europe/Moscow'
                );
            }

            const result = await getTime(city);

            client.say(channel,
                `🕐 ${result.city}: ${result.time} | ${result.date} | ${result.offset} | ${result.zone}`
            );
        }

        // ----------------------------------
        // ПОГОДА
        // ----------------------------------

        else if (['!погода', '!weather'].includes(command)) {
            const city = parts.slice(1).join(' ');

            if (!city) {
                return client.say(channel,
                    '🌤️ Укажи город. Например: !погода Казань'
                );
            }

            const weather = await getWeather(city);

            client.say(channel,
                `🌤️ ${weather.city}: ${weather.temperature}°C, ощущается как ${weather.feelsLike}°C. ${weather.description}. Влажность ${weather.humidity}%, ветер ${weather.wind} км/ч.`
            );
        }

        // ----------------------------------
        // КУРС ВАЛЮТ
        // ----------------------------------

        else if (['!курс', '!rate'].includes(command)) {
            const currency = normalizeCurrency(parts[1] || 'USD');

            if (!currency) {
                return client.say(channel,
                    '💱 Укажи валюту. Например: !курс доллар'
                );
            }

            const data = await getCurrencyRates();

            if (currency === 'RUB') {
                return client.say(channel,
                    '💱 Российский рубль является базовой валютой курса ЦБ.'
                );
            }

            const item = data.Valute[currency];

            if (!item) {
                return client.say(channel,
                    `❌ Валюта ${currency} не найдена в списке ЦБ РФ.`
                );
            }

            const price = item.Value / item.Nominal;

            client.say(channel,
                `💱 ${item.Name}: ${price.toFixed(2)} RUB за 1 ${currency}. Курс ЦБ РФ.`
            );
        }

        // ----------------------------------
        // КОНВЕРТЕР ВАЛЮТ
        // ----------------------------------

        else if (['!деньги', '!money'].includes(command)) {
            const amount = Number(parts[1]);
            const currency = normalizeCurrency(parts[2] || 'USD');

            if (!Number.isFinite(amount) || amount <= 0 || !currency) {
                return client.say(channel,
                    '💰 Пример: !деньги 100 доллар'
                );
            }

            const data = await getCurrencyRates();

            if (currency === 'RUB') {
                return client.say(channel,
                    `💰 ${amount.toFixed(2)} RUB = ${amount.toFixed(2)} RUB.`
                );
            }

            const item = data.Valute[currency];

            if (!item) {
                return client.say(channel,
                    `❌ Валюта ${currency} не найдена.`
                );
            }

            const rate = item.Value / item.Nominal;
            const result = amount * rate;

            client.say(channel,
                `💰 ${amount} ${currency} = ${result.toFixed(2)} RUB по курсу ЦБ РФ.`
            );
        }

        // ----------------------------------
        // ПЕРЕВОД
        // ----------------------------------

        else if (['!перевод', '!translate'].includes(command)) {
            const from = (parts[1] || 'en').toLowerCase();
            const to = (parts[2] || 'ru').toLowerCase();
            const originalText = parts.slice(3).join(' ');

            if (!originalText) {
                return client.say(channel,
                    '🌍 Пример: !перевод en ru Hello world'
                );
            }

            const translated = await translateText(
                originalText,
                from,
                to
            );

            client.say(channel,
                `🌍 Перевод: ${translated}`
            );
        }

        // ----------------------------------
        // РЫБАЛКА
        // ----------------------------------

        else if (
            ['!рыбалка', '!рыба', '!fish'].includes(command)
        ) {
            client.say(channel, fishing(username));
        }

    } catch (error) {
        console.error(`Ошибка команды ${command}:`, error.message);

        client.say(channel,
            '⚠️ Не удалось выполнить команду. Попробуй немного позже.'
        );
    }
});

// ==========================================
// ЗАПУСК
// ==========================================

console.log('Бот запускается...');
