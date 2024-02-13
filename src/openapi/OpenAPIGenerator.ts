import * as FS from 'fs-extra'
import * as YAML from 'js-yaml'
import { cloneDeep } from 'lodash'
import { OpenAPIV3, OpenAPIV3_1 } from 'openapi-types'
import * as Path from 'path'

import JSONAPI from '../JSONAPI'
import Resource from '../Resource'
import { CommonActions, Method, OpenAPIMeta as OpenAPIMeta } from '../types'

export default class OpenAPIGenerator {

  constructor(
    private readonly jsonAPI: JSONAPI<any, any, any>,
    private readonly options: OpenAPIOptions = {},
  ) {
    this.reset()

    this.defaults = {
      ...metaDefaults,
      ...this.options.defaults,
    }
  }

  private document!: OpenAPIV3_1.Document
  private defaults:  OpenAPIMeta = {}

  // #region Generation

  public async generate() {
    this.reset()
    for (const resource of this.jsonAPI.registry.all()) {
      await this.appendResource(resource)
    }
    return this.document
  }

  private reset() {
    const {version, defaults, ...rest} = this.options
    this.document = cloneDeep({...baseDocument, ...rest})

    if (version != null) {
      this.document.openapi = version
    }
  }

  // #endregion

  // #region Resources

  private async appendResource(resource: Resource<any, any, any>) {
    if (this.actionEnabled(resource, 'list')) {
      await this.appendListAction(resource)
    }

    for (const action of ['show', 'create', 'replace', 'update', 'delete'] as CommonActions[]) {
      if (this.actionEnabled(resource, action)) {
        await this.appendAction(resource, action)
      }
    }
  }

  // #endregion

  // #region Actions

  private actionEnabled(resource: Resource<any, any, any>, action: CommonActions) {
    if (resource.config[action] === false) { return false }
    return true
  }

  private async appendListAction(resource: Resource<any, any, any>) {
    const route = this.jsonAPI.route('list')
    if (route === false) { return }

    // The list action offers an optional parameter `:label`. OpenAPI doesn't support optional parameters so
    // we have to add a separate path for the optional case.

    const path = route.path(resource)
    const method = this.httpMethod(route.method)
    const pathWithLabel = this.openAPIPath(path)
    const pathWithoutLabel = this.openAPIPath(path.replace(/\/[^/]*:label\?/, ''))

    this.appendOperation(pathWithLabel, method, {
      ...this.defaults.actions?.list,
      ...resource.config.openapi?.actions?.list,
    })

    if (pathWithLabel !== pathWithoutLabel) {
      this.appendOperation(pathWithoutLabel, method, {
        ...this.defaults.actions?.list,
        ...resource.config.openapi?.actions?.list,
      })
    }
  }

  private async appendAction(resource: Resource<any, any, any>, action: CommonActions) {
    const route = this.jsonAPI.route(action)
    if (route === false) { return }

    const path = this.openAPIPath(route.path(resource))
    const method = this.httpMethod(route.method)

    this.appendOperation(path, method, {
      ...this.defaults.actions?.[action],
      ...resource.config.openapi?.actions?.[action],
    })
  }

  // #endregion

  // #region Path & method translation

  private openAPIPath(path: string) {
    return path.replace(/:([\w]+)\??/g, '{$1}')
  }

  private httpMethod(method: Method): OpenAPIV3_1.HttpMethods {
    switch (method) {
    case 'get':    
      return OpenAPIV3.HttpMethods.GET
    case 'post':   
      return OpenAPIV3.HttpMethods.POST
    case 'patch':  
      return OpenAPIV3.HttpMethods.PATCH
    case 'put':
      return OpenAPIV3.HttpMethods.PUT
    case 'delete': 
      return OpenAPIV3.HttpMethods.DELETE
    }
  }

  // #endregion

  // #region Spec operations

  public appendOperation(path: string, method: OpenAPIV3_1.HttpMethods, config: OpenAPIV3_1.OperationObject<any>) {
    ((this.document.paths ??= {})[path] ??= {})[method] = config
  }

  public addSchema(name: string, schema: OpenAPIV3_1.SchemaObject) {
    this.document.components ??= {}
    this.document.components.schemas ??= {}
    this.document.components.schemas[name] = schema
  } 

  // #endregion

}

export interface OpenAPIOptions extends Partial<Omit<OpenAPIV3_1.Document, 'openapi'>> {
  version?:  OpenAPIV3_1.Document['openapi']
  defaults?: OpenAPIMeta
}

const metaDefaults = YAML.load(FS.readFileSync(Path.join(__dirname, 'defaults.yml'), 'utf-8')) as OpenAPIMeta

const baseDocument: OpenAPIV3_1.Document = {
  openapi: '3.1.0',
  info:    {
    title:       'JSON API',
    version:     '1.0.0',
    description: 'JSON API specification',
  },
  paths:      {},
  components: [],
}