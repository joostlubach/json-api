import chalk from 'chalk'
import APIError from './APIError'
import config from './config'
import Resource from './Resource'
import { mergeResourceConfig, ResourceConfig } from './ResourceConfig'

export default class ResourceRegistry<Model, Query> {

  constructor(
    private readonly defaults: Partial<ResourceConfig<Model, Query>> = {},
    private readonly afterCreate?: (resource: Resource<Model, Query>) => any
  ) {}

  private readonly resources: Map<string, Resource<any, any>> = new Map()

  // #region Registering

  public registerMany(configs: Record<string, ResourceConfig<Model, Query>>) {
    for (const [type, config] of Object.entries(configs)) {
      this.register(type, config)
    }
  }

  public register(type: string, resourceConfig: ResourceConfig<Model, Query>) {
    const mergedConfig = mergeResourceConfig(resourceConfig, this.defaults)
    const resource = new Resource(this, type, mergedConfig)
    this.afterCreate?.(resource)
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