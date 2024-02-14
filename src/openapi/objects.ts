import { OpenAPIV3_1 } from 'openapi-types'

export const bulkSelector = (): OpenAPIV3_1.SchemaObject => ({
  anyOf: [{
    type: 'object',
  
    properties: {
      data: {
        type:  'array',
        items: {
          $ref: '#/components/schemas/Linkage',
        },
      },
    },
    required: ['data'],
  }, {
    type: 'object',
  
    properties: {
      meta: {
        type: 'object',

        properties: {
          filters: {
            type: 'object',
          },
        },
        required: ['filters'],
      },
    },
    required: ['meta'],
  }, {
    type: 'object',
  
    properties: {
      meta: {
        type: 'object',

        properties: {
          search: {
            type: 'string',
          },
        },
        required: ['search'],
      },
    },
    required: ['meta'],
  }],
})

export const queryParam = (name: string, schema: OpenAPIV3_1.ParameterObject['schema'], required: boolean = true): OpenAPIV3_1.ParameterObject => ({
  name,
  required,
  in: 'query',

  schema,
  style:   schema != null && 'type' in schema && schema.type === 'object' ? 'deepObject' : 'simple',
  explode: true,
})

export const queryArrayParam = (name: string, schema: OpenAPIV3_1.ParameterObject['schema'], required: boolean = true): OpenAPIV3_1.ParameterObject => ({
  name,
  required,
  in: 'query',

  schema,
  style:   'deepObject',
  explode: true,
})

export const pathParam = (name: string, type: Exclude<OpenAPIV3_1.NonArraySchemaObjectType, 'null'>, required: boolean = true): OpenAPIV3_1.ParameterObject => ({
  name,
  required,
  in: 'path',

  schema: {
    type,
  },
})

export const linkage = (idType: OpenAPIV3_1.NonArraySchemaObjectType): OpenAPIV3_1.SchemaObject => ({
  type: 'object',

  properties: {
    type: {
      type: 'string',
    },
    id: {
      type: idType,
    },
  },
  required: ['type', 'id'],
})