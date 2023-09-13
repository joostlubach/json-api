import chalk from 'chalk'
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

  public get(name: string): Resource<Model, Query> | null {
    return this.resources.get(name) ?? null
  }

  public all(): Resource<Model, Query>[] {
    return Array.from(this.resources.values())
  }

  public findResourceForModel(modelName: string): Resource<Model, Query> | null {
    for (const [, resource] of this.resources) {
      if (!resource.config.auxiliary && resource.config.modelName === modelName) {
        return resource
      }
    }
    return null
  }

  // #endregion

}