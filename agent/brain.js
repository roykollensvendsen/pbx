'use strict';

const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const config = require('./config');
const { sendApiAlert } = require('./notify');
const log = require('./log');
const { leaveMessage, checkMessages, deleteMessages, messageSummary } = require('./messages');

function loadContacts() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'contacts.json'), 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    log.brain.error(`Failed to load contacts.json: ${e.message}`);
    return {};
  }
}

const SYSTEM_PROMPT = `Du er en hyggelig AI-assistent som svarer telefonen for familien Svendsen.

Familien i huset:
- Roy (pappa)
- Cesaria, også kalt Cecile (mamma) — tlf 46356099
- Lukas (sønn)
- Alana (datter)

Utvidet familie:
- Reidun Kollen Svendsen (farmor/mamma til Roy) — tlf 90777742
- Frode Svendsen (farfar/pappa til Roy) — tlf 95723043
- Anita Svendsen (tante, søster til Roy) — tlf 98499519, barn: Åsne og Signe, mann: Christoffer Bjarvin (tlf 40061319)
- Berit Svendsen (tante, søster til Roy) — tlf 90951956, barn: Madeleine og Amalie, mann: Petter Dalholt
- Bjørg (oldemor/farmor til Roy) — tlf 98408427

Hvis innringeren er en du kjenner fra denne listen, bruk fornavnet naturlig.
Hvis noen ber om å ringe en person fra familien, bruk kontaktlisten og make_call.

Viktige regler:
- Snakk alltid på norsk
- Vær kort og konsis — dette er en telefonsamtale, ikke en chat
- Hold svarene korte (1-3 setninger maks)
- Du kan ta imot beskjeder til familiemedlemmer — bruk leave_message-verktøyet
- Familiemedlemmer kan spørre om det er beskjeder til dem — bruk check_messages
- Familiemedlemmer kan slette beskjeder — bruk delete_messages
- Når noen legger igjen en beskjed, spør hvem den er til, hvem den er fra (hvis ukjent), og hva det gjelder
- Vær høflig og vennlig, men effektiv
- Ikke bruk markdown, emojis, eller spesialtegn — dette leses opp som tale
- Unngå lange pauser i setningene
- Du kan svare på spørsmål om klokka og været
- Du kan fortelle vitser hvis noen spør — hold dem korte og familievennlige
- Du kan søke på nettet for å svare på spørsmål du ikke vet svaret på — bruk web_search-verktøyet
- Når du bruker nettsøk, oppsummer svaret kort og konsist — husk at dette leses opp i en telefonsamtale`;

const WEB_SEARCH_TOOL = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 3,
};

const MAKE_CALL_TOOL = {
  name: 'make_call',
  description: 'Ring et telefonnummer for brukeren. Bekreft alltid nummeret med brukeren først. Si "Jeg kobler deg nå" rett før du bruker dette verktøyet.',
  input_schema: {
    type: 'object',
    properties: {
      phone_number: {
        type: 'string',
        description: 'Telefonnummeret som skal ringes (f.eks. "37012345")',
      },
    },
    required: ['phone_number'],
  },
};

const TRANSFER_CALL_TOOL = {
  name: 'transfer_call',
  description: 'Overfør innringeren til en intern linje. Si "Jeg setter deg over nå" rett før du bruker dette verktøyet.',
  input_schema: {
    type: 'object',
    properties: {
      extension: {
        type: 'string',
        description: 'Internnummeret (f.eks. "101")',
        enum: ['101', '102', '103'],
      },
    },
    required: ['extension'],
  },
};

const EXTENSION_DIRECTORY = {
  '101': 'Kontor',
  '102': 'Stue',
  '103': 'Garasje',
};

const LEAVE_MESSAGE_TOOL = {
  name: 'leave_message',
  description: 'Legg igjen en beskjed til et familiemedlem.',
  input_schema: {
    type: 'object',
    properties: {
      recipient: { type: 'string', description: 'Hvem beskjeden er til (f.eks. "Roy", "Cecile")' },
      from: { type: 'string', description: 'Hvem beskjeden er fra' },
      message: { type: 'string', description: 'Selve beskjeden' },
    },
    required: ['recipient', 'from', 'message'],
  },
};

