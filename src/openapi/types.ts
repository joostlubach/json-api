import { OpenAPIV3_1 } from 'openapi-types'

import { CommonActions } from '../types'

export interface OpenAPIGeneratorOptions extends Partial<Omit<OpenAPIV3_1.Document, 'openapi'>> {
  version?:      OpenAPIV3_1.Document['openapi']
  metaDefaults?: OpenAPIMeta
  contentType?:  string
}

export interface OpenAPIResourceMeta extends OpenAPIMeta {
  singular?: string
  plural?:   string
}

export interface OpenAPIMeta {
  idType?:  'string' | 'integer'
  actions?:  Record<CommonActions, Omit<OpenAPIV3_1.OperationObject, 'requestBody' | 'responses'> & {
    parameters?: Record<string, Partial<OpenAPIV3_1.ParameterObject>>
  }>
  responses?: Record<string, Omit<OpenAPIV3_1.ResponseObject, 'content'>>
}