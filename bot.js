const tmi = require('tmi.js');
const axios = require('axios');
const http = require('http');

// ==================================================
// RENDER — ОТКРЫВАЕМ ПОРТ
// ==================================================

const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8'
  });

  res.end('Twitch bot is running!');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Web server запущен на порту ${PORT}`);
});

// ==================================================
// НАСТРОЙКИ TWITCH
// ==================================================

const opts = {
  identity: {
    username: 'cgamer_bot',
    password: process.env.TWITCH_OAUTH
  },
  channels: ['cgamer__']
};

const client = new tmi.Client(opts);

// ==================================================
// ВАЛЮТЫ
// ==================================================

const currencyDict = {
  'доллар': 'USD',
  'доллара': 'USD',
  'долларов': 'USD',
  'бакс': 'USD',
  'баксов': 'USD',
  'usd': 'USD',

  'евро': 'EUR',
  'евро': 'EUR',
  'eur': 'EUR',

  'фунт': 'GBP',
  'фунта': 'GBP',
  'фунтов': 'GBP',
  'gbp': 'GBP',

  'юань': 'CNY',
  'юаня': 'CNY',
  'юаней': 'CNY',
  'cny': 'CNY'
};

// ==================================================
// ГОРОДА И ЧАСОВЫЕ ПОЯСА
// ==================================================

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

// ==================================================
// ПОГОДА
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
    // ----------------------------------------------
    // Ищем город
    // ----------------------------------------------

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

    // ----------------------------------------------
    // Получаем погоду
    // ----------------------------------------------

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

    const description =
      weatherCodes[current.weather_code] || 'Неизвестно';

    const temperature =
      Math.round(current.temperature_2m);

    const feelsLike =
      Math.round(current.apparent_temperature);

    const humidity =
      Math.round(current.relative_humidity_2m);

    const wind =
      Math.round(current.wind_speed_10m);

    return (
      `🌤️ Погода в ${place.name}: ` +
      `${description}, ` +
      `🌡️ ${temperature}°C, ` +
      `ощущается как ${feelsLike}°C, ` +
      `💧 влажность ${humidity}%, ` +
      `💨 ветер ${wind} км/ч`
    );

  } catch (error) {

    console.error(
      '❌ Ошибка погоды:',
      error.response?.data || error.message
    );

    return '⚠️ Ошибка получения погоды. Попробуйте ещё раз.';
  }
}

// ==================================================
// КУРСЫ ЦБ
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

    console.error(
      '❌ Ошибка курса:',
      error.message
    );

    return null;
  }
}

// ==================================================
// КУРС ВАЛЮТЫ
// ==================================================

async function getRate(currencyName) {

  const currency =
    currencyDict[currencyName.toLowerCase()] ||
    currencyName.toUpperCase();

  const rates = await getRates();

  if (!rates || !rates[currency]) {
    return `❌ Валюта «${currencyName}» не найдена.`;
  }

  const item = rates[currency];

  const value =
    item.Value / item.Nominal;

  return (
    `💵 ${item.Name}: ${value.toFixed(2)} ₽`
  );
}

// ==================================================
// КОНВЕРТЕР
// ==================================================

async function convertMoney(
  amount,
  fromCurrency,
  toCurrency
) {

  try {

    const rates = await getRates();

    if (!rates) {
      return '⚠️ Не удалось получить курсы валют.';
    }

    fromCurrency =
      fromCurrency.toUpperCase();

    toCurrency =
      toCurrency.toUpperCase();

    // ----------------------------------------------
    // RUB → RUB
    // ----------------------------------------------

    if (
      fromCurrency === 'RUB' &&
      toCurrency === 'RUB'
    ) {
      return (
        `💰 ${amount} RUB = ${amount} RUB`
      );
    }

    // ----------------------------------------------
    // Исходная сумма → рубли
    // ----------------------------------------------

    let rubValue;

    if (fromCurrency === 'RUB') {

      rubValue = amount;

    } else {

      if (!rates[fromCurrency]) {
        return `❌ Неизвестная валюта: ${fromCurrency}`;
      }

      const rate =
        rates[fromCurrency].Value;

      const nominal =
        rates[fromCurrency].Nominal;

      rubValue =
        amount * (rate / nominal);
    }

    // ----------------------------------------------
    // Рубли → RUB
    // ----------------------------------------------

    if (toCurrency === 'RUB') {

      return (
        `💰 ${amount} ${fromCurrency} = ` +
        `${rubValue.toFixed(2)} ₽`
      );
    }

    // ----------------------------------------------
    // Рубли → другая валюта
    // ----------------------------------------------

    if (!rates[toCurrency]) {
      return `❌ Неизвестная валюта: ${toCurrency}`;
    }

    const toRate =
      rates[toCurrency].Value;

    const toNominal =
      rates[toCurrency].Nominal;

    const result =
      rubValue / (toRate / toNominal);

    return (
      `💰 ${amount} ${fromCurrency} = ` +
      `${result.toFixed(2)} ${toCurrency}`
    );

  } catch (error) {

    console.error(
      '❌ Ошибка конвертера:',
      error.message
    );

    return '⚠️ Ошибка конвертации.';
  }
}

// ==================================================
// АВТОПЕРЕВОД
// ==================================================

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

    console.error(
      '❌ Ошибка перевода:',
      error.message
    );

    return null;
  }
}

// ==================================================
// ПОДКЛЮЧЕНИЕ TWITCH
// ==================================================

client.connect()
  .then(() => {

    console.log('======================================');
    console.log('🤖 Twitch бот запущен!');
    console.log('📺 Канал: cgamer__');
    console.log('======================================');

  })
  .catch(error => {

    console.error(
      '❌ Ошибка подключения Twitch:',
      error
    );

  });

// ==================================================
// СООБЩЕНИЯ ЧАТА
// ==================================================

client.on(
  'message',
  async (channel, tags, message, self) => {

    // Не реагируем на свои сообщения
    if (self) return;

    const text = message.trim();
    const lower = text.toLowerCase();

    // ==================================================
    // ПОМОЩЬ
    // ==================================================

    if (
      lower === '!помощь' ||
      lower === '!help'
    ) {

      await client.say(
        channel,
        '🤖 Команды: !погода <город> | !weather <город> | !время <город> | !time <город> | !курс <валюта> | !rate <валюта> | !деньги <сумма> <из> <в> | !money <сумма> <из> <в>'
      );

      return;
    }

    // ==================================================
    // ПОГОДА
    // !погода Варшава
    // !weather Варшава
    // ==================================================

    if (
      lower.startsWith('!погода ') ||
      lower.startsWith('!weather ')
    ) {

      let city;

      if (lower.startsWith('!погода ')) {
        city = text.substring(8).trim();
      } else {
        city = text.substring(9).trim();
      }

      if (!city) {

        await client.say(
          channel,
          '🌤️ Использование: !погода <город>'
        );

        return;
      }

      const weather =
        await getWeather(city);

      await client.say(
        channel,
        weather
      );

      return;
    }

    // ==================================================
    // ВРЕМЯ
    // !время Пекин
    // !time Пекин
    // ==================================================

    if (
      lower.startsWith('!время ') ||
      lower.startsWith('!time ')
    ) {

      let city;

      if (lower.startsWith('!время ')) {
        city = text.substring(7).trim();
      } else {
        city = text.substring(6).trim();
      }

      if (!city) {

        await client.say(
          channel,
          '⏰ Использование: !время <город>'
        );

        return;
      }

      const time =
        getTime(city);

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

    // ==================================================
    // КУРС
    // !курс доллар
    // !rate доллар
    // ==================================================

    if (
      lower.startsWith('!курс ') ||
      lower.startsWith('!rate ')
    ) {

      let currencyName;

      if (lower.startsWith('!курс ')) {
        currencyName =
          text.substring(6).trim();
      } else {
        currencyName =
          text.substring(6).trim();
      }

      if (!currencyName) {

        await client.say(
          channel,
          '💵 Использование: !курс <валюта>'
        );

        return;
      }

      const result =
        await getRate(currencyName);

      await client.say(
        channel,
        result
      );

      return;
    }

    // ==================================================
    // ДЕНЬГИ
    // !деньги 100 доллар рубль
    // !money 100 доллар рубль
    // ==================================================

    if (
      lower.startsWith('!деньги ') ||
      lower.startsWith('!money ')
    ) {

      const args =
        text.split(/\s+/);

      if (args.length < 4) {

        await client.say(
          channel,
          '💰 Использование: !деньги <сумма> <из> <в>. Например: !деньги 100 доллар рубль'
        );

        return;
      }

      const amount =
        parseFloat(
          args[1].replace(',', '.')
        );

      if (isNaN(amount)) {

        await client.say(
          channel,
          '❌ Неверная сумма.'
        );

        return;
      }

      const from =
        currencyDict[
          args[2].toLowerCase()
        ] ||
        args[2].toUpperCase();

      const to =
        currencyDict[
          args[3].toLowerCase()
        ] ||
        args[3].toUpperCase();

      const result =
        await convertMoney(
          amount,
          from,
          to
        );

      await client.say(
        channel,
        result
      );

      return;
    }

    // ==================================================
    // НЕ ПЕРЕВОДИМ КОМАНДЫ
    // ==================================================

    if (text.startsWith('!')) {
      return;
    }

    // ==================================================
    // АВТОПЕРЕВОД АНГЛИЙСКОГО
    // ==================================================

    const englishWords =
      text.match(
        /\b(the|this|that|hello|hi|how|what|where|when|why|you|your|are|is|am|can|will|please|thanks|thank|good|bad|weather|time|game|today)\b/gi
      );

    if (
      englishWords &&
      englishWords.length >= 1
    ) {

      const translated =
        await translateText(text);

      if (
        translated &&
        translated.toLowerCase() !==
        text.toLowerCase()
      ) {

        await client.say(
          channel,
          `🌐 Перевод: ${translated}`
        );
      }
    }
  }
);
