import chalk from 'chalk'
import { objectEntries } from 'ytil'

import APIError from './APIError'
import JSONAPI from './JSONAPI'
import Resource from './Resource'
import { ResourceConfig } from './ResourceConfig'
import config from './config'
import { Middleware, runMiddleware } from './middleware'

export default class ResourceRegistry<Model, Query, ID> {

  constructor(
    jsonAPI: JSONAPI<Model, Query, ID>,
    middleware: Middleware<Model, Query, ID>[] = []
  ) {
    this.jsonAPI = jsonAPI
    this.middleware = middleware
  }

  private readonly resources:  Map<string, Resource<any, any, any>> = new Map()
  private readonly jsonAPI:    JSONAPI<any, any, any>
  private readonly middleware: Middleware<any, any, any>[]

  // #region Registering

  public register(resources: Record<string, ResourceConfig<Model, Query, ID>>): void
  public register<M extends Model, Q extends Query, I extends ID>(type: string, config: ResourceConfig<M, Q, I>): void
  public register(...args: any[]) {
    if (args.length === 1) {
      for (const [type, config] of objectEntries(args[0] as Record<string, ResourceConfig<Model, Query, ID>>)) {
        this.registerResource(type, config)
      }
    } else {
      const [type, config] = args
      this.registerResource(type, config)
    }
  }

  public modify<M extends Model, Q extends Query, I extends ID>(type: string, fn: (config: ResourceConfig<M, Q, I>) => void) {
    const resource = this.get(type) as Resource<M, Q, I>
    fn(resource.config)
  }

  private registerResource<M extends Model, Q extends Query, I extends ID>(type: string, resourceConfig: ResourceConfig<M, Q, I>) {
    runMiddleware(this.middleware, resourceConfig)

    const resource = new Resource<M, Q, I>(this.jsonAPI, type, resourceConfig)
    this.resources.set(type, resource)

    config.logger.debug(chalk`-> Registered resource {yellow ${resource.plural}}\n`)
  }

  public drop(name: string) {
    this.resources.delete(name)
  }

  // #endregion

  // #region Retrieval

  public has(name: string) {
    return this.resources.has(name)
  }

  public get<M extends Model, Q extends Query, I extends ID>(name: string): Resource<M, Q, I> {
    const resource = this.resources.get(name)
    if (resource == null) {
      throw new APIError(404, `No resource found for name '${name}'`)
    }
    return resource
  }

  public all(): Resource<Model, Query, ID>[] {
    return Array.from(this.resources.values())
  }

  public forModel<M extends Model, Q extends Query, I extends ID>(modelName: string): Resource<M, Q, I> {
    for (const [, resource] of this.resources) {
      if (!resource.config.auxiliary && resource.config.modelName === modelName) {
        return resource
      }
    }

    throw new APIError(404, `No resource found for model '${modelName}'`)
  }

  // #endregion

}