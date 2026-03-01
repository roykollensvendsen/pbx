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

Eksempel på åpning: "Hei, du har ringt Roy. Han er ikke tilgjengelig akkurat nå. Kan jeg ta imot en beskjed?"`;

class Brain {
  constructor() {
    this.client = new Anthropic();
    this.messages = [];
  }

  async respond(userText) {
    this.messages.push({ role: 'user', content: userText });

    let fullResponse = '';

    const stream = this.client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
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
      system: SYSTEM_PROMPT,
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
