import * as Acorn from 'acorn'
import { tsPlugin } from 'acorn-typescript'
import acornWalk, { base } from 'acorn-walk'
import { escapeRegExp, pick, set } from 'lodash'

import jsonapi_config from '../../config'
import { OpenAPIResourceMeta } from '../types'
import parseDoctext from './parseDoctext'
import { Doctext, DoctextOptions, Documentable } from './types'

const TsParser = Acorn.Parser.extend(tsPlugin() as any)
const looseBase = new Proxy(base, {
  has(target, key) { return true }, // Pretend all visitors are there.
  get(target, key, receiver) {
    if (key in target) {
      return (target as any)[key]
    } else {
      return () => {} // Return an empty function.
    }
  },
})

export default class DoctextReader {

  // #region Construction & properties

  constructor(
    public readonly file: string,
    private readonly content: string,
    private readonly line: number,
    private readonly options: DoctextOptions = {}
  ) {
    this.config = {
      ...jsonapi_config.openapi.doctext,
      ...options,
    }

    const marker = escapeRegExp(this.config.marker)
    this.markerRegExp = new RegExp(`${marker}([\\w\\W]*?)(?:${marker}|$)`)
  }

  private readonly config: Required<DoctextOptions>

  private readonly markerRegExp: RegExp

  // #endregion

  // #region Interface

  public readMetadata(): OpenAPIResourceMeta | null {
    const [program, doctexts] = this.parse()

    const configNode = this.findConfigNode(program)
    if (configNode == null) { return null }

    const documentables = this.findDocumentables(configNode)
    const matched = this.matchDocumentablesWithDoctexts(documentables, doctexts)

    this.resolveCopyDoctexts(matched)

    const meta: OpenAPIResourceMeta = {}
    for (const [documentable, doctext] of matched) {
      if (doctext == null) {
        jsonapi_config.logger.warn(`Missing doctext for \`${documentable.key}\``, {
          file: this.file,
          line: documentable.line,
        })
        continue
      }

      set(meta, documentable.key, {
        summary:     doctext.summary,
        description: doctext.description,
      })
    }

    // If the first doctext was not used for anything else, interpret it as the doctext for the entire
    // resource.
    if (doctexts.length > 0 && !matched.some(([_, dt]) => doctexts[0] === dt)) {
      Object.assign(meta, {
        summary:     doctexts[0].summary,
        description: doctexts[0].description,
      })
    }

    return meta
  }

  // #endregion

  // #region Parsing

  private parse(): [Acorn.Program, Doctext[]] {
    const comments: Acorn.Comment[] = []
    const program = TsParser.parse(this.content, {
      ecmaVersion: 'latest',
      locations:   true,
      sourceType:  'module',
      onComment:   comments,
    })

    const doctexts = this.findDoctexts(comments)
    return [program, doctexts]
  }

  private findConfigNode(program: Acorn.Program): Acorn.ObjectExpression | null {
    const doctextCall = acornWalk.findNodeAt(program, undefined, undefined, (type, node) => {
      if (node.loc == null) { return false }
      if (node.loc.start.line !== this.line) { return false }

      if (type !== 'CallExpression') { return false }

      const call = node as Acorn.CallExpression
      if (call.callee.type !== 'Identifier') { return false }
      if (call.callee.name !== 'doctext') { return false }

      return true
    }, looseBase)
    
    if (doctextCall == null) {
      jsonapi_config.logger.warn("Could not find doctext() call", {
        file: this.file,
        line: this.line,
      })
      return null
    }

    const callNode = doctextCall.node as Acorn.CallExpression
    if (callNode.arguments.length !== 1) {
      jsonapi_config.logger.warn("doctext() must be called with a single argument", {
        file: this.file,
        line: this.line,
      })
      return null
    }
    if (callNode.arguments[0].type !== 'ObjectExpression') {
      jsonapi_config.logger.warn("the argument doctext() must be the literal resource config object", {
        file: this.file,
        line: this.line,
      })
      return null
    }

    return callNode.arguments[0] as Acorn.ObjectExpression
  }

  // #endregion

  // #region Comments & Doctexts

