import { camelCase, upperFirst } from 'lodash'
import { OpenAPIV3_1 } from 'openapi-types'
import { sparse } from 'ytil'

import Resource from '../Resource.js'
import { JSONAPIRoute } from '../types.js'
import { pathParam, queryParam } from './objects.js'

export const actionParameters = {
  list: (resource: Resource<any, any, any>, route: JSONAPIRoute) => sparse([
    queryParam('filters', {type: 'object'}, false),
    queryParam('search', {type: 'string'}, false),
    queryParam('sort', {type: 'string', format: 'x-jsonapi-sort'}, false),
    queryParam('limit', {type: 'integer'}, false),
    queryParam('offset', {type: 'integer'}, false),
  ]),
  show: (resource: Resource<any, any, any>, route: JSONAPIRoute) => [
    pathParam('id', 'string'),
  ],
  create:  (resource: Resource<any, any, any>, route: JSONAPIRoute) => [],
  replace: (resource: Resource<any, any, any>, route: JSONAPIRoute) => [
    pathParam('id', 'string'),
  ],
  update: (resource: Resource<any, any, any>, route: JSONAPIRoute) => [
    pathParam('id', 'string'),
  ],
  delete: (resource: Resource<any, any, any>, route: JSONAPIRoute) => [],
}

export const requestBodies = {
  list:    (resource: Resource<any, any, any>, route: JSONAPIRoute) => undefined,
  show:    (resource: Resource<any, any, any>, route: JSONAPIRoute) => undefined,
  create:  (resource: Resource<any, any, any>, route: JSONAPIRoute) => documentPackRequest(resource, 'Create'),
  replace: (resource: Resource<any, any, any>, route: JSONAPIRoute) => documentPackRequest(resource, 'Create'),
  update:  (resource: Resource<any, any, any>, route: JSONAPIRoute) => documentPackRequest(resource, 'Update'),
  delete:  (resource: Resource<any, any, any>, route: JSONAPIRoute) => bulkSelectorPackRequest(),
}

export const responseBodies = {
  list:    (resource: Resource<any, any, any>, route: JSONAPIRoute) => listPackResponse(resource),
  show:    (resource: Resource<any, any, any>, route: JSONAPIRoute) => documentPackResponse(resource),
  create:  (resource: Resource<any, any, any>, route: JSONAPIRoute) => documentPackResponse(resource),
  replace: (resource: Resource<any, any, any>, route: JSONAPIRoute) => documentPackResponse(resource),
  update:  (resource: Resource<any, any, any>, route: JSONAPIRoute) => documentPackResponse(resource),
  delete:  (resource: Resource<any, any, any>, route: JSONAPIRoute) => {
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

export function documentPackRequest(resource: Resource<any, any, any>, type: 'Create' | 'Update'): OpenAPIV3_1.MediaTypeObject {
  const schemaPrefix = upperFirst(camelCase(resource.type))

  return {
    schema: {
      type: 'object',
      
      properties: {
        data: {
          $ref: `#/components/schemas/${schemaPrefix}${type}Document`,
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
            $ref: `#/components/schemas/${schemaPrefix}ResponseDocument`,
          },
        },
        included: {
          type:  'array',
          items: {
            $ref: `#/components/schemas/AnyResponseDocument`,
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
          $ref: `#/components/schemas/${schemaPrefix}ResponseDocument`,
        },
        included: {
          type:  'array',
          items: {
            $ref: `#/components/schemas/AnyResponseDocument`,
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
