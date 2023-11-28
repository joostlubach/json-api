import { isArray } from 'lodash'

import { BeforeHandler, ResourceConfig } from './ResourceConfig'

export function middleware<M = any, Q = any>(mw: Middleware<M, Q>) {
  return mw
}

export namespace middleware {

  export function first<M = any, Q = any>(handler: BeforeHandler): Middleware<M, Q> {
    return config => {
      config.before ??= []
      config.before.unshift(handler)
    }
  }

  export function before<M = any, Q = any>(handler: BeforeHandler): Middleware<M, Q> {
    return config => {
      config.before ??= []
      config.before.push(handler)
    }
  }

}

export function compose<M, Q>(pre: Middleware<M, Q>[], config: ResourceConfig<M, Q>, ...post: Middleware<M, Q>[]): ResourceConfig<M, Q>
export function compose<M, Q>(config: ResourceConfig<M, Q>, ...post: Middleware<M, Q>[]): ResourceConfig<M, Q>
export function compose<M, Q>(...args: any[]) {
  const pre:    Middleware<M, Q>[] = isArray(args[0]) ? args.shift() : []
  const config: ResourceConfig<M, Q> = args.shift()
  const post:   Middleware<M, Q>[] = args

  runMiddleware(pre, config)
  runMiddleware(post, config)
  return config
}

export function runMiddleware<M, Q>(middleware: Middleware<M, Q>[], config: ResourceConfig<M, Q>) {
  for (const mw of middleware) {
    mw(config)
  }
}

export type Middleware<M, Q> = (config: ResourceConfig<M, Q>) => void
