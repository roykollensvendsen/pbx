'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const config = require('./config');
const { sendApiAlert } = require('./notify');

const SYSTEM_PROMPT = `Du er en hyggelig og profesjonell AI-resepsjonist som svarer telefonen for Roy.

Viktige regler:
- Snakk alltid på norsk
- Vær kort og konsis — dette er en telefonsamtale, ikke en chat
- Hold svarene korte (1-3 setninger maks)
- Presenter deg som Roys AI-assistent
- Tilby å ta imot en beskjed hvis Roy ikke er tilgjengelig
- Hvis noen vil legge igjen en beskjed, spør om navn, telefonnummer, og hva det gjelder
- Vær høflig og vennlig, men effektiv
- Ikke bruk markdown, emojis, eller spesialtegn — dette leses opp som tale
- Unngå lange pauser i setningene
- Du kan svare på spørsmål om klokka og været
- Du kan fortelle vitser hvis noen spør — hold dem korte og familievennlige
- Du kan søke på nettet for å svare på spørsmål du ikke vet svaret på — bruk web_search-verktøyet
- Når du bruker nettsøk, oppsummer svaret kort og konsist — husk at dette leses opp i en telefonsamtale

Eksempel på åpning: "Hei, du har ringt Roy. Han er ikke tilgjengelig akkurat nå. Kan jeg ta imot en beskjed?"`;

const WEB_SEARCH_TOOL = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 3,
};

const WEEKDAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];

function formatNorwegianTime() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Oslo' }));
  const day = WEEKDAYS[now.getDay()];
  const date = now.getDate();
  const month = MONTHS[now.getMonth()];
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${day} ${date}. ${month} ${year}, klokka ${hours}:${minutes}`;
}

const WEATHER_SYMBOLS = {
  clearsky: 'klarvær',
  fair: 'lettskyet',
  partlycloudy: 'delvis skyet',
  cloudy: 'skyet',
  lightrainshowers: 'lette regnbyger',
  rainshowers: 'regnbyger',
  heavyrainshowers: 'kraftige regnbyger',
  lightrainshowersandthunder: 'lette regnbyger og torden',
  rainshowersandthunder: 'regnbyger og torden',
  heavyrainshowersandthunder: 'kraftige regnbyger og torden',
  lightsleetshowers: 'lette sluddbyger',
  sleetshowers: 'sluddbyger',
  heavysleetshowers: 'kraftige sluddbyger',
  lightsnowshowers: 'lette snøbyger',
  snowshowers: 'snøbyger',
  heavysnowshowers: 'kraftige snøbyger',
  lightrain: 'lett regn',
  rain: 'regn',
  heavyrain: 'kraftig regn',
  lightrainandthunder: 'lett regn og torden',
  rainandthunder: 'regn og torden',
  heavyrainandthunder: 'kraftig regn og torden',
  lightsleet: 'lett sludd',
  sleet: 'sludd',
  heavysleet: 'kraftig sludd',
  lightsnow: 'lett snø',
  snow: 'snø',
  heavysnow: 'kraftig snø',
  fog: 'tåke',
};

async function fetchWeather() {
  try {
    // Tvedestrand: 58.6167°N, 8.9333°E
    const res = await fetch('https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=58.6167&lon=8.9333', {
      headers: { 'User-Agent': 'pbx-phone-agent github.com/roykollensvendsen/pbx' },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const now = data.properties.timeseries[0].data;
    const temp = Math.round(now.instant.details.air_temperature);
    const symbolCode = (now.next_1_hours || now.next_6_hours).summary.symbol_code;
    // Strip _day/_night/_polartwilight suffix
    const baseSymbol = symbolCode.replace(/_(day|night|polartwilight)$/, '');
    const description = WEATHER_SYMBOLS[baseSymbol] || baseSymbol;
    const result = `Tvedestrand: ${description}, ${temp} grader`;
    console.log(`[Brain] Weather: ${result}`);
    return result;
  } catch (err) {
    console.error(`[Brain] Failed to fetch weather: ${err.message}`);
    return null;
  }
}

class Brain {
  constructor(callerNumber, callerName) {
    this.client = new Anthropic();
    this.messages = [];
    this.systemPrompt = SYSTEM_PROMPT;
    if (callerName || callerNumber) {
      const parts = [];
      if (callerName) parts.push(`Navn: ${callerName}`);
      if (callerNumber) parts.push(`Nummer: ${callerNumber}`);
      this.systemPrompt += `\n\nInformasjon om innringeren:\n${parts.join('\n')}\n\nDu trenger ikke spørre om navn eller nummer hvis du allerede har det. Bruk navnet naturlig i samtalen.`;
    }
  }

  async init() {
    const time = formatNorwegianTime();
    this.systemPrompt += `\n\nNåværende tidspunkt: ${time}`;

    const weather = await fetchWeather();
    if (weather) {
      this.systemPrompt += `\nVæret akkurat nå: ${weather}`;
    }
  }

  async respond(userText) {
    this.messages.push({ role: 'user', content: userText });

    let fullResponse = '';

    try {
      const stream = this.client.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: this.systemPrompt,
        messages: this.messages,
        tools: [WEB_SEARCH_TOOL],
      });

      const chunks = [];
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta?.text) {
          chunks.push(event.delta.text);
        }
      }

      fullResponse = chunks.join('');
    } catch (err) {
      sendApiAlert('Anthropic Claude', err);
      throw err;
    }

    this.messages.push({ role: 'assistant', content: fullResponse });

    return fullResponse;
  }

  async *respondStreaming(userText) {
    this.messages.push({ role: 'user', content: userText });

    let fullResponse = '';
    let sentenceBuffer = '';

    try {
      const stream = this.client.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: this.systemPrompt,
        messages: this.messages,
        tools: [WEB_SEARCH_TOOL],
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta?.text) {
          sentenceBuffer += event.delta.text;
          fullResponse += event.delta.text;

          // Yield complete sentences for TTS (split on sentence-ending punctuation)
          const sentenceMatch = sentenceBuffer.match(/^(.*?[.!?]+)\s*(.*)/s);
          if (sentenceMatch) {
            yield sentenceMatch[1].trim();
            sentenceBuffer = sentenceMatch[2];
          }
        }
      }
    } catch (err) {
      sendApiAlert('Anthropic Claude', err);
      throw err;
    }

    // Yield any remaining text
    if (sentenceBuffer.trim()) {
      yield sentenceBuffer.trim();
    }

    this.messages.push({ role: 'assistant', content: fullResponse });
  }

  reset() {
    this.messages = [];
  }
}

module.exports = { Brain };