const CHECK_MESSAGES_TOOL = {
  name: 'check_messages',
  description: 'Sjekk om det finnes beskjeder til et familiemedlem. Meldingene markeres automatisk som hørt.',
  input_schema: {
    type: 'object',
    properties: {
      recipient: { type: 'string', description: 'Hvem du sjekker beskjeder for (f.eks. "Roy")' },
    },
    required: ['recipient'],
  },
};

const DELETE_MESSAGES_TOOL = {
  name: 'delete_messages',
  description: 'Slett beskjeder for et familiemedlem. Bruk "heard" for å slette alle hørte, eller "all" for å slette alle.',
  input_schema: {
    type: 'object',
    properties: {
      recipient: { type: 'string', description: 'Hvem du sletter beskjeder for' },
      which: { type: 'string', description: '"heard" for hørte beskjeder, "all" for alle' },
    },
    required: ['recipient', 'which'],
  },
};

const MESSAGE_SUMMARY_TOOL = {
  name: 'message_summary',
  description: 'Vis en oversikt over hvilke familiemedlemmer som har beskjeder og hvor mange.',
  input_schema: {
    type: 'object',
    properties: {},
  },
};

const LOCAL_TOOLS = ['leave_message', 'check_messages', 'delete_messages', 'message_summary'];

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
    log.brain.info(`Weather: ${result}`);
    return result;
  } catch (err) {
    log.brain.error(`Failed to fetch weather: ${err.message}`);
    return null;
  }
}

