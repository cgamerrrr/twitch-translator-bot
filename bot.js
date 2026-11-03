const tmi = require('tmi.js');
const axios = require('axios');

const opts = {
  identity: { username: 'cgamer_bot', password: process.env.TWITCH_OAUTH },
  channels: ['cgamer__']
};

const currencyDict = { 
  'доллар': 'USD', 'долларов': 'USD', 'доллара': 'USD', 'usd': 'USD', 
  'рубль': 'RUB', 'рублей': 'RUB', 'рубля': 'RUB', 'rub': 'RUB', 'руб': 'RUB', 
  'евро': 'EUR', 'eur': 'EUR' 
};

const client = new tmi.client(opts);
client.on('message', onMessageHandler);
client.on('connected', (addr, port) => console.log(`* Бот успешно подключился к ${addr}:${port}`));
client.on('error', () => console.log('Ошибка сети Twitch, восстановление...'));
client.connect().catch(() => console.log('Ошибка подключения чата.'));

async function onMessageHandler(channel, tags, msg, self) {
  if (self) return; 

  const trimmedMsg = msg.replace(/[\r\n\x00-\x1F\x7F]+/g, ' ').replace(/\s+/g, ' ').trim();
  const lowerMsg = trimmedMsg.toLowerCase();
  
  const words = trimmedMsg.split(' ').filter(w => w.trim().length > 0);
  const wordsLower = lowerMsg.split(' ').filter(w => w.trim().length > 0);

  const authorName = tags['display-name'] || tags['username'];

  // --- БЛОК 1: КОМАНДЫ ---

  if (lowerMsg === '!помощь') {
    client.say(channel, `🤖 Способности бота: 🌐 1) Авто-перевод иностранного чата на русский. | 🕒 2) !time <город> — Время в 24ч (Пример: !time токио). | 🌤 3) !weather <город> — Погода в °C (Пример: !weather сочи). | 💵 4) !rate <валюта> — Курс ЦБ к рублю (usd, eur). | 💱 5) !money <сумма> <из> <в> — Конвертер (Пример: !money 100 доллар рубль).`);
    return;
  }
  if (lowerMsg === '!help') {
    client.say(channel, `🤖 Bot abilities: 🌐 1) Auto-translation to RU. | 🕒 2) !time <city> — Current time in 24h. | 🌤 3) !weather <city> — Weather in °C. | 💵 4) !rate <currency> — Rate to RUB. | 💱 5) !money <amount> <from> <to> — Currency converter.`);
    return;
  }

  if (lowerMsg.startsWith('!rate') || lowerMsg.startsWith('!курс')) {
    const rateCmd = [...wordsLower];
    rateCmd.shift(); 
    const rawCurrency = rateCmd.shift(); 
    const curr = (currencyDict[rawCurrency] || rawCurrency?.toUpperCase() || '').trim();
    if (!curr || curr.length < 3) return client.say(channel, `⚠ Укажите валюту. Пример: !rate usd`);
    try {
      const res = await axios.get('https://cbr-xml-daily.ru', { timeout: 5000 });
      if (res.data && res.data.Valute) {
        if (curr === 'RUB') return client.say(channel, `💵 Курс [1 RUB]: 1.00 RUB`);
        const valuteData = res.data.Valute[curr];
        if (valuteData) {
          client.say(channel, `💵 Курс ЦБ РФ [1 ${curr}]: ${(valuteData.Value / valuteData.Nominal).toFixed(2)} RUB`);
        } else {
          client.say(channel, `⚠ Не удалось найти валюту "${curr}" в базе ЦБ.`);
        }
      }
    } catch (e) { client.say(channel, `⚠ Ошибка сервиса валют.`); }
    return;
  }

  if (lowerMsg.startsWith('!money') || lowerMsg.startsWith('!конверт')) {
    const moneyCmd = [...wordsLower];
    moneyCmd.shift(); 
    const rawAmount = moneyCmd.shift(); 
    const rawFrom = moneyCmd.shift();   
    const rawTo = moneyCmd.shift();     

    const amount = parseFloat(rawAmount);
    const fromC = (currencyDict[rawFrom] || rawFrom?.toUpperCase() || '').trim();
    const toC = (currencyDict[rawTo] || rawTo?.toUpperCase() || '').trim();
    
    if (isNaN(amount) || !fromC || !toC) {
      return client.say(channel, `⚠ Использование: !money <сумма> <из> <в>. Пример: !money 100 доллар рубль`);
    }

    try {
      const res = await axios.get('https://cbr-xml-daily.ru', { timeout: 5000 });
      if (res.data && res.data.Valute) {
        let fromRateInRub = 1;
        if (fromC !== 'RUB') {
          const vFrom = res.data.Valute[fromC];
          if (!vFrom) return client.say(channel, `⚠ Неизвестная валюта: ${fromC}`);
          fromRateInRub = vFrom.Value / vFrom.Nominal;
        }

        let toRateInRub = 1;
        if (toC !== 'RUB') {
          const vTo = res.data.Valute[toC];
          if (!vTo) return client.say(channel, `⚠ Неизвестная валюта: ${toC}`);
          toRateInRub = vTo.Value / vTo.Nominal;
        }

        let finalResult = ((amount * fromRateInRub) / toRateInRub).toFixed(2);
        client.say(channel, `💱 Конвертация: ${amount} ${fromC} = ${finalResult} ${toC}`);
      }
    } catch (e) { client.say(channel, `⚠ Ошибка конвертации.`); }
    return;
  }

  // ОБНОВЛЕННАЯ СВЕРХСТАБИЛЬНАЯ ПОГОДА ЧЕРЕЗ OPEN-METEO API
  if (lowerMsg.startsWith('!weather') || lowerMsg.startsWith('!погода')) {
    let city = words.slice(1).join(' ').trim();
    if (!city) return client.say(channel, `⚠ Укажите город. Пример: !weather Москва`);
    
    try {
      // 1. Находим координаты города через бесплатное геокодирование
      const geoUrl = `https://open-meteo.com{encodeURIComponent(city)}&count=1&language=ru`;
      const geoRes = await axios.get(geoUrl, { timeout: 4000 });
      
      if (geoRes.data && geoRes.data.results && geoRes.data.results.length > 0) {
        const location = geoRes.data.results[0];
        const lat = location.latitude;
        const lon = location.longitude;
        const officialName = location.name;

        // 2. Запрашиваем точную текущую погоду по координатам
        const weatherUrl = `https://open-meteo.com{lat}&longitude=${lon}&current_weather=true`;
        const weatherRes = await axios.get(weatherUrl, { timeout: 4000 });

        if (weatherRes.data && weatherRes.data.current_weather) {
          const current = weatherRes.data.current_weather;
          const temp = current.temperature.toFixed(1);
          const wind = current.windspeed.toFixed(1);
          
          return client.say(channel, `🌤 Погода в [${officialName}]: Temperature: ${temp}°C | Wind: ${wind} km/h`);
        }
      }
      client.say(channel, `⚠ Не удалось получить данные о погоде для города "${city}".`);
    } catch (e) {
      client.say(channel, `⚠ Ошибка сервиса погоды.`);
    }
    return;
  }

  if (lowerMsg.startsWith('!time') || lowerMsg.startsWith('!время')) {
    let city = words.slice(1).join(' ').trim().toLowerCase();
    let opt = { hour: '2-digit', minute: '2-digit', hour12: false };
    if (!city) return client.say(channel, `🕒 Местное время: ${new Date().toLocaleTimeString('ru-RU', opt)}`);
    try {
      const geoUrl = `https://open-meteo.com{encodeURIComponent(city)}&count=1`;
      const geoRes = await axios.get(geoUrl, { timeout: 4000 });
      
      if (geoRes.data && geoRes.data.results && geoRes.data.results.length > 0) {
        const tz = geoRes.data.results[0].timezone;
        if (tz) opt.timeZone = tz;
      }
      
      const formattedTime = new Intl.DateTimeFormat('ru-RU', opt).format(new Date());
      client.say(channel, `🕒 Время в [${city.charAt(0).toUpperCase() + city.slice(1)}]: ${formattedTime}`);
    } catch (e) { client.say(channel, `⚠ Не удалось определить время.`); }
    return;
  }

  // --- БЛОК 2: АВТОПЕРЕВОДЧИК ЧАТА НА РУССКИЙ ---
  let textToTranslate = msg;
  if (tags.emotes) {
    const positions = [];
    for (const id in tags.emotes) {
      for (const range of tags.emotes[id]) {
        const [start, end] = range.split('-').map(Number);
        positions.push({ start, end });
      }
    }
    positions.sort((a, b) => b.start - a.start);
    let arr = Array.from(msg);
    for (const p of positions) arr.splice(p.start, p.end - p.start + 1);
    textToTranslate = arr.join('').replace(/\s+/g, ' ').trim();
  }
  
  if (!textToTranslate || textToTranslate.length < 2) return;

  try {
    const response = await axios.get('https://translated.net', {
      params: { q: textToTranslate, langpair: 'en|ru' },
      timeout: 4000
    });
    
    if (response.data && response.data.responseData && response.data.responseData.translatedText) {
      const translatedText = response.data.responseData.translatedText.trim();
      if (translatedText.toLowerCase() !== textToTranslate.toLowerCase()) {
        client.say(channel, `🌐 [Перевод] ${authorName}: ${translatedText}`);
      }
    }
  } catch (e) {
    console.log('Ошибка автоперевода:', e.message);
  }
}

function onConnectedHandler(addr, port) {
  console.log(`* Бот успешно подключился к ${addr}:${port}`);
}

const http = require('http');
http.createServer((req, res) => {
  res.writeHead(200, { 'Type': 'text/plain' });
  res.end('OK');
}).listen(process.env.PORT || 3000);
