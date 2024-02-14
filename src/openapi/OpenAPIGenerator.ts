import * as FS from 'fs-extra'
import * as YAML from 'js-yaml'
import { camelCase, cloneDeep, mapValues, upperFirst } from 'lodash'
import { OpenAPIV3, OpenAPIV3_1 } from 'openapi-types'
import * as Path from 'path'
import { objectKeys, sparse } from 'ytil'

import Adapter from '../Adapter'
import JSONAPI from '../JSONAPI'
import RequestContext from '../RequestContext'
import Resource from '../Resource'
import { RelationshipConfig } from '../ResourceConfig'
import { CommonActions, Method, OpenAPIMeta } from '../types'
import { actionParameters, errorResponseBody, requestBodies, responseBodies } from './actions'
import {
  bulkSelector,
  error,
  linkage,
  pathParam,
  pluralRelationship,
  relationship,
  singularRelationship,
  validationErrorDetail,
} from './objects'
import { OpenAPIGeneratorOptions } from './types'

export default class OpenAPIGenerator {

  constructor(
    private readonly jsonAPI: JSONAPI<any, any, any>,
    private readonly context: RequestContext,
    private readonly options: OpenAPIGeneratorOptions = {},
  ) {
    this.reset()

    this.meta = {
      ...metaDefaults,
      ...this.options.metaDefaults,
    }
  }

  private document!: OpenAPIV3_1.Document
  private meta:      OpenAPIMeta = {}

  private get contentType() {
    return this.options.contentType ?? defaultContentType
  }

  private get idType() {
    return this.meta.idType ?? 'string'
  }

  // #region Generation

  public async generate() {
    this.reset()

    for (const resource of this.jsonAPI.registry.all()) {
      await this.appendResource(resource)
    }

    this.addSchema('AnyResponseDocument', this.buildDocumentSchema(null, true, true))
    this.addSchema('BulkSelector', bulkSelector())
    this.addSchema('Relationship', relationship())
    this.addSchema('SingularRelationship', singularRelationship())
    this.addSchema('PluralRelationship', pluralRelationship())
    this.addSchema('Linkage', linkage(this.idType))
    this.addSchema('Error', error())
    this.addSchema('ValidationError', error({$ref: '#/components/schemas/ValidationErrorDetail'}))
    this.addSchema('ValidationErrorDetail', validationErrorDetail())

    return this.document
  }

  private reset() {
    const {version, metaDefaults: defaults, ...rest} = this.options
    this.document = cloneDeep({...baseDocument, ...rest})

    if (version != null) {
      this.document.openapi = version
    }
  }

  // #endregion

  // #region Resources

  private async appendResource(resource: Resource<any, any, any>) {
    // Append the list action separately (it has an optional parameter).
    if (this.actionEnabled(resource, 'list')) {
      await this.appendListAction(resource)
    }

    // Append all other actions.
    for (const action of ['show', 'create', 'replace', 'update', 'delete'] as CommonActions[]) {
      if (this.actionEnabled(resource, action)) {
        this.appendAction(resource, action)
      }
    }

    // Now append all schemas for this resource.
    await this.appendResourceSchemas(resource)
  }