  private findDoctexts(comments: Acorn.Comment[]) {
    const doctexts: Doctext[] = []
    const appendDoctext = (doctext: Doctext | null) => {
      if (doctext != null) {
        doctexts.push(doctext)
      }
    }

    let lastCommentEnd: number | null = null
    let current: Acorn.Comment[] = []
    for (const comment of comments) {
      if (comment.loc == null) { continue }

      if (lastCommentEnd != null && comment.loc.start.line > lastCommentEnd + 1 && current.length > 0) {
        appendDoctext(this.extractDoctext(current))
        current = []
      }
      current.push(comment)
      lastCommentEnd = comment.loc.end.line
    }

    if (current.length > 0) {
      appendDoctext(this.extractDoctext(current))
    }

    return doctexts
  }
  
  private extractDoctext(nodes: Acorn.Comment[]): Doctext | null {
    if (nodes.length === 0) { return null }

    const lineno = nodes[0].loc?.start.line
    if (lineno == null) { return null }

    // Build a full text from all nodes, inserting newlines at node boundaries.
    const fullText = nodes.reduce((acc, node) => acc + '\n' + node.value, '')

    // Match this to extract the """-delimited (or other marker) doctext.
    const match = fullText.match(this.markerRegExp)
    if (match == null) { return null }

    const lines = match[1]
      .split('\n')
      .map(it => it.replace(/^\s*(\/\/|\*)/, ''))
      .map(it => it.replace(/\s{2,}/, ' ').trim())

    // Remove any leading or trailing blank lines only.
    while (lines.length > 0 && lines[0] === '') { lines.shift() }
    while (lines.length > 0 && lines[lines.length - 1] === '') { lines.pop() }

    return parseDoctext(this.file, lineno, lines, nodes)
  }

  private resolveCopyDoctexts(matched: Array<[Documentable, Doctext | null]>) {
    for (const [_, doctext] of matched) {
      if (doctext?.entities?.copy == null) { continue }

      const original = matched.find(it => it[0].key === doctext.entities.copy)
      if (original == null) {
        jsonapi_config.logger.warn(`Could not find doctext to copy from \`${doctext.entities.copy}\``, {
          file: this.file,
          line: doctext.lineno,
        })
        continue
      }

      Object.assign(doctext, pick(original[1], 'summary', 'description'))
    }
  }

  // #endregion

  // #region Documentables

  private findDocumentables(config: Acorn.ObjectExpression): Documentable[] {
    const documentables: Documentable[] = []
    acornWalk.ancestor(config, {
      Property: (node, _, ancestors) => {
        if (node.loc == null) { return }

        const key = this.nestedPropertyKey(ancestors)
        if (key == null) { return }
        if (!extractableKeys.some(re => re.test(key))) { return }

        documentables.push({
          key, 
          line: node.loc.start.line,
          node: node as Acorn.Property,
        })
      },
    }, looseBase)

    return documentables
  }
  
  private matchDocumentablesWithDoctexts(documentables: Documentable[], doctexts: Doctext[]): Array<[Documentable, Doctext | null]> {
    const matched: Array<[Documentable, Doctext | null]> = []
    const reversed = [...doctexts].reverse()

    const findClosestDoctext = (line: number, prevLine: number) => {
      for (const doctext of reversed) {
        if (doctext.lineno < prevLine) { break }
        if (doctext.lineno < line) { return doctext }
      }

      return null
    }

    let prevLine: number = -1
    for (const documentable of documentables) {
      const doctext = findClosestDoctext(documentable.line, prevLine)
      prevLine = documentable.line

      if (doctext != null) {
        matched.push([documentable, doctext])
      } else {
        matched.push([documentable, null])
      }
    }

    return matched
  }

  private nestedPropertyKey(ancestors: Acorn.Node[]): string | null {
    let keys: string[] = []
    for (const node of ancestors) {
      if (node.type === 'Property') {
        const keyNode = (node as Acorn.Property).key

        // For some reason, if the property value is a function (method), the key node is not an Identifier
        // but a direct Literal.
        if (keyNode.type === 'Identifier') {
          keys.push(keyNode.name)
        } else if (keyNode.type === 'Literal' && typeof keyNode.value === 'string') {
          keys.push(keyNode.value as string)
        }
      }
      if (!['Property', 'ObjectExpression'].includes(node.type)) {
        return null
      }
    }

    return keys.join('.')
  }

  // #endregion

}

const extractableKeys = [
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
]