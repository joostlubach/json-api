import { isArray } from 'lodash'
import { ResourceConfig } from './ResourceConfig'

export function resource<M, Q>(config: ResourceConfig<M, Q>) {
  return config
}

export function compose<M, Q>(pre: ComposeFunction<ResourceConfig<M, Q>>[], config: ResourceConfig<M, Q>, ...post: ComposeFunction<ResourceConfig<M, Q>>[]): ResourceConfig<M, Q>
export function compose<M, Q>(config: ResourceConfig<M, Q>, ...post: ComposeFunction<ResourceConfig<M, Q>>[]): ResourceConfig<M, Q>
export function compose<M, Q>(...args: any[]) {
  const pre:  ComposeFunction<ResourceConfig<M, Q>>[] = isArray(args[0]) ? args.shift() : []
  const root: ResourceConfig<M, Q> = args.shift()
  const post: ComposeFunction<ResourceConfig<M, Q>>[] = isArray(args[0]) ? args.shift() : []

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