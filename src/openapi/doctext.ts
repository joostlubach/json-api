import { DoctextReader } from 'doctext'
import { get, set } from 'lodash'
import { objectEntries } from 'ytil'

import { OpenAPIDocumentation } from '../Adapter'
import { ResourceConfig } from '../ResourceConfig'
import jsonapi_config from '../config'

const reader = DoctextReader.create(doctext, {
  ...jsonapi_config.openapi.doctext,
  whitelist: [
    /^labels\.[^.]+$/,
    /^filters\.[^.]+$/,
    /^singletons.[^.]+$/,
    /^attributes\.[^.]+$/,
    /^relationships\.[^.]+$/,
    /^list$/,
    /^show$/,
    /^create$/,
    /^replace$/,
    /^update$/,
    /^delete$/,
    /^collectionActions\.[^.]+$/,
    /^documentActions\.[^.]+$/,
  ],
})


export default function doctext<M, Q, I>(config: ResourceConfig<M, Q, I>) {
  const result = reader.readSync(config)

  const meta = config.openapi ??= {}
  for (const [key, doctext] of objectEntries(result.matched)) {
    const attrMeta: OpenAPIDocumentation = get(meta, key) ?? {}
    attrMeta.title = doctext.summary
    attrMeta.description = doctext.body
    set(meta, key, attrMeta)
  }

  if (result.unmatched.length > 0) {
    meta.summary = result.unmatched[0].summary
    meta.description = result.unmatched[0].body
  }

  for (const key of result.undocumentedKeys) {
    jsonapi_config.logger.warn(`Missing doctext for \`${key}\``)
  }

  return config
}

export interface DoctextOptions {

}