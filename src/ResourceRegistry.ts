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
    private readonly jsonAPI: JSONAPI<Model, Query, ID>,
    private readonly middleware: Middleware<Model, Query, ID>[] = []
  ) {
  }

  private readonly resources: Map<string, Resource<any, any, any>> = new Map()

  // #region Registering

  public register(resources: Record<string, ResourceConfig<any, any, any>>): void
  public register<M extends Model, Q extends Query, I extends ID>(type: string, config: ResourceConfig<M, Q, I>): void
  public register(...args: any[]) {
    if (args.length === 1) {
      for (const [type, config] of objectEntries(args[0] as Record<string, ResourceConfig<any, any, any>>)) {
        this.registerResource(type, config)
      }
    } else {
      const [type, config] = args
      this.registerResource(type, config)
    }
  }

  private registerResource(type: string, resourceConfig: ResourceConfig<any, any, any>) {
    runMiddleware(this.middleware, resourceConfig)

    const resource = new Resource(this.jsonAPI, type, resourceConfig)
    this.resources.set(type, resource)

    config.logger.info(chalk`-> Registered resource {yellow ${resource.plural}}\n`)
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