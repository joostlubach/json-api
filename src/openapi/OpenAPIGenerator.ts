import * as FS from 'fs-extra'
import { singularize } from 'inflected'
import * as YAML from 'js-yaml'
import { camelCase, cloneDeep, get, isPlainObject, mapValues, merge, upperFirst } from 'lodash'
import { OpenAPIV3, OpenAPIV3_1 } from 'openapi-types'
import * as Path from 'path'
import { deepMapValues, objectKeys, sparse } from 'ytil'

import Adapter from '../Adapter'
import JSONAPI from '../JSONAPI'
import RequestContext from '../RequestContext'
import Resource from '../Resource'
import { RelationshipConfig } from '../ResourceConfig'
import { CommonActions, JSONAPIRoute, Method } from '../types'
import { actionParameters, errorResponseBody, requestBodies, responseBodies } from './actions'
import {
  bulkSelector,
  error,
  linkage,
  pluralRelationship,
  relationship,
  singularRelationship,
  validationErrorDetail,
} from './objects'
import { OpenAPIGeneratorOptions, OpenAPIMeta } from './types'

export default class OpenAPIGenerator {

  constructor(
    private readonly jsonAPI: JSONAPI<any, any, any>,
    private readonly context: RequestContext,
    private readonly options: OpenAPIGeneratorOptions = {},
  ) {
    this.reset()

    this.defaults = {
      ...metaDefaults,
      ...this.options.defaults,
    }
  }

  private document!: OpenAPIV3_1.Document
  private defaults:  OpenAPIMeta = {}

  private get idType() {
    return this.defaults.idType ?? 'string'
  }

  // #region Generation

  public async generate() {
    this.reset()

    for (const resource of this.jsonAPI.registry.all()) {
      await this.emitResource(resource)
    }

    this.appendSchema('AnyResponseDocument', this.buildDocumentSchema(null, true, true))
    this.appendSchema('BulkSelector', bulkSelector())
    this.appendSchema('Relationship', relationship())
    this.appendSchema('SingularRelationship', singularRelationship())
    this.appendSchema('PluralRelationship', pluralRelationship())
    this.appendSchema('Linkage', linkage(this.idType))
    this.appendSchema('Error', error())
    this.appendSchema('ValidationError', error({$ref: '#/components/schemas/ValidationErrorDetail'}))
    this.appendSchema('ValidationErrorDetail', validationErrorDetail())

    return this.document
  }

  private reset() {
    const {version, defaults: defaults, ...rest} = this.options
    this.document = cloneDeep({...baseDocument, ...rest})

    if (version != null) {
      this.document.openapi = version
    }
  }

  // #endregion

  // #region Resources

  private async emitResource(resource: Resource<any, any, any>) {
    for (const action of CommonActions.all) {
      if (this.actionEnabled(resource, action)) {
        this.emitAction(resource, action)
      }
    }

    // Now emit all schemas for this resource.
    await this.emitResourceSchemas(resource)
  }

  private async emitResourceSchemas(resource: Resource<any, any, any>) {
    const prefix = this.schemaPrefix(resource)
    const adapter = this.jsonAPI.adapter(resource, this.context)

    this.appendSchema(`${prefix}CreateDocument`, this.buildDocumentSchema(resource, false, false))
    this.appendSchema(`${prefix}UpdateDocument`, this.buildDocumentSchema(resource, true, false))
    this.appendSchema(`${prefix}ResponseDocument`, this.buildDocumentSchema(resource, true, true))
    this.appendSchema(`${prefix}Attributes`, await this.buildAttributesSchema(resource, adapter))
    this.appendSchema(`${prefix}Relationships`, this.buildRelationshipsSchema(resource, adapter))
  }

  private buildDocumentSchema(resource: Resource<any, any, any> | null, requireID: boolean, relationships: boolean): OpenAPIV3_1.SchemaObject {
    return {
      type: 'object',

      properties: {
        type: {
          type: 'string',
          enum: resource == null ? undefined : [resource.type],
        },
        
        id: requireID ? {
          type: this.idType,
        } : {
          anyOf: [
            {type: this.idType},
            {type: 'null'},
          ],
        },

        attributes: resource == null ? {
          type: 'object',
        } : {
          $ref: `#/components/schemas/${this.schemaPrefix(resource)}Attributes`,
        },
        ...relationships ? {
          relationships: resource == null ? {
            type: 'object',

            additionalProperties: {
              $ref: `#/components/schemas/Relationship`,
            },
          } : {
            $ref: `#/components/schemas/${this.schemaPrefix(resource)}Relationships`,
          },
        } : {},
        meta: {
          type: 'object',
        },
      },
      required: sparse([
        'type',
        requireID && 'id',
        'attributes',
        relationships && 'relationships',
      ]),
    }
  }  

  private async buildAttributesSchema(resource: Resource<any, any, any>, adapter: Adapter<any, any, any> | undefined): Promise<OpenAPIV3_1.SchemaObject> {
    const properties: Record<string, OpenAPIV3_1.SchemaObject> = {}
    const required: string[] = []
    await Promise.all(objectKeys(resource.config.attributes).map(async name => {
      const defaults = await this.meta<any>(`attributes.${name}`, resource, true)
      const schema = await adapter?.openAPISchemaForAttribute?.(name, this.document)

      properties[name] = {...defaults, ...schema}

      // TODO: Find a way to determine if an attribute is required if no adapter is available.
      if (adapter == null || await adapter?.attributeRequired?.(name)) {
        required.push(name)
      }
    }))

    return {
      type: 'object',
      properties,
      required,
    }
  }

