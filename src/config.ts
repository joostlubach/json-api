/* eslint-disable no-console */

export interface Config {
  defaultPageSize: number

  logger: Logger
}

export interface Logger {
  debug: (message: string, ...meta: any[]) => void
  info:  (message: string, ...meta: any[]) => void
  warn:  (message: string, ...meta: any[]) => void
  error: (message: string, ...meta: any[]) => void
}

const config: Config = {
  defaultPageSize: 50,

  logger: {
    debug: console.log,
    info:  console.log,
    warn:  console.warn,
    error: console.error,
  },
}
export default config

export function configure(cfg: Partial<Config>) {
  Object.assign(config, cfg)
}
