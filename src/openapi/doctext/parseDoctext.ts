import * as Acorn from 'acorn'

import jsonapi_config from '../../config'
import { Doctext, DoctextEntities } from './types'

export default function parseDoctext(file: string, lineno: number, lines: string[], nodes: Acorn.Comment[]): Doctext {
  const [entities, rest] = extractEntities(lines)
  const {summary, description} = parseDoctextLines(rest)

  return {
    lineno,
    summary,
    description,
    entities,
    nodes,
  }

  function parseDoctextLines(lines: string[]) {
    // The description is the full text, but with newlines replaced with spaces.
    const description = lines.join(' ').replace(/\s+/g, ' ').trim()

    // The summary is only the first few lines until there is an explicit blank line.
    const blankLineIndex = lines.findIndex(it => it === '')
    const summary = blankLineIndex < 0
      ? description
      : lines.slice(0, blankLineIndex).join(' ').replace(/\s+/, ' ').trim()

    return {summary, description}
  }

  function extractEntities(lines: string[]): [DoctextEntities, string[]] {
    const entities: DoctextEntities = {}
    const rest: string[] = []

    const addEntity = (meta: EntityMeta, args: string[], lines: string[]) => {
      meta.add(entities, args, lines, parseDoctextLines)
    }

    let current: {
      meta:  EntityMeta,
      args:  string[],
      lines: string[]
    } | undefined

    entity: for (const [index, line] of lines.entries()) {
      // First check if we're currently in the content of an entity. If so, just add any content line and continue.
      if (current != null) {
        const contentMatch = line.match(ENTITY_CONTENT_RE)
        if (contentMatch != null) {
          current.lines.push(contentMatch[1].trim())
          continue entity
        }
      }

      // If not, add the current entity and start a new one.
      if (current != null) {
        addEntity(current.meta, current.args, current.lines)
      }

      // If the line does not match an entity line, add it to the rest lines and continue.
      const match = line.match(ENTITY_RE)
      if (match == null) {
        rest.push(line)
        continue entity
      }

      // Parse the entity and look it up.
      const entity = match[1]
      const meta = entityMeta[entity]
      if (meta == null) {
        jsonapi_config.logger.warn(`Unknown doctext entity: @${entity}`, {
          file,
          line: lineno + index,
        })
        continue entity
      }

      current = {
        meta,
        args:  [],
        lines: [],
      }

      let remainder = match[2] ?? ''

      // If the entity has arguments, parse them.
      for (let i = 0; i < meta.args; i++) {
        const match = remainder.match(/\s*(\S+)(?:\s+(.*)|$)/)
        if (match == null) {
          jsonapi_config.logger.warn(`Missing argument for @${entity}`, {
            file,
            line: lineno + index,
          })
          continue entity
        }

        current.args.push(match[1])
        remainder = match[2] ?? ''
      }

      if (remainder.trim().length > 0) {
        current.lines.push(remainder.trim())
      }
      if (!meta.content) {
        addEntity(meta, current.args, current.lines)
        current = undefined
      }
    }

    if (current != null) {
      addEntity(current.meta, current.args, current.lines)
    }

    return [entities, rest]
  }
}

const entityMeta: Record<string, EntityMeta> = {
  copy: {
    args:    1,
    content: false,
    
    add: (entities, args) => {
      entities.copy = args[0]
    },
  },
  property: {
    args:    1,
    content: true,
    
    add: (entities, args, lines, parseLines) => {
      entities.properties ??= {}
      entities.properties[args[0]] = parseLines(lines)
    },
  },
  link: {
    args:    1,
    content: true,
    
    add: (entities, args, lines, parseLines) => {
      const href = args[0]
      const caption = lines.length > 0 ? parseLines(lines).description : args[0]

      entities.links ??= []
      entities.links.push({href, caption})
    },
  },
}

interface EntityMeta {
  args:    number
  content: boolean
  add:     (entities: DoctextEntities, args: string[], lines: string[], parseLines: (lines: string[]) => Pick<Doctext, 'summary' | 'description'>) => void
}

const ENTITY_RE = /^\s*@(\w+)(?:\s+(.*?))?$/
const ENTITY_CONTENT_RE = /^\s{2,}(.*)$/