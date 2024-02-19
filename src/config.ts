/* eslint-disable no-console */
import { DoctextOptions } from './openapi'

export interface Config {
  defaultPageSize:     number
  allowedContentTypes: string[]

  openapi: {
    enabled: boolean,
    doctext: Required<DoctextOptions>
  }

  logger: Logger
}

export interface Logger {
  debug: (message: string, ...meta: any[]) => void
  info:  (message: string, ...meta: any[]) => void
  warn:  (message: string, ...meta: any[]) => void
  error: (message: string, ...meta: any[]) => void
}

const config: Config = {
  defaultPageSize:     50,
  allowedContentTypes: ['application/vnd.api+json', 'application/json'],

  openapi: {
    enabled: true,
    doctext: {
      marker: '"""',
    },
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
