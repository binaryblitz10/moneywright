/**
 * OpenRouter model catalog
 * Fetches the live model list from OpenRouter (public endpoint, no API key needed)
 */

import { logger } from '../lib/logger'
import { getProviderModels, type AIModel } from '../lib/ai'

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'
const CACHE_TTL_MS = 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 5000

interface OpenRouterApiModel {
  id: string
  name: string
  architecture?: { output_modalities?: string[] }
  supported_parameters?: string[]
}

let cache: { models: AIModel[]; fetchedAt: number } | null = null

/**
 * Convert an OpenRouter catalog entry to an AIModel.
 * Returns null for models the app can't use (non-text output or no tool support).
 */
function toAIModel(model: OpenRouterApiModel): AIModel | null {
  const params = model.supported_parameters ?? []
  const outputs = model.architecture?.output_modalities ?? ['text']
  if (!outputs.includes('text') || !params.includes('tools')) return null

  return {
    id: model.id,
    name: model.name,
    supportsParsing: params.includes('structured_outputs') || params.includes('response_format'),
  }
}

/**
 * Get OpenRouter models. Uses an in-memory cache and falls back to the
 * built-in list if OpenRouter can't be reached.
 */
export async function getOpenRouterModels(): Promise<AIModel[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.models

  try {
    const response = await fetch(OPENROUTER_MODELS_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const body = (await response.json()) as { data?: OpenRouterApiModel[] }
    const models = (body.data ?? [])
      .map(toAIModel)
      .filter((m): m is AIModel => m !== null)
      .sort((a, b) => a.name.localeCompare(b.name))

    if (models.length === 0) throw new Error('Empty model list')

    cache = { models, fetchedAt: Date.now() }
    return models
  } catch (error) {
    logger.warn('[OpenRouter] Failed to fetch live model list, using built-in list', {
      error: error instanceof Error ? error.message : String(error),
    })
    return cache?.models ?? getProviderModels('openrouter')
  }
}
