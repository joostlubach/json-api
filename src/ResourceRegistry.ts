import chalk from 'chalk'
import { Deps } from 'ydeps'

import APIError from './APIError'
import JSONAPI from './JSONAPI'
import RequestContext from './RequestContext'
import Resource from './Resource'
import { ResourceConfig } from './ResourceConfig'
import config from './config'
import { Middleware, runMiddleware } from './middleware'

export default class ResourceRegistry<Entity, Query, ID> {

  constructor(
    jsonAPI: JSONAPI<Entity, Query, ID>,
    middleware: Middleware<Entity, Query, ID>[] = [],
    private readonly options: ResourceRegistryOptions = {},
  ) {
    this.jsonAPI = jsonAPI
    this.middleware = middleware
  }

  private readonly resources:  Map<string, Resource<any, any, any>> = new Map()
  private readonly jsonAPI:    JSONAPI<any, any, any>
  private readonly middleware: Middleware<any, any, any>[]

  // #region Registering

  public register<E extends Entity, Q extends Query, I extends ID>(type: string, resourceConfig: ResourceConfig<E, Q, I>, deps?: Deps) {
    runMiddleware(this.middleware, resourceConfig)

    const resource = new Resource<E, Q, I>(this.jsonAPI, type, resourceConfig)

    if (this.options.validate !== false) {
      const adapter = this.jsonAPI.adapter(resource, new RequestContext('validate', {}, null, deps))
      resource.validate(adapter)
    }
    this.resources.set(type, resource)

    config.logger.info(chalk`{green ✓} Registered resource {yellow ${resource.plural}}`)
    return resource
  }

  public modify<E extends Entity, Q extends Query, I extends ID>(type: string, fn: (config: ResourceConfig<E, Q, I>) => void) {
    const resource = this.get(type) as Resource<E, Q, I>
    fn(resource.config)
  }

  public drop(name: string) {
    this.resources.delete(name)
  }

  public clear() {
    this.resources.clear()
  }

  // #endregion

  // #region Retrieval

  public has(name: string) {
    return this.resources.has(name)
  }

  public get<E extends Entity, Q extends Query, I extends ID>(name: string): Resource<E, Q, I> {
    const resource = this.resources.get(name)
    if (resource == null) {
      throw new APIError(404, `No resource found for name '${name}'`)
    }
    return resource
  }

  public all(): Resource<Entity, Query, ID>[] {
    return Array.from(this.resources.values())
  }

  public resourceForEntity<E extends Entity, Q extends Query, I extends ID>(entity: string): Resource<E, Q, I> {
    for (const [, resource] of this.resources) {
      if (!resource.config.auxiliary && resource.config.entity === entity) {
        return resource
      }
    }

    throw new APIError(404, `No resource found for entity '${entity}'`)
  }

  // #endregion

}

export interface ResourceRegistryOptions {
  /**
   * Whether to validate resources when they are registered (default=`true`).
   */
  validate?: boolean
}
