import { OpenAPIV3_1 } from 'openapi-types'
import { DeepPartial } from 'ytil'

import { CommonActions } from '../types'

export interface OpenAPIGeneratorOptions extends Partial<Omit<OpenAPIV3_1.Document, 'openapi'>> {
  version?:  OpenAPIV3_1.Document['openapi']
  defaults?: OpenAPIMeta
}

export interface OpenAPIResourceMeta extends OpenAPIMeta {
  singular?: string
  plural?:   string

  summary?:     string
  description?: string

  attributes?:    Record<string, DeepPartial<OpenAPIV3_1.SchemaObject>>
  relationships?: Record<string, DeepPartial<OpenAPIV3_1.SchemaObject>>
}

export interface OpenAPIMeta {
  idType?:  'string' | 'integer'
  actions?:  Partial<Record<CommonActions, DeepPartial<Omit<OpenAPIV3_1.OperationObject, 'requestBody' | 'responses'>>> & {
    parameters?: Record<string, DeepPartial<OpenAPIV3_1.ParameterObject>>
  }>
  responses?: Record<string, DeepPartial<Omit<OpenAPIV3_1.ResponseObject, 'content'>>>
}
