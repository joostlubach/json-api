import * as FS from 'fs-extra'

import { ResourceConfig } from '../../ResourceConfig'
import jsonapi_config from '../../config'
import DoctextReader from './DoctextReader'
import { DoctextOptions } from './types'

export default function doctext<M, Q, I>(config: ResourceConfig<M, Q, I>, options: DoctextOptions = {}) {
  const tmp = {} as {stack: string}
  Error.captureStackTrace(tmp, doctext)

  const caller = tmp.stack.split('\n')[1].trim()
  const match = caller.match(/(\/[^<>:"\\|?*()]+?):(\d+):(\d+)/)
  if (match == null) {
    jsonapi_config.logger.warn("Could not determine the caller of doctext()", {
      caller,
    })
    return config
  }

  let content: string
  try {
    content = FS.readFileSync(match[1], 'utf8')
  } catch (error) {
    jsonapi_config.logger.warn("Failed to extract doctext resource with OpenAPI metadata", error, {
      file: match[1],
      line: match[2],
    })
    return config
  }
  
  const line = parseInt(match[2], 10)
  const reader = new DoctextReader(match[1], content, line, options)
  const meta = reader.readMetadata()
  if (meta != null) {
    Object.assign(config.openapi ??= {}, meta)
  }

  return config
}

export type { DoctextOptions }