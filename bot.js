
const tmi = require('tmi.js');
const axios = require('axios');
const http = require('http');

// ==================================================
// RENDER SERVER
// ==================================================

const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8'
  });
  res.end('Twitch bot is running!');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Server started on port ${PORT}`);
});

// ==================================================
// TWITCH SETTINGS
// ==================================================

if (!process.env.TWITCH_OAUTH) {
  console.error('❌ TWITCH_OAUTH не найден в Environment!');
  process.exit(1);
}

const client = new tmi.Client({
  options: {
    messagesLogLevel: 'info'
  },
  connection: {
    reconnect: true,
    secure: true
  },
  identity: {
    username: 'cgamer_bot',
    password: process.env.TWITCH_OAUTH
  },
  channels: ['cgamer__']
});

// ==================================================
// CURRENCY DICTIONARY
// ==================================================

const currencyDict = {
  'доллар': 'USD',
  'доллара': 'USD',
  'долларов': 'USD',
  'бакс': 'USD',
  'бакса': 'USD',
  'баксов': 'USD',
  'usd': 'USD',

  'евро': 'EUR',
  'eur': 'EUR',

  'фунт': 'GBP',
  'фунта': 'GBP',
  'фунтов': 'GBP',
  'gbp': 'GBP',

  'юань': 'CNY',
  'юаня': 'CNY',
  'юаней': 'CNY',
  'cny': 'CNY',

  'рубль': 'RUB',
  'рубля': 'RUB',
  'рублей': 'RUB',
  'руб': 'RUB',
  'рубли': 'RUB',
  'rur': 'RUB',
  'rub': 'RUB'
};

// ==================================================
// CITIES AND TIMEZONES
// ==================================================

const cities = {
  'москва': 'Europe/Moscow',
  'казань': 'Europe/Moscow',
  'набережные челны': 'Europe/Moscow',
  'челны': 'Europe/Moscow',
  'уфа': 'Asia/Yekaterinburg',
  'екатеринбург': 'Asia/Yekaterinburg',
  'челябинск': 'Asia/Yekaterinburg',
  'пермь': 'Asia/Yekaterinburg',
  'самара': 'Europe/Samara',
  'саратов': 'Europe/Saratov',
  'волгоград': 'Europe/Volgograd',
  'калининград': 'Europe/Kaliningrad',
  'омск': 'Asia/Omsk',
  'новосибирск': 'Asia/Novosibirsk',
  'красноярск': 'Asia/Krasnoyarsk',
  'иркутск': 'Asia/Irkutsk',
  'якутск': 'Asia/Yakutsk',
  'владивосток': 'Asia/Vladivostok',

  'лондон': 'Europe/London',
  'берлин': 'Europe/Berlin',
  'варшава': 'Europe/Warsaw',
  'париж': 'Europe/Paris',
  'рим': 'Europe/Rome',
  'мадрид': 'Europe/Madrid',
  'амстердам': 'Europe/Amsterdam',
  'прага': 'Europe/Prague',
  'вена': 'Europe/Vienna',
  'стамбул': 'Europe/Istanbul',
  'афины': 'Europe/Athens',
  'хельсинки': 'Europe/Helsinki',
  'стокгольм': 'Europe/Stockholm',
  'осло': 'Europe/Oslo',
  'киев': 'Europe/Kyiv',
  'минск': 'Europe/Minsk',

  'пекин': 'Asia/Shanghai',
  'шанхай': 'Asia/Shanghai',
  'гонконг': 'Asia/Hong_Kong',
  'токио': 'Asia/Tokyo',
  'сеул': 'Asia/Seoul',
  'сингапур': 'Asia/Singapore',
  'бангкок': 'Asia/Bangkok',
  'дубай': 'Asia/Dubai',
  'дели': 'Asia/Kolkata',
  'мумбаи': 'Asia/Kolkata',

  'нью-йорк': 'America/New_York',
  'нью йорк': 'America/New_York',
  'new york': 'America/New_York',
  'new-york': 'America/New_York',
  'nyc': 'America/New_York',

  'чикаго': 'America/Chicago',
  'лос-анджелес': 'America/Los_Angeles',
  'лос анджелес': 'America/Los_Angeles',
  'los angeles': 'America/Los_Angeles',
  'майами': 'America/New_York',
  'торонто': 'America/Toronto',
  'ванкувер': 'America/Vancouver',
  'мехико': 'America/Mexico_City',

  'сидней': 'Australia/Sydney',
  'мельбурн': 'Australia/Melbourne',
  'окленд': 'Pacific/Auckland'
};

// ==================================================
// NORMALIZE CITY
// ==================================================

function normalizeCity(city) {
  return city
    .toLowerCase()
    .trim()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
}

// ==================================================
// TIME
// ==================================================

function getTime(city) {
  const key = normalizeCity(city);
  const timezone = cities[key];

  if (!timezone) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(new Date());

  } catch (error) {
    console.error('Time error:', error.message);
    return null;
  }
}

// ==================================================
// WEATHER
// ==================================================

const weatherCodes = {
  0: 'Ясно',
  1: 'Преимущественно ясно',
  2: 'Переменная облачность',
  3: 'Пасмурно',
  45: 'Туман',
  48: 'Туман с изморозью',
  51: 'Небольшая морось',
  53: 'Морось',
  55: 'Сильная морось',
  56: 'Ледяная морось',
  57: 'Сильная ледяная морось',
  61: 'Небольшой дождь',
  63: 'Дождь',
  65: 'Сильный дождь',
  66: 'Ледяной дождь',
  67: 'Сильный ледяной дождь',
  71: 'Небольшой снег',
  73: 'Снег',
  75: 'Сильный снег',
  77: 'Снежные зёрна',
  80: 'Небольшой ливень',
  81: 'Ливень',
  82: 'Сильный ливень',
  85: 'Снегопад',
  86: 'Сильный снегопад',
  95: 'Гроза',
  96: 'Гроза с градом',
  99: 'Сильная гроза с градом'
};

async function getWeather(city) {
  try {
    const geoResponse = await axios.get(
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

    const results = geoResponse.data.results;

    if (!results || results.length === 0) {
      return `❌ Город «${city}» не найден.`;
    }

    const place = results[0];

    const weatherResponse = await axios.get(
      'https://api.open-meteo.com/v1/forecast',
      {
        params: {
          latitude: place.latitude,
          longitude: place.longitude,
          current:
            'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
          temperature_unit: 'celsius',
          wind_speed_unit: 'kmh',
          timezone: 'auto'
        },
        timeout: 10000
      }
    );

    const current = weatherResponse.data.current;

    if (!current) {
      throw new Error('Weather data unavailable');
    }

    const description =
      weatherCodes[current.weather_code] || 'Неизвестно';

    return (
      `🌤️ Погода в ${place.name}: ${description}, ` +
      `🌡️ ${Math.round(current.temperature_2m)}°C, ` +
      `ощущается как ${Math.round(current.apparent_temperature)}°C, ` +
      `💧 влажность ${current.relative_humidity_2m}%, ` +
      `💨 ветер ${Math.round(current.wind_speed_10m)} км/ч`
    );

  } catch (error) {
    console.error(
      'Weather error:',
      error.response?.data || error.message
    );

    return '⚠️ Ошибка получения погоды. Попробуйте позже.';
  }
}

// ==================================================
// CENTRAL BANK RATES
// ==================================================

async function getRates() {
  try {
    const response = await axios.get(
      'https://www.cbr-xml-daily.ru/daily_json.js',
      {
        timeout: 10000
      }
    );

    return response.data.Valute;

  } catch (error) {
    console.error('Rates error:', error.message);
    return null;
  }
}

// ==================================================
// SINGLE CURRENCY RATE
// ==================================================

async function getRate(currencyName) {
  const currency =
    currencyDict[currencyName.toLowerCase()] ||
    currencyName.toUpperCase();

  if (currency === 'RUB') {
    return '💵 Российский рубль: 1.00 ₽';
  }

  const rates = await getRates();

  if (!rates || !rates[currency]) {
    return `❌ Валюта «${currencyName}» не найдена.`;
  }

  const item = rates[currency];

  const value = item.Value / item.Nominal;

  return `💵 ${item.Name}: ${value.toFixed(2)} ₽`;
}

// ==================================================
// MONEY CONVERTER
// ==================================================

async function convertMoney(amount, fromCurrency, toCurrency) {
  try {
    const rates = await getRates();

    if (!rates) {
      return '⚠️ Не удалось получить курсы валют.';
    }

    if (fromCurrency === toCurrency) {
      return `💰 ${amount} ${fromCurrency} = ${amount} ${toCurrency}`;
    }

    let rubValue;

    if (fromCurrency === 'RUB') {
      rubValue = amount;

    } else {
      if (!rates[fromCurrency]) {
        return `❌ Неизвестная валюта: ${fromCurrency}`;
      }

      const item = rates[fromCurrency];

      rubValue =
        amount * (item.Value / item.Nominal);
    }

    if (toCurrency === 'RUB') {
      return `💰 ${amount} ${fromCurrency} = ${rubValue.toFixed(2)} ₽`;
    }

    if (!rates[toCurrency]) {
      return `❌ Неизвестная валюта: ${toCurrency}`;
    }

    const target = rates[toCurrency];

    const result =
      rubValue / (target.Value / target.Nominal);

    return `💰 ${amount} ${fromCurrency} = ${result.toFixed(2)} ${toCurrency}`;

  } catch (error) {
    console.error('Converter error:', error.message);
    return '⚠️ Ошибка конвертации.';
  }
}

// ==================================================
// TRANSLATION
// ==================================================

async function translateText(message) {
  try {
    const response = await axios.get(
      'https://api.mymemory.translated.net/get',
      {
        params: {
          q: message,
          langpair: 'en|ru'
        },
        timeout: 10000
      }
    );

    if (
      response.data &&
      response.data.responseData &&
      response.data.responseData.translatedText
    ) {
      return response.data.responseData.translatedText;
    }

    return null;

  } catch (error) {
    console.error('Translation error:', error.message);
    return null;
  }
}

// ==================================================
// TWITCH CONNECTION
// ==================================================

client.on('connected', (address, port) => {
  console.log('================================');
  console.log('🤖 Twitch бот запущен!');
  console.log('📺 Канал: cgamer__');
  console.log('================================');
});

client.on('disconnected', (reason) => {
  console.log('Twitch disconnected:', reason);
});

client.connect().catch(error => {
  console.error('Twitch connection error:', error);
});

// ==================================================
// CHAT MESSAGE HANDLER
// ==================================================

client.on('message', async (channel, tags, message, self) => {
  if (self) return;

  const text = message.trim();
  const lower = text.toLowerCase();

  if (!text) return;

  try {

    // ==============================================
    // HELP
    // ==============================================

    if (lower === '!помощь' || lower === '!help') {
      await client.say(
        channel,
        '🤖 Команды: !погода <город> | !время <город> | !курс <валюта> | !деньги <сумма> <из> <в> | также доступны английские варианты !weather, !time, !rate, !money'
      );
      return;
    }

    // ==============================================
    // WEATHER
    // ==============================================

    const weatherMatch = text.match(/^!(?:погода|weather)\s+(.+)$/i);

    if (weatherMatch) {
      const city = weatherMatch[1].trim();
      const result = await getWeather(city);
      await client.say(channel, result);
      return;
    }

    if (lower === '!погода' || lower === '!weather') {
      await client.say(channel, '🌤️ Использование: !погода <город>');
      return;
    }

    // ==============================================
    // TIME
    // ==============================================

    const timeMatch = text.match(/^!(?:время|time)\s+(.+)$/i);

    if (timeMatch) {
      const city = timeMatch[1].trim();
      const time = getTime(city);

      if (!time) {
        await client.say(
          channel,
          `❌ Не знаю часовой пояс города «${city}».`
        );
        return;
      }

      await client.say(
        channel,
        `🕐 Время в [${city}]: ${time}`
      );
      return;
    }

    if (lower === '!время' || lower === '!time') {
      await client.say(channel, '⏰ Использование: !время <город>');
      return;
    }

    // ==============================================
    // RATE
    // ==============================================

    const rateMatch = text.match(/^!(?:курс|rate)\s+(.+)$/i);

    if (rateMatch) {
      const currency = rateMatch[1].trim();
      const result = await getRate(currency);

      await client.say(channel, result);
      return;
    }

    if (lower === '!курс' || lower === '!rate') {
      await client.say(channel, '💵 Использование: !курс <валюта>');
      return;
    }

    // ==============================================
    // MONEY CONVERTER
    // ==============================================

    const moneyMatch = text.match(
      /^!(?:деньги|money)\s+(\d+(?:[.,]\d+)?)\s+(\S+)\s+(\S+)$/i
    );

    if (moneyMatch) {
      const amount = Number(
        moneyMatch[1].replace(',', '.')
      );

      if (!Number.isFinite(amount) || amount <= 0) {
        await client.say(channel, '❌ Укажите корректную сумму больше нуля.');
        return;
      }

      const from =
        currencyDict[moneyMatch[2].toLowerCase()] ||
        moneyMatch[2].toUpperCase();

      const to =
        currencyDict[moneyMatch[3].toLowerCase()] ||
        moneyMatch[3].toUpperCase();

      const result = await convertMoney(amount, from, to);

      await client.say(channel, result);
      return;
    }

    if (lower.startsWith('!деньги') || lower.startsWith('!money')) {
      await client.say(
        channel,
        '💰 Использование: !деньги <сумма> <из> <в>. Например: !деньги 100 доллар рубль'
      );
      return;
    }

    // ==============================================
    // DO NOT TRANSLATE COMMANDS
    // ==============================================

    if (text.startsWith('!')) return;

    // ==============================================
    // AUTOMATIC ENGLISH TRANSLATION
    // ==============================================

    const englishWords = text.match(
      /\b(the|this|that|hello|hi|how|what|where|when|why|you|your|are|is|am|can|will|please|thanks|thank|good|bad|weather|time|game|today)\b/gi
    );

    if (englishWords && englishWords.length >= 1) {
      const translated = await translateText(text);

      if (
        translated &&
        translated.toLowerCase() !== text.toLowerCase()
      ) {
        await client.say(
          channel,
          `🌐 Перевод: ${translated}`
        );
      }
    }

  } catch (error) {
    console.error('Message handler error:', error);

    try {
      await client.say(
        channel,
        '⚠️ Произошла ошибка при обработке команды.'
      );
    } catch (sendError) {
      console.error('Chat send error:', sendError.message);
    }
  }
});
