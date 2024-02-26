import { DoctextReader } from 'doctext'
import { get, pick, set } from 'lodash'
import { objectEntries } from 'ytil'

import { ResourceConfig } from '../ResourceConfig'
import jsonapi_config from '../config'

const reader = DoctextReader.create(doctext, {
  ...jsonapi_config.openapi.doctext,
  whitelist: [
    /^labels\.[^.]+$/,
    /^filters\.[^.]+$/,
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
    const attrMeta = get(meta, key) ?? {}
    Object.assign(attrMeta, pick(doctext, 'summary', 'description'))
    set(meta, key, attrMeta)
  }

  if (result.unmatched.length > 0) {
    Object.assign(meta, pick(result.unmatched[0], 'summary', 'description'))
  }

  for (const key of result.undocumentedKeys) {
    jsonapi_config.logger.warn(`Missing doctext for \`${key}\``)
  }

  return config
}

export interface DoctextOptions {

}