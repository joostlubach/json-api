import { camelCase, upperFirst } from 'lodash'
import { OpenAPIV3_1 } from 'openapi-types'

import Resource from '../Resource'
import { pathParam, queryArrayParam, queryParam } from './objects'

export const actionParameters = {
  list: (resource: Resource<any, any, any>) => [
    queryParam('filters', {type: 'object'}, false),
    queryParam('search', {type: 'string'}, false),
    queryArrayParam('sorts', {$ref: '#/components/schemas/Sort'}, false),
    queryParam('limit', {type: 'integer'}, false),
    queryParam('offset', {type: 'integer'}, false),
  ],
  show: (resource: Resource<any, any, any>) => [
    pathParam('id', 'string'),
  ],
  create:  (resource: Resource<any, any, any>) => [],
  replace: (resource: Resource<any, any, any>) => [
    pathParam('id', 'string'),
  ],
  update: (resource: Resource<any, any, any>) => [
    pathParam('id', 'string'),
  ],
  delete: (resource: Resource<any, any, any>) => [],
}

export const requestBodies = {
  list:    (resource: Resource<any, any, any>) => undefined,
  show:    (resource: Resource<any, any, any>) => undefined,
  create:  (resource: Resource<any, any, any>) => documentPackRequest(resource, false),
  replace: (resource: Resource<any, any, any>) => documentPackRequest(resource, true),
  update:  (resource: Resource<any, any, any>) => documentPackRequest(resource, true),
  delete:  (resource: Resource<any, any, any>) => bulkSelectorPackRequest(),
}

export const responseBodies = {
  list:    (resource: Resource<any, any, any>) => listPackResponse(resource),
  show:    (resource: Resource<any, any, any>) => documentPackResponse(resource),
  create:  (resource: Resource<any, any, any>) => documentPackResponse(resource),
  replace: (resource: Resource<any, any, any>) => documentPackResponse(resource),
  update:  (resource: Resource<any, any, any>) => documentPackResponse(resource),
  delete:  (resource: Resource<any, any, any>) => {
    const response = linkagesListPackResponse(resource)
    const schema = response.schema as OpenAPIV3_1.SchemaObject
    const metaSchema = schema.properties!.meta as OpenAPIV3_1.SchemaObject
    metaSchema.properties = {
      deletedCount: {type: 'integer'},
    }
    schema.required = ['data', 'meta']
    return response
  },
}

export const errorResponseBody = (code: string): OpenAPIV3_1.MediaTypeObject => {
  const schemaName = code === '442'
    ? 'ValidationError'
    : 'Error'

  return {
    schema: {
      type: 'object',

      properties: {
        error: {
          $ref: `#/components/schemas/${schemaName}`,
        },
        meta: {
          type: 'object',
        },
      },

      required: ['error', 'meta'],
    },
  }
}

// #region Request bodies

export function documentPackRequest(resource: Resource<any, any, any>, requireID: boolean): OpenAPIV3_1.MediaTypeObject {
  const schemaPrefix = upperFirst(camelCase(resource.type))

  return {
    schema: {
      type: 'object',
      
      properties: {
        data: {
          $ref: `#/components/schemas/${schemaPrefix}Document${requireID ? '' : 'WithoutID'}`,
        },
        meta: {
          type: 'object',
        },
      },

      required: ['data'],
    },
  }
}

export function bulkSelectorPackRequest(): OpenAPIV3_1.MediaTypeObject {
  return {
    schema: {
      $ref: `#/components/schemas/BulkSelector`,
    },
  }
}

// #endregion

// #region Request bodies

export function listPackResponse(resource: Resource<any, any, any>): OpenAPIV3_1.MediaTypeObject {
  const schemaPrefix = upperFirst(camelCase(resource.type))

  return {
    schema: {
      type: 'object',
      
      properties: {
        data: {
          type:  'array',
          items: {
            $ref: `#/components/schemas/${schemaPrefix}Document`,
          },
        },
        included: {
          type:  'array',
          items: {
            $ref: `#/components/schemas/AnyDocument`,
          },
        },
        meta: {
          type: 'object',
        },
      },

      required: ['data'],
    },
  }
}

export function documentPackResponse(resource: Resource<any, any, any>): OpenAPIV3_1.MediaTypeObject {
  const schemaPrefix = upperFirst(camelCase(resource.type))

  return {
    schema: {
      type: 'object',
      
      properties: {
        data: {
          $ref: `#/components/schemas/${schemaPrefix}Document`,
        },
        included: {
          type:  'array',
          items: {
            $ref: `#/components/schemas/AnyDocument`,
          },
        },
        meta: {
          type: 'object',
        },
      },

      required: ['data'],
    },
  }
}

export function linkagesListPackResponse(resource: Resource<any, any, any>): OpenAPIV3_1.MediaTypeObject {
  return {
    schema: {
      type: 'object',
      
      properties: {
        data: {
          type:  'array',
          items: {
            $ref: `#/components/schemas/Linkage`,
          },
        },
        meta: {
          type: 'object',
        },
      },
      required: ['data'],
    },
  }
}

// #endregion


export default requestBodies