import { isArray } from 'lodash'
import Adapter from './Adapter'
import { ResourceConfig } from './ResourceConfig'

export function resource<M, Q, A extends Adapter<M, Q>>(config: ResourceConfig<M, Q, A>) {
  return config
}

export function compose<M, Q, A extends Adapter<M, Q>>(pre: ComposeFunction<ResourceConfig<M, Q, A>>[], config: ResourceConfig<M, Q, A>, ...post: ComposeFunction<ResourceConfig<M, Q, A>>[]): ResourceConfig<M, Q, A>
export function compose<M, Q, A extends Adapter<M, Q>>(config: ResourceConfig<M, Q, A>, ...post: ComposeFunction<ResourceConfig<M, Q, A>>[]): ResourceConfig<M, Q, A>
export function compose<M, Q, A extends Adapter<M, Q>>(...args: any[]) {
  const pre:  ComposeFunction<ResourceConfig<M, Q, A>>[] = isArray(args[0]) ? args.shift() : []
  const root: ResourceConfig<M, Q, A> = args.shift()
  const post: ComposeFunction<ResourceConfig<M, Q, A>>[] = args

  let config = root

  for (const fn of pre) {
    config = fn(config)
  }
  for (const fn of post) {
    config = fn(config)
  }

  return config
}

export type ComposeFunction<T> = (value: T) => T