  private async appendResourceSchemas(resource: Resource<any, any, any>) {
    const prefix = this.schemaPrefix(resource)
    const adapter = this.jsonAPI.adapter(resource, this.context)

    this.addSchema(`${prefix}CreateDocument`, this.buildDocumentSchema(resource, false, false))
    this.addSchema(`${prefix}UpdateDocument`, this.buildDocumentSchema(resource, true, false))
    this.addSchema(`${prefix}ResponseDocument`, this.buildDocumentSchema(resource, true, true))
    this.addSchema(`${prefix}Attributes`, await this.buildAttributesSchema(resource, adapter))
    this.addSchema(`${prefix}Relationships`, this.buildRelationshipsSchema(resource, adapter))
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

  private async buildAttributesSchema(resource: Resource<any, any, any>, adapter: Adapter<any, any, any>): Promise<OpenAPIV3_1.SchemaObject> {
    const properties: Record<string, OpenAPIV3_1.SchemaObject> = {}
    const required: string[] = []
    await Promise.all(objectKeys(resource.config.attributes).map(async name => {
      const schema = await adapter.openAPISchemaForAttribute(name)
      properties[name] = schema
      if (await adapter.isAttributeRequired(name)) {
        required.push(name)
      }
    }))

    return {
      type: 'object',
      properties,
      required,
    }
  }

  private buildRelationshipsSchema(resource: Resource<any, any, any>, adapter: Adapter<any, any, any>): OpenAPIV3_1.SchemaObject {
    const relationships = resource.config.relationships ?? {}

    return {
      type: 'object',

      properties: mapValues(relationships, key => this.buildRelationshipSchema(key)),
      required:   objectKeys(relationships).filter(key => {
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

  private async appendListAction(resource: Resource<any, any, any>) {
    const route = this.jsonAPI.route('list')
    if (route === false) { return }

    // The list action offers an optional parameter `:label`. OpenAPI doesn't support optional parameters so
    // we have to add a separate path for the optional case.

    const path = route.path(resource)
    const method = this.httpMethod(route.method)
    const basePath = this.openAPIPath(path)
    const pathWithoutLabel = this.openAPIPath(path.replace(/\/[^/]*:label\?/, ''))
    const hasLabel = basePath !== pathWithoutLabel

    const operation = this.operationForAction(resource, 'list')

    this.appendOperation(basePath, method, {
      ...operation,
      parameters: [
        ...hasLabel ? [pathParam('label', 'string')] : [],
        ...operation.parameters ?? [],
      ],
    })
    if (hasLabel) {
      this.appendOperation(pathWithoutLabel, method, operation)
    }
  }

  private appendAction(resource: Resource<any, any, any>, action: CommonActions) {
    const route = this.jsonAPI.route(action)
    if (route === false) { return }

    const path = this.openAPIPath(route.path(resource))
    const method = this.httpMethod(route.method)
    this.appendOperation(path, method, this.operationForAction(resource, action))
  }

  private operationForAction(resource: Resource<any, any, any>, action: CommonActions): OpenAPIV3_1.OperationObject {
    const okCode = action === 'create' ? '201' : '200'
    const parameters = actionParameters[action].call(this, resource)
    const requestBody = requestBodies[action].call(this, resource)
    const responseBody = responseBodies[action].call(this, resource)

    return {
      ...this.meta.actions?.[action],
      ...resource.config.openapi?.actions?.[action],
      parameters: parameters.map(parameter => ({
        ...this.meta.actions?.[action]?.parameters?.[parameter.name],
        ...parameter,
      })),
      requestBody: requestBody == null ? undefined : {
        content: {[this.contentType]: requestBody},
      },
      responses: {
        [okCode]: {
          description: "Success",

          ...this.meta.responses?.[okCode],
          content: {
            [this.contentType]: responseBody,
          },
        },

        ...builtInErrorCodes.reduce(
          (acc, code) => ({...acc, [code]: this.errorResponse(code)}),
          {}
        ),
      },
    }    
  }

  private errorResponse(status: string): OpenAPIV3_1.ResponseObject {
    return {
      description: `Error ${status}`,
      ...this.meta.responses?.[status],

      content: {
        [this.contentType]: errorResponseBody(status),
      },
    }
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

  // #region Requests and responses

  // #endregion

  // #region Spec operations

  public appendOperation(path: string, method: OpenAPIV3_1.HttpMethods, config: OpenAPIV3_1.OperationObject) {
    const paths = this.document.paths ??= {}
    const pathObject = paths[path] ??= {}

    // Bug in OpenAPIV3_1 typing here.
    ;(pathObject as any)[method] = config
  }

  public addSchema(name: string, schema: OpenAPIV3_1.SchemaObject) {
    this.document.components ??= {}
    this.document.components.schemas ??= {}
    this.document.components.schemas[name] = schema
  } 

  // #endregion

}

const defaultContentType = 'application/vnd.api+json'
const metaDefaults = YAML.load(FS.readFileSync(Path.join(__dirname, 'defaults.yml'), 'utf-8')) as OpenAPIMeta
const builtInErrorCodes = ['400', '401', '403', '404', '405', '409', '500']

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