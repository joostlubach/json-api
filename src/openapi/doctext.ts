import * as Acorn from 'acorn'
import { tsPlugin } from 'acorn-typescript'
import acornWalk from 'acorn-walk'
import * as FS from 'fs-extra'
import { escapeRegExp, set } from 'lodash'

import { ResourceConfig } from '../ResourceConfig'
import config from '../config'
import { OpenAPIResourceMeta } from './types'

const logger = config.logger
const TsParser = Acorn.Parser.extend(tsPlugin() as any)

export default async function doctext<M, Q, I>(config: ResourceConfig<M, Q, I>, options: DocTextReaderOptions = {}) {
  const tmp = {} as {stack: string}
  Error.captureStackTrace(tmp, doctext)

  const caller = tmp.stack.split('\n')[1].trim()
  const match = caller.match(/\(([^:]+):(\d+):(\d+)\)/)
  if (match == null) {
    logger.warn("Could not determine the caller of doctext()")
    return config
  }

  let content: string
  try {
    content = await FS.readFile(match[1], 'utf8')
  } catch (error) {
    logger.warn("Failed to extract doctext resource with OpenAPI metadata", error)
    return config
  }
  
  const line = parseInt(match[2], 10)
  const reader = new DocTextReader(content, line, options)
  const meta = reader.readMetadata()
  if (meta != null) {
    Object.assign(config.openapi ??= {}, meta)
  }

  return config
}

class DocTextReader {

  // #region Construction & properties

  constructor(
    private readonly content: string,
    private readonly line: number,
    private readonly options: DocTextReaderOptions = {}
  ) {
    this.config = {
      ...config.openapi.doctext,
      ...options,
    }

    const marker = escapeRegExp(this.config.marker)
    this.markerRegExp = new RegExp(`${marker}([\\w\\W]*?)(?:${marker}|$)`)
  }

  private readonly config: Required<DocTextReaderOptions>

  private readonly markerRegExp: RegExp

  // #endregion

  // #region Interface

  public readMetadata(): OpenAPIResourceMeta | null {
    const [program, docTexts] = this.parse()

    const result = this.findConfigNode(program)
    if (!result.found) {
      logger.warn(result.reason)
      return null
    }

    const configNode = result.node
    const documentables = this.findDocumentables(configNode)

    const matched = this.matchDocumentablesWithDocTexts(documentables, docTexts)

    const meta: OpenAPIResourceMeta = {}
    for (const [documentable, docText] of matched) {
      if (docText == null) {
        logger.warn(`Could not find doc text for ${documentable.key}`)
        continue
      }

      set(meta, documentable.key, {
        summary:     docText.summary,
        description: docText.description,
      })
    }

    // If the first doctext was not used for anything else, interpret it as the doctext for the entire
    // resource.
    if (docTexts.length > 0 && !matched.some(([_, dt]) => docTexts[0] === dt)) {
      Object.assign(meta, {
        summary:     docTexts[0].summary,
        description: docTexts[0].description,
      })
    }

    return meta
  }

  // #endregion

  // #region Parsing

  private parse(): [Acorn.Program, DocText[]] {
    const comments: Acorn.Comment[] = []
    const program = TsParser.parse(this.content, {
      ecmaVersion: 'latest',
      locations:   true,
      sourceType:  'module',
      onComment:   comments,
    })

    const docTexts = this.findDocTexts(comments)
    return [program, docTexts]
  }

  private findConfigNode(program: Acorn.Program): FindResult<Acorn.ObjectExpression> {
    const doctextCall = acornWalk.findNodeAfter(program, this.line, (type, node) => {
      if (type !== 'CallExpression') { return false }

      const call = node as Acorn.CallExpression
      if (call.callee.type !== 'Identifier') { return false }
      if (call.callee.name !== 'doctext') { return false }

      return true
    })
    
    if (doctextCall == null) {
      return {
        found:  false,
        reason: "Could not find doctext() call",
      }
    }

    const callNode = doctextCall.node as Acorn.CallExpression
    if (callNode.arguments.length !== 1 || callNode.arguments[0].type !== 'ObjectExpression') {
      return {
        found:  false,
        reason: "doctext() must be called with a single object argument",
      }
    }

    return {
      found: true,
      node:  callNode.arguments[0] as Acorn.ObjectExpression,
    }
  }

  // #endregion

  // #region Comments & DocTexts

  private findDocTexts(comments: Acorn.Comment[]) {
    const docTexts: DocText[] = []
    const appendDocText = (docText: DocText | null) => {
      if (docText != null) {
        docTexts.push(docText)
      }
    }

    let lastCommentEnd: number | null = null
    let current: Acorn.Comment[] = []
    for (const comment of comments) {
      if (comment.loc == null) { continue }

      if (lastCommentEnd != null && comment.loc.start.line > lastCommentEnd + 1 && current.length > 0) {
        appendDocText(this.extractDocText(current))
        current = []
      }
      current.push(comment)
      lastCommentEnd = comment.loc.end.line
    }

    if (current.length > 0) {
      appendDocText(this.extractDocText(current))
    }

    return docTexts
  }
  
  private extractDocText(nodes: Acorn.Comment[]): DocText | null {
    if (nodes.length === 0) { return null }

    const line = nodes[0].loc?.start.line
    if (line == null) { return null }

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

    // The description is the full text, but with newlines replaced with spaces.
    const description = lines.join(' ').replace(/\s+/g, ' ').trim()

    // The summary is only the first few lines until there is an explicit blank line.
    const blankLineIndex = lines.findIndex(it => it === '')
    const summary = blankLineIndex < 0
      ? description
      : lines.slice(0, blankLineIndex).join(' ').replace(/\s+/, ' ').trim()

    return {line, summary, description, nodes}
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
    })

    return documentables
  }
  
  private matchDocumentablesWithDocTexts(documentables: Documentable[], docTexts: DocText[]): Array<[Documentable, DocText | null]> {
    const matched: Array<[Documentable, DocText | null]> = []
    const reversed = [...docTexts].reverse()

    const findClosestDocText = (line: number, prevLine: number) => {
      for (const docText of reversed) {
        if (docText.line < prevLine) { break }
        if (docText.line < line) { return docText }
      }

      return null
    }

    let prevLine: number = -1
    for (const documentable of documentables) {
      const docText = findClosestDocText(documentable.line, prevLine)
      prevLine = documentable.line

      if (docText != null) {
        matched.push([documentable, docText])
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

export interface DocTextReaderOptions {
  marker?: string
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

interface DocText {
  line:        number
  summary:     string
  description: string
  nodes:       Acorn.Comment[]
}

interface Documentable {
  key:  string
  line: number
  node: Acorn.Property
}

type FindResult<N extends Acorn.Node> = 
  | {found: true, node: N}
  | {found: false, reason: string}