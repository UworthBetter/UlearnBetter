/**
 * Build a CopilotKit service adapter from resolved config.
 *
 * Each adapter is constructed with a provider SDK client (or credentials)
 * wired to the configured key/base URL. Construction does not perform a
 * network call, so an invalid key surfaces only on the first real request
 * (reported to the client, never swapped for a mock answer).
 *
 * Tested path: anthropic and openai / openai-compatible (bundled SDKs).
 * google and groq are wired but untested; groq needs the optional `groq-sdk`
 * peer dependency installed.
 */

import {
  AnthropicAdapter,
  OpenAIAdapter,
  GoogleGenerativeAIAdapter,
  GroqAdapter,
} from '@copilotkit/runtime'

export async function buildServiceAdapter(config) {
  switch (config.adapter) {
    case 'anthropic': {
      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      const client = new Anthropic({
        apiKey: config.apiKey,
        ...(config.baseURL ? { baseURL: config.baseURL } : {}),
      })
      return new AnthropicAdapter({ anthropic: client, model: config.model })
    }
    case 'openai': {
      // Covers both native OpenAI and OpenAI-compatible endpoints (DeepSeek,
      // ModelScope, Moonshot, local vLLM, ...) via an explicit baseURL.
      const { default: OpenAI } = await import('openai')
      const client = new OpenAI({
        apiKey: config.apiKey,
        ...(config.baseURL ? { baseURL: config.baseURL } : {}),
      })
      return new OpenAIAdapter({ openai: client, model: config.model })
    }
    case 'google': {
      // The adapter builds its own client from apiKey + model string.
      return new GoogleGenerativeAIAdapter({ apiKey: config.apiKey, model: config.model })
    }
    case 'groq': {
      let Groq
      try {
        ;({ default: Groq } = await import('groq-sdk'))
      } catch {
        throw new Error(
          'Provider "groq" requires the optional dependency "groq-sdk". Install it in server/ (npm install groq-sdk) and retry.',
        )
      }
      const client = new Groq({
        apiKey: config.apiKey,
        ...(config.baseURL ? { baseURL: config.baseURL } : {}),
      })
      return new GroqAdapter({ groq: client, model: config.model })
    }
    default:
      throw new Error(`Unsupported adapter "${config.adapter}".`)
  }
}