class Brain {
  constructor(callerNumber, callerName, canMakeCall, canTransfer, callerExtension) {
    this.client = new Anthropic();
    this.messages = [];
    this.canMakeCall = canMakeCall || false;
    this.canTransfer = canTransfer || false;
    this.callerExtension = callerExtension || null;
    this.systemPrompt = SYSTEM_PROMPT;
    if (this.canTransfer) {
      const lines = Object.entries(EXTENSION_DIRECTORY).map(([ext, name]) => `  ${ext}: ${name}`).join('\n');
      this.systemPrompt += `\n- Du kan sette innringeren over til en intern linje — bruk transfer_call-verktøyet\n- Tilgjengelige linjer:\n${lines}\n- Når brukeren ber om å ringe eller bli satt over til et sted som matcher en intern linje (f.eks. "ring kontoret", "sett meg over til stua"), bruk ALLTID transfer_call — IKKE make_call eller nettsøk`;
      if (this.callerExtension && EXTENSION_DIRECTORY[this.callerExtension]) {
        this.systemPrompt += `\n- Innringeren ringer fra linje ${this.callerExtension} (${EXTENSION_DIRECTORY[this.callerExtension]}). Hvis de ber om å bli satt over til sin egen linje, si at de allerede er der — IKKE bruk transfer_call`;
      }
    }
    if (this.canMakeCall) {
      const contacts = loadContacts();
      const contactEntries = Object.entries(contacts);
      let contactInfo = '';
      if (contactEntries.length > 0) {
        const lines = contactEntries.map(([name, num]) => `  ${name}: ${num}`).join('\n');
        contactInfo = `\n- Du har tilgang til en kontaktliste — bruk denne før du søker på nett:\n${lines}`;
      }
      this.systemPrompt += `\n- Du kan ringe telefonnumre for brukeren — bruk make_call-verktøyet\n- Sjekk kontaktlisten først, deretter bruk nettsøk om nødvendig\n- Bekreft nummeret ÉN gang med brukeren. Når brukeren sier ja, ring, ok, eller lignende — bruk make_call UMIDDELBART. Ikke be om bekreftelse to ganger.\n- Si "Jeg kobler deg nå" og bruk make_call i samme svar${contactInfo}`;
    }
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

  _getTools() {
    const tools = [WEB_SEARCH_TOOL, LEAVE_MESSAGE_TOOL, CHECK_MESSAGES_TOOL, DELETE_MESSAGES_TOOL, MESSAGE_SUMMARY_TOOL];
    if (this.canMakeCall) tools.push(MAKE_CALL_TOOL);
    if (this.canTransfer) tools.push(TRANSFER_CALL_TOOL);
    return tools;
  }

  _executeLocalTool(name, input) {
    if (name === 'leave_message') {
      const entry = leaveMessage(input.recipient, input.from, input.message);
      return JSON.stringify({ success: true, id: entry.id, timestamp: entry.timestamp });
    }
    if (name === 'check_messages') {
      const msgs = checkMessages(input.recipient);
      if (msgs.length === 0) return JSON.stringify({ messages: [], summary: 'Ingen beskjeder.' });
      return JSON.stringify({ messages: msgs });
    }
    if (name === 'delete_messages') {
      const count = deleteMessages(input.recipient, input.which || 'heard');
      return JSON.stringify({ deleted: count });
    }
    if (name === 'message_summary') {
      const summary = messageSummary();
      if (Object.keys(summary).length === 0) return JSON.stringify({ summary: 'Ingen beskjeder til noen.' });
      return JSON.stringify(summary);
    }
    return JSON.stringify({ error: 'Unknown tool' });
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
        tools: this._getTools(),
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

    // Loop to handle local tool calls (message tools) with result feedback
    while (true) {
      let sentenceBuffer = '';
      let contentBlocks = [];
      let currentToolId = null;
      let currentToolName = null;
      let currentToolInput = '';
      let textAccum = '';

      try {
        const stream = this.client.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: this.systemPrompt,
          messages: this.messages,
          tools: this._getTools(),
        });

        for await (const event of stream) {
          if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
            // Save any accumulated text as a content block
            if (textAccum) {
              contentBlocks.push({ type: 'text', text: textAccum });
              textAccum = '';
            }
            currentToolId = event.content_block.id;
            currentToolName = event.content_block.name;
            currentToolInput = '';
          } else if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta') {
            currentToolInput += event.delta.partial_json;
          } else if (event.type === 'content_block_stop' && currentToolName) {
            let parsedInput = {};
            try { parsedInput = JSON.parse(currentToolInput); } catch (e) {}
            contentBlocks.push({
              type: 'tool_use',
              id: currentToolId,
              name: currentToolName,
              input: parsedInput,
            });
            currentToolName = null;
          } else if (event.type === 'content_block_start' && event.content_block?.type === 'text') {
            // text block starting
          } else if (event.type === 'content_block_delta' && event.delta?.text) {
            sentenceBuffer += event.delta.text;
            textAccum += event.delta.text;

            // Yield complete sentences for TTS
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
      if (textAccum) {
        contentBlocks.push({ type: 'text', text: textAccum });
      }

      // Find tool uses in this response
      const toolUses = contentBlocks.filter((b) => b.type === 'tool_use');

      // Store assistant message
      if (toolUses.length > 0) {
        this.messages.push({ role: 'assistant', content: contentBlocks });
      } else {
        const text = contentBlocks.filter((b) => b.type === 'text').map((b) => b.text).join('');
        this.messages.push({ role: 'assistant', content: text });
      }

      // Handle local tools (message tools) — execute ALL and feed results back
      const localTools = toolUses.filter((t) => LOCAL_TOOLS.includes(t.name));
      if (localTools.length > 0) {
        const results = localTools.map((tool) => {
          log.brain.info(`Tool: ${tool.name}(${JSON.stringify(tool.input)})`);
          const result = this._executeLocalTool(tool.name, tool.input);
          return { type: 'tool_result', tool_use_id: tool.id, content: result };
        });
        this.messages.push({ role: 'user', content: results });
        continue; // loop to get Claude's spoken response
      }

      // Handle action tools (make_call, transfer_call) — yield to server
      const actionTool = toolUses.find((t) => t.name === 'make_call' || t.name === 'transfer_call');
      if (actionTool) {
        if (actionTool.name === 'make_call' && actionTool.input.phone_number) {
          yield { type: 'make_call', phoneNumber: actionTool.input.phone_number };
        } else if (actionTool.name === 'transfer_call' && actionTool.input.extension) {
          yield { type: 'transfer_call', extension: actionTool.input.extension };
        }
      }

      break; // no more tool loops needed
    }
  }

  reset() {
    this.messages = [];
  }
}

module.exports = { Brain };
