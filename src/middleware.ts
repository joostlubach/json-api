import { isArray } from 'lodash'

import { BeforeHandler, ResourceConfig } from './ResourceConfig.js'

export function middleware<M, Q, I>(mw: Middleware<M, Q, I>) {
  return mw
}

export namespace middleware {

  export function first<M, Q, I>(handler: BeforeHandler): Middleware<M, Q, I> {
    return config => {
      config.before ??= []
      config.before.unshift(handler)
    }
  }

  export function before<M, Q, I>(handler: BeforeHandler): Middleware<M, Q, I> {
    return config => {
      config.before ??= []
      config.before.push(handler)
    }
  }

}

export function compose<M, Q, I>(pre: Middleware<M, Q, I>[], config: ResourceConfig<M, Q, I>, ...post: Middleware<M, Q, I>[]): ResourceConfig<M, Q, I>
export function compose<M, Q, I>(config: ResourceConfig<M, Q, I>, ...post: Middleware<M, Q, I>[]): ResourceConfig<M, Q, I>
export function compose<M, Q, I>(...args: any[]) {
  const pre:    Middleware<M, Q, I>[] = isArray(args[0]) ? args.shift() : []
  const config: ResourceConfig<M, Q, I> = args.shift()
  const post:   Middleware<M, Q, I>[] = args

  runMiddleware(pre, config)
  runMiddleware(post, config)
  return config
}

export function runMiddleware<M, Q, I>(middleware: Middleware<M, Q, I>[], config: ResourceConfig<M, Q, I>) {
  for (const mw of middleware) {
    mw(config)
  }
}

export type Middleware<M, Q, I> = (config: ResourceConfig<M, Q, I>) => void
