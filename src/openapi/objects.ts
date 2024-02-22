import { OpenAPIV3_1 } from 'openapi-types'
import { sparse } from 'ytil'

export const bulkSelector = (): OpenAPIV3_1.SchemaObject => ({
  type: 'object',
  
  properties: {
    data: {
      type:  'array',
      items: {
        $ref: '#/components/schemas/Linkage',
      },
    },
    meta: {
      type: 'object',

      properties: {
        filters: {
          type: 'object',
        },
        search: {
          type: 'string',
        },
      },
    },
  },
})

export const queryParam = (name: string, schema: OpenAPIV3_1.ParameterObject['schema'], required: boolean = true): OpenAPIV3_1.ParameterObject => ({
  name,
  required,
  in: 'query',

  schema,
  style:   schema != null && 'type' in schema && schema.type === 'object' ? 'deepObject' : 'form',
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

export const relationship = (): OpenAPIV3_1.SchemaObject => ({
  anyOf: [{
    $ref: '#/components/schemas/SingularRelationship',
  }, {
    $ref: '#/components/schemas/PluralRelationship',
  }],
})

export const singularRelationship = (): OpenAPIV3_1.SchemaObject => ({
  type: 'object',

  properties: {
    data: {
      anyOf: [{
        type: 'null',
      }, {
        $ref: '#/components/schemas/Linkage',
      }],
    },
    meta: {
      type: 'object',
    },
  },
  required: ['data'],
})

export const pluralRelationship = (): OpenAPIV3_1.SchemaObject => ({
  type: 'object',

  properties: {
    data: {
      type:  'array',
      items: {
        $ref: '#/components/schemas/Linkage',
      },
    },
    meta: {
      type: 'object',
    },
  },
  required: ['data'],
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
    meta: {
      type: 'object',
    },
  },
  required: ['type', 'id'],
})

export const error = (detailErrorType?: OpenAPIV3_1.ReferenceObject | OpenAPIV3_1.SchemaObject): OpenAPIV3_1.SchemaObject => ({
  type: 'object',

  properties: {
    status:  {type: 'integer'},
    message: {type: 'string'},

    ...detailErrorType ? {
      errors: {
        type:  'array',
        items: detailErrorType,
      },
    } : {},
  },
  required: sparse([
    'status', 
    'message', 
    detailErrorType && 'errors',
  ]),
})

export const validationErrorDetail = (): OpenAPIV3_1.SchemaObject => ({
  type: 'object',

  properties: {
    code:   {type: 'string'},
    title:  {type: 'string'},
    detail: {type: 'string'},

    source: {
      anyOf: [{
        type: 'object',

        properties: {pointer: {type: 'string'}},
        required:   ['pointer'],
      }, {
        type: 'object',

        properties: {parameter: {type: 'string'}},
        required:   ['parameter'],
      }],
    },

  },

  required: ['title'],
})