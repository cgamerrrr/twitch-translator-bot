const tmi = require('tmi.js');
const axios = require('axios');

// =========================
// НАСТРОЙКИ TWITCH
// =========================

const opts = {
  identity: {
    username: 'cgamer_bot',
    password: process.env.TWITCH_OAUTH
  },
  channels: ['cgamer__']
};

const client = new tmi.Client(opts);

// =========================
// ВАЛЮТЫ
// =========================

const currencyDict = {
  'доллар': 'USD',
  'долларов': 'USD',
  'доллара': 'USD',
  'usd': 'USD',

  'евро': 'EUR',
  'евроов': 'EUR',
  'eur': 'EUR',

  'фунт': 'GBP',
  'фунтов': 'GBP',
  'gbp': 'GBP',

  'юань': 'CNY',
  'юаней': 'CNY',
  'cny': 'CNY'
};

// =========================
// ВРЕМЯ
// =========================

const cities = {
  'москва': 'Europe/Moscow',
  'казань': 'Europe/Moscow',
  'набережные челны': 'Europe/Moscow',
  'челны': 'Europe/Moscow',

  'лондон': 'Europe/London',
  'берлин': 'Europe/Berlin',
  'варшава': 'Europe/Warsaw',
  'париж': 'Europe/Paris',

  'пекин': 'Asia/Shanghai',
  'токио': 'Asia/Tokyo',
  'сеул': 'Asia/Seoul',

  'нью-йорк': 'America/New_York',
  'чикаго': 'America/Chicago',
  'лос-анджелес': 'America/Los_Angeles'
};

function getTime(city) {
  const key = city.toLowerCase().trim();
  const timezone = cities[key];

  if (!timezone) {
    return null;
  }

  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date());
}

// =========================
// ПОГОДА
// =========================

const weatherCodes = {
  0: 'Ясно',
  1: 'Преимущественно ясно',
  2: 'Переменная облачность',
  3: 'Пасмурно',
  45: 'Туман',
  48: 'Туман с изморозью',

  51: 'Морось',
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

  80: 'Ливень',
  81: 'Сильный ливень',
  82: 'Очень сильный ливень',

  85: 'Снегопад',
  86: 'Сильный снегопад',

  95: 'Гроза',
  96: 'Гроза с градом',
  99: 'Сильная гроза с градом'
};

async function getWeather(city) {
  try {
    // Сначала находим город
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

    if (
      !geoResponse.data ||
      !geoResponse.data.results ||
      geoResponse.data.results.length === 0
    ) {
      return `❌ Город «${city}» не найден.`;
    }

    const place = geoResponse.data.results[0];

    // Получаем погоду
    const weatherResponse = await axios.get(
      'https://api.open-meteo.com/v1/forecast',
      {
        params: {
          latitude: place.latitude,
          longitude: place.longitude,

          current:
            'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',

          wind_speed_unit: 'kmh',
          temperature_unit: 'celsius',
          timezone: 'auto'
        },

        timeout: 10000
      }
    );

    const current = weatherResponse.data.current;

    const description =
      weatherCodes[current.weather_code] || 'Неизвестно';

    return (
      `🌤️ Погода в ${place.name}: ` +
      `${description}, ` +
      `🌡️ ${Math.round(current.temperature_2m)}°C ` +
      `(ощущается как ${Math.round(current.apparent_temperature)}°C), ` +
      `💧 ${current.relative_humidity_2m}%, ` +
      `💨 ветер ${Math.round(current.wind_speed_10m)} км/ч`
    );

  } catch (error) {
    console.error(
      'Ошибка погоды:',
      error.response?.data || error.message
    );

    return '⚠️ Не удалось получить погоду. Попробуйте ещё раз через несколько секунд.';
  }
}

// =========================
// КУРС ВАЛЮТ
// =========================

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
    console.error('Ошибка курса:', error.message);
    return null;
  }
}

// =========================
// КОНВЕРТЕР ДЕНЕГ
// =========================

async function convertMoney(amount, fromCurrency, toCurrency) {
  try {
    const rates = await getRates();

    if (!rates) {
      return '⚠️ Не удалось получить курсы валют.';
    }

    fromCurrency = fromCurrency.toUpperCase();
    toCurrency = toCurrency.toUpperCase();

    // Рубль
    if (fromCurrency === 'RUB' && toCurrency === 'RUB') {
      return `💰 ${amount} RUB = ${amount} RUB`;
    }

    let rubValue;

    if (fromCurrency === 'RUB') {
      rubValue = amount;
    } else {
      if (!rates[fromCurrency]) {
        return `❌ Неизвестная валюта: ${fromCurrency}`;
      }

      const rate = rates[fromCurrency].Value;
      const nominal = rates[fromCurrency].Nominal;

      rubValue = amount * (rate / nominal);
    }

    if (toCurrency === 'RUB') {
      return `💰 ${amount} ${fromCurrency} = ${rubValue.toFixed(2)} ₽`;
    }

    if (!rates[toCurrency]) {
      return `❌ Неизвестная валюта: ${toCurrency}`;
    }

    const toRate = rates[toCurrency].Value;
    const toNominal = rates[toCurrency].Nominal;

    const result = rubValue / (toRate / toNominal);

    return `💰 ${amount} ${fromCurrency} = ${result.toFixed(2)} ${toCurrency}`;

  } catch (error) {
    console.error('Ошибка конвертера:', error.message);
    return '⚠️ Ошибка конвертации.';
  }
}

