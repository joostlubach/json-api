import chalk from 'chalk'
import { AnyResource, mergeResourceConfig, ResourceConfig, ResourceConfigMap } from './'
import config from './config'
import Resource from './Resource'

export default class ResourceRegistry {

  constructor(configs: ResourceConfigMap, defaults: Partial<ResourceConfig<any, any>>) {
    ResourceRegistry.instance = this
    this.createResources(configs, defaults)
  }

  public static instance: ResourceRegistry

  public resources: Map<string, Resource<any, any>> = new Map()

  public createResources(configs: ResourceConfigMap, defaults: Partial<ResourceConfig<any, any>>) {
    for (const name of Object.keys(configs)) {
      const mergedConfig = mergeResourceConfig(configs[name], defaults)
      const resource = new Resource(this, name, mergedConfig)
      this.resources.set(name, resource)

      config.logger.info(chalk`-> Registered resource {yellow ${resource.plural}}\n`)
    }
  }

  public get(name: string): AnyResource | null {
    return this.resources.get(name) ?? null
  }

  public findResourceForModel(modelName: string): AnyResource | null {
    for (const [, resource] of this.resources) {
      if (!resource.config.auxiliary && resource.config.modelName === modelName) {
        return resource
      }
    }
    return null
  }

}