  private buildRelationshipsSchema(resource: Resource<any, any, any>, adapter: Adapter<any, any, any> | undefined): OpenAPIV3_1.SchemaObject {
    const relationships = resource.config.relationships ?? {}

    return {
      type: 'object',

      properties: mapValues(relationships, (relationship, key) => ({
        ...this.meta<any>(`relationships.${key}`, resource, true),
        ...adapter?.openAPIDocumentationForRelationship?.(key, this.document),
        ...this.buildRelationshipSchema(relationship),
      })),
      required: objectKeys(relationships).filter(key => {
        const relationship = relationships[key]
        return !relationship.detail && !relationship.if
      }),
    }
  }

  private buildRelationshipSchema(relationship: RelationshipConfig<any, any, any>): OpenAPIV3_1.ReferenceObject {
    if (relationship.plural) {
      return {
        $ref: '#/components/schemas/PluralRelationship',
      }
    } else {
      return {
        $ref: '#/components/schemas/SingularRelationship',
      }
    }
  }

  private schemaPrefix(resource: Resource<any, any, any>) {
    return upperFirst(camelCase(resource.type))
  }

  // #endregion

  // #region Actions

  private actionEnabled(resource: Resource<any, any, any>, action: CommonActions) {
    if (resource.config[action] === false) { return false }
    return true
  }

  private emitAction(resource: Resource<any, any, any>, action: CommonActions) {
    for (const route of this.jsonAPI.routes(resource, action)) {
      const path = this.openAPIPath(route.path)
      const method = this.httpMethod(route.method)
      this.appendOperation(path, method, this.operationForAction(resource, action, route))
    }
  }

  private operationForAction(resource: Resource<any, any, any>, action: CommonActions, route: JSONAPIRoute): OpenAPIV3_1.OperationObject {
    const okCode = action === 'create' ? '201' : '200'
    const parameters = actionParameters[action].call(this, resource, route)
    const requestBody = requestBodies[action].call(this, resource, route)
    const responseBody = responseBodies[action].call(this, resource, route)

    // Special case if there is a label parameter: use its meta-info.
    const metaKey = route.params?.label != null ? `label.${route.params.label}` : `actions.${action}`

    return merge(
      {},
      this.meta(metaKey, resource),
      
      {
        parameters: parameters.map(parameter => merge(
          {},
          this.meta(`actions.${action}.parameters.${parameter.name}`, resource),
          parameter,
        )),
        requestBody: requestBody == null ? undefined : {
          content: this.media(requestBody),
        },
        responses: {
          [okCode]: merge(
            {description: "Success"},

            this.meta(`responses.${okCode}`, resource),
            {content: this.media(responseBody)},
          ),

          ...builtInErrorCodes.reduce(
            (acc, code) => ({...acc, [code]: this.errorResponse(resource, code)}),
            {}
          ),
        },
      },
    ) 
  }

  private errorResponse(resource: Resource<any, any, any>, status: string): OpenAPIV3_1.ResponseObject {
    return merge(
      {description: `Error ${status}`},
      this.meta<any>(`responses.${status}`, resource),
      {content: this.media(errorResponseBody(status))},
    )
  }

  private media(content: OpenAPIV3_1.MediaTypeObject): Record<string, OpenAPIV3_1.MediaTypeObject> {
    return this.jsonAPI.allowedContentTypes.reduce(
      (acc, it) => ({...acc, [it]: content}), 
      {}
    )
  }

  // #endregion

  // #region Path & method translation

  private openAPIPath(path: string) {
    return path
      .replace(/::/g, '__##__')
      .replace(/:([\w]+)\??/g, '{$1}')
      .replace(/__##__/g, ':')
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

  public appendOperation(path: string, method: OpenAPIV3_1.HttpMethods, config: OpenAPIV3_1.OperationObject) {
    const paths = this.document.paths ??= {}
    const pathObject = paths[path] ??= {}

    // Bug in OpenAPIV3_1 typing here.
    ;(pathObject as any)[method] = config
  }

  public appendSchema(path: string, schema: OpenAPIV3_1.SchemaObject) {
    const head = path.split('/')
    const tail = head.pop()!

    this.document.components ??= {}

    let current: Record<string, any> = this.document.components.schemas ??= {}
    for (const part of head) {
      current = current[part] ??= {}
    }
    current[tail] = schema
  } 

  // #endregion

  // #region Meta

  private meta<T>(key: string, resource: Resource<any, any, any> | null, interpolate: boolean = true): T {
    let meta: T | undefined
    if (resource != null) {
      meta = get(resource.config.openapi ?? {}, key)
    }
    if (meta == null) {
      meta = get(this.defaults, key)
    } else if (isPlainObject(meta)) {
      meta = merge({}, get(this.defaults, key), meta)
    }

    if (interpolate && resource != null) {
      return deepMapValues(meta, (value: any) => {
        if (typeof value !== 'string') { return value }
        if (!value.includes('{{')) { return value }

        return value
          .replace(/\{\{singular\}\}/g, () => this.singular(resource))
          .replace(/\{\{plural\}\}/g, () => this.plural(resource)) as T
      }) as T
    } else {
      return meta as T
    }
  }

  private singular(resource: Resource<any, any, any>) {
    return this.meta<string>('singular', resource) ?? singularize(resource.type)
  }

  private plural(resource: Resource<any, any, any>) {
    return this.meta<string>('plural', resource) ?? resource.type
  }

  // #endregion

}

const metaDefaults = YAML.load(FS.readFileSync(Path.join(__dirname, 'defaults.yml'), 'utf-8')) as OpenAPIMeta
const builtInErrorCodes = ['400', '401', '403', '404', '405', '406', '409', '415', '500']

const baseDocument: OpenAPIV3_1.Document = {
  openapi: '3.1.0',
  info:    {
    title:       'JSON API',
    version:     '1.0.0',
    description: 'JSON API specification',
  },
  paths:      {},
  components: {},
}
