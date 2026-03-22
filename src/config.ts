import RequestContext from './RequestContext'
/* eslint-disable no-console */
import { DoctextOptions } from './openapi'
import { Sort } from './types'

export interface Config {
  allowedContentTypes: string[]

  openapi: {
    enabled: boolean,
    doctext: Omit<DoctextOptions, 'whitelist' | 'blacklist'>
  }

  paramExtractors: {
    scope?: (context: RequestContext) => string | undefined
    filters?: (context: RequestContext) => Record<string, unknown>
    search?: (context: RequestContext) => string | undefined
    sorts?: (context: RequestContext) => Sort[]
  },

  logger: Logger
}

export interface Logger {
  debug: (message: string, ...meta: any[]) => void
  info:  (message: string, ...meta: any[]) => void
  warn:  (message: string, ...meta: any[]) => void
  error: (message: string, ...meta: any[]) => void
}

const config: Config = {
  allowedContentTypes: ['application/vnd.api+json', 'application/json'],

  paramExtractors: {},

  openapi: {
    enabled: true,
    doctext: {},
  },

  logger: {
    debug: (...args) => process.env.DEBUG ? console.debug(...args) : undefined,
    info:  console.log,
    warn:  console.warn,
    error: console.error,
  },
}
export default config

export function configure(cfg: Partial<Config>) {
  Object.assign(config, cfg)
}
