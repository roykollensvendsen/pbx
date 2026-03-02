'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const config = require('./config');

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

Eksempel på åpning: "Hei, du har ringt Roy. Han er ikke tilgjengelig akkurat nå. Kan jeg ta imot en beskjed?"`;

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

async function fetchWeather() {
  try {
    const res = await fetch('https://wttr.in/Tvedestrand?format=3&lang=no');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = (await res.text()).trim();
    console.log(`[Brain] Weather: ${text}`);
    return text;
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

    const stream = this.client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system: this.systemPrompt,
      messages: this.messages,
    });

    const chunks = [];
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.text) {
        chunks.push(event.delta.text);
      }
    }

    fullResponse = chunks.join('');
    this.messages.push({ role: 'assistant', content: fullResponse });

    return fullResponse;
  }

  async *respondStreaming(userText) {
    this.messages.push({ role: 'user', content: userText });

    const stream = this.client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system: this.systemPrompt,
      messages: this.messages,
    });

    let fullResponse = '';
    let sentenceBuffer = '';

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
