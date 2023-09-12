import chalk from 'chalk'
import { AnyResource, mergeResourceConfig, ResourceConfig } from './'
import Resource from './Resource'

export default class ResourceRegistry {

  constructor(
    private readonly defaults: Partial<ResourceConfig<any, any>> = {},
    private readonly afterCreate?: (resource: AnyResource) => any
  ) {}

  private readonly resources: Map<string, Resource<any, any>> = new Map()

  // #region Registering

  public registerMany(configs: Record<string, ResourceConfig<any, any>>) {
    for (const [type, config] of Object.entries(configs)) {
      this.register(type, config)
    }
  }

  public register(type: string, config: ResourceConfig<any, any>) {
    const mergedConfig = mergeResourceConfig(config, this.defaults)
    const resource = new Resource(this, type, mergedConfig)
    this.afterCreate?.(resource)
    this.resources.set(type, resource)

    config.logger.info(chalk`-> Registered resource {yellow ${resource.plural}}\n`)
  }

  // #endregion

  // #region Retrieval

  public get(name: string): AnyResource | null {
    return this.resources.get(name) ?? null
  }

  public all(): AnyResource[] {
    return Array.from(this.resources.values())
  }

  public findResourceForModel(modelName: string): AnyResource | null {
    for (const [, resource] of this.resources) {
      if (!resource.config.auxiliary && resource.config.modelName === modelName) {
        return resource
      }
    }
    return null
  }

  // #endregion

}