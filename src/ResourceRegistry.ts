import chalk from 'chalk'
import { isArray } from 'lodash'
import APIError from './APIError'
import config from './config'
import { Middleware, runMiddleware } from './middleware'
import Resource from './Resource'
import { ResourceConfig } from './ResourceConfig'

export default class ResourceRegistry<Model, Query> {

  constructor(
    options: ResourceRegistryOptions<Model, Query> = {}
  ) {
    this.middleware =
      isArray(options.middleware) ? options.middleware :
      options.middleware == null ? [] :
      [options.middleware]
  }

  private readonly resources: Map<string, Resource<any, any>> = new Map()
  private readonly middleware: Middleware<any, any>[] = []

  // #region Registering

  public register<M extends Model, Q extends Query>(type: string, resourceConfig: ResourceConfig<M, Q>) {
    runMiddleware(this.middleware, resourceConfig)

    const resource = new Resource(this, type, resourceConfig)
    this.resources.set(type, resource)

    config.logger.info(chalk`-> Registered resource {yellow ${resource.plural}}\n`)
  }

  // #endregion

  // #region Retrieval

  public has(name: string) {
    return this.resources.has(name)
  }

  public get<M extends Model, Q extends Query>(name: string): Resource<M, Q> {
    const resource = this.resources.get(name)
    if (resource == null) {
      throw new APIError(404, `No resource found for name '${name}'`)
    }
    return resource
  }

  public all(): Resource<Model, Query>[] {
    return Array.from(this.resources.values())
  }

  public forModel<M extends Model, Q extends Query>(modelName: string): Resource<M, Q> {
    for (const [, resource] of this.resources) {
      if (!resource.config.auxiliary && resource.config.modelName === modelName) {
        return resource
      }
    }

    throw new APIError(404, `No resource found for model '${modelName}'`)
  }

  // #endregion

}

export interface ResourceRegistryOptions<M, Q> {
  middleware?: Middleware<M, Q>[]
}