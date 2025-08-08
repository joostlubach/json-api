import { isArray } from 'lodash'

import { BeforeHandler, ResourceConfig } from './ResourceConfig'

export function middleware<E = any, Q = any, I = any, M = any>(mw: Middleware<E, Q, I>) {
  return mw
}

export namespace middleware {

  export function first<E, Q, I>(handler: BeforeHandler): Middleware<E, Q, I> {
    return config => {
      config.before ??= []
      config.before.unshift(handler)
    }
  }

  export function before<E, Q, I>(handler: BeforeHandler): Middleware<E, Q, I> {
    return config => {
      config.before ??= []
      config.before.push(handler)
    }
  }

}

export function compose<E, Q, I>(pre: Middleware<E, Q, I>[], config: ResourceConfig<E, Q, I>, ...post: Middleware<E, Q, I>[]): ResourceConfig<E, Q, I>
export function compose<E, Q, I>(config: ResourceConfig<E, Q, I>, ...post: Middleware<E, Q, I>[]): ResourceConfig<E, Q, I>
export function compose<E, Q, I>(...args: any[]) {
  const pre:    Middleware<E, Q, I>[] = isArray(args[0]) ? args.shift() : []
  const config: ResourceConfig<E, Q, I> = args.shift()
  const post:   Middleware<E, Q, I>[] = args

  runMiddleware(pre, config)
  runMiddleware(post, config)
  return config
}

export function runMiddleware<E, Q, I>(middleware: Middleware<E, Q, I>[], config: ResourceConfig<E, Q, I>) {
  for (const mw of middleware) {
    mw(config)
  }
}

export type Middleware<E, Q, I> = (config: ResourceConfig<E, Q, I>) => void