// =========================
// АВТОПЕРЕВОД
// =========================

async function translateText(text) {
  try {
    const response = await axios.get(
      'https://api.mymemory.translated.net/get',
      {
        params: {
          q: text,
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
    console.error('Ошибка перевода:', error.message);
    return null;
  }
}

// =========================
// ПОДКЛЮЧЕНИЕ
// =========================

client.connect()
  .then(() => {
    console.log('======================================');
    console.log('🤖 Twitch бот запущен!');
    console.log('======================================');
  })
  .catch(error => {
    console.error('Ошибка подключения Twitch:', error);
  });

// =========================
// СООБЩЕНИЯ
// =========================

client.on('message', async (channel, tags, message, self) => {

  if (self) return;

  const text = message.trim();
  const lower = text.toLowerCase();

  // =========================
  // !ПОМОЩЬ
  // =========================

  if (lower === '!помощь' || lower === '!help') {

    client.say(
      channel,
      '🤖 Возможности бота: 🌐 авто-перевод | 🕐 !time <город> — время | 🌤️ !weather <город> — погода | 💵 !rate <валюта> — курс ЦБ | 💰 !money <сумма> <из> <в> — конвертер'
    );

    return;
  }

  // =========================
  // !TIME
  // =========================

  if (lower.startsWith('!time ')) {

    const city = text.substring(6).trim();

    if (!city) {
      client.say(channel, '⏰ Использование: !time <город>');
      return;
    }

    const time = getTime(city);

    if (!time) {
      client.say(
        channel,
        `❌ Не знаю часовой пояс города «${city}».`
      );
      return;
    }

    client.say(
      channel,
      `🕐 Время в [${city}]: ${time}`
    );

    return;
  }

  // =========================
  // !WEATHER
  // =========================

  if (lower.startsWith('!weather ')) {

    const city = text.substring(9).trim();

    if (!city) {
      client.say(
        channel,
        '🌤️ Использование: !weather <город>'
      );
      return;
    }

    const weather = await getWeather(city);

    client.say(channel, weather);

    return;
  }

  // =========================
  // !RATE
  // =========================

  if (lower.startsWith('!rate ')) {

    const currencyName = text.substring(6).trim().toLowerCase();

    const currency =
      currencyDict[currencyName] || currencyName.toUpperCase();

    const rates = await getRates();

    if (!rates || !rates[currency]) {
      client.say(
        channel,
        `❌ Валюта «${currencyName}» не найдена. Используйте USD, EUR, GBP или CNY.`
      );
      return;
    }

    const item = rates[currency];

    const value = item.Value / item.Nominal;

    client.say(
      channel,
      `💵 ${item.Name}: ${value.toFixed(2)} ₽`
    );

    return;
  }

  // =========================
  // !MONEY
  // =========================

  if (lower.startsWith('!money ')) {

    const args = text.split(/\s+/);

    if (args.length < 4) {
      client.say(
        channel,
        '💰 Использование: !money <сумма> <из> <в>. Пример: !money 100 доллар рубль'
      );
      return;
    }

    const amount = parseFloat(
      args[1].replace(',', '.')
    );

    if (isNaN(amount)) {
      client.say(channel, '❌ Неверная сумма.');
      return;
    }

    const from =
      currencyDict[args[2].toLowerCase()] ||
      args[2].toUpperCase();

    const to =
      currencyDict[args[3].toLowerCase()] ||
      args[3].toUpperCase();

    const result = await convertMoney(
      amount,
      from,
      to
    );

    client.say(channel, result);

    return;
  }

  // =========================
  // АВТОПЕРЕВОД АНГЛИЙСКОГО
  // =========================

  // Не переводим команды
  if (text.startsWith('!')) {
    return;
  }

  // Переводим только сообщения,
  // которые явно похожи на английский текст
  const englishWords =
    text.match(
      /\b(the|this|that|hello|hi|how|what|where|when|why|you|your|are|is|am|can|will|please|thanks|thank|good|bad|weather|time|game|today)\b/gi
    );

  if (englishWords && englishWords.length >= 1) {

    const translated = await translateText(text);

    if (
      translated &&
      translated.toLowerCase() !== text.toLowerCase()
    ) {

      client.say(
        channel,
        `🌐 Перевод: ${translated}`
      );
    }
  }
});
