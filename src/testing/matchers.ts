import chalk from 'chalk'
import { isArray, isFunction, isObject, isPlainObject } from 'lodash'

import Pack from '../Pack'
import { Links, Meta } from '../types'

expect.extend({

  toBeAListPackOf(actual: unknown, resource: string, options?: ExpectedListPackOptions) {
    const pack: PackMatcher = new PackMatcher(resource, options, this)
    return pack.match(actual)
  },

})

export function document() {
  return new ExpectedDocument()
}

export class PackMatcher {

  constructor(
    private readonly type: string,
    private readonly options: ExpectedListPackOptions = {},
    private readonly context: jest.MatcherContext
  ) {}

  // #region Match

  public match(actual: unknown): jest.CustomMatcherResult {
    if (!isPlainObject(actual)) {
      return {
        pass:    false,
        message: () => chalk`Expected pack to be a plain object, was a {bold ${describeType(actual)}}`,
      }
    }
    
    const pack = actual as Pack<any>
    let result: jest.CustomMatcherResult | undefined
    if ((result = this.checkData(pack)) !== undefined) {
      return result
    }
    if ((result = this.checkMeta(pack)) !== undefined) {
      return result
    }

    return {
      pass:    true,
      message: () => "Expected pack to contain resources",
    }
  }

  // #endregion

  // #region Data checker

  private checkData(actual: Pack<any>) {
    if (!('data' in actual)) {
      return {
        pass:    false,
        message: () => "Expected pack to contain data",
      }
    }

    if (this.options.data === undefined) { return }

    const expectNull = this.options.data === null
    const isNull = actual.data === null
    if (expectNull) {
      return {
        pass:    isNull,
        message: () => chalk`Expected {underline .data} to be null`,
      }
    } else if (isNull) {
      return {
        pass:    false,
        message: () => chalk`Expected {underline .data} not to be \`null\``,
      }
    }

    const expectList = isArray(this.options.data)
    if (expectList) {
      if (!isArray(actual.data)) {
        return {
          pass:    false,
          message: () => chalk`Expected {underline .data} to be a list`,
        }
      } else {
        return this.checkList(actual.data)
      }
    } else {
      if (isArray(actual.data)) {
        return {
          pass:    false,
          message: () => chalk`Expected {underline .data} to be a single instance`,
        }
      } else {
        return this.checkSingle(actual.data)
      }
    }
  }

  private checkList(actual: unknown[]) {
    const expected = this.options.data as ExpectedDocument[]
    for (const [index, resource] of actual.entries()) {
      expected[index].type = this.type
      const result = expected[index].match(resource, chalk`{underline .data[${index}]}`, this.context)
      if (!result.pass) { return result }
    }

    return {
      pass:    true,
      message: () => "Did not expect resources to match",
    }
  }

  private checkSingle(actual: unknown) {
    const expected = this.options.data as ExpectedDocument
    expected.type = this.type
    return expected.match(actual, chalk`{underline .data}`, this.context)
  }

  // #endregion

  // #region Meta checker
  
  private checkMeta(actual: Pack<any>) {
    if (this.options.meta != null && !('meta' in actual)) {
      return {
        pass:    false,
        message: () => chalk`Expected pack to contain {underline .meta}`,
      }
    }

    if (!isPlainObject(actual.meta)) {
      return {
        pass:    false,
        message: () => chalk`Expected {underline .meta} to be a plain object, was a {bold ${describeType(actual.meta)}}`,
      }
    }

    if (this.options.meta == null) { return }

    for (const [name, value] of Object.entries(this.options.meta)) {
      if (!(name in actual.meta)) {
        return {
          pass:    false,
          message: () => chalk`Expected {underline .meta} to contain {underline .${name}}`,
        }
      }

      if (!this.context.equals(actual.meta[name], value)) {
        return {
          pass:    false,
          message: () => chalk`Expected {underline .meta.${name}} to be {bold ${describeValue(value)}} but it was {bold ${describeValue(actual.meta[name])}}`,
        }
      }
    }

    if (this.options.exactMeta !== false) {
      for (const name of Object.keys(actual.meta)) {
        if (!(name in this.options.meta)) {
          return {
            pass:    false,
            message: () => chalk`Did not expect {underline .meta} to contain {underline .${name}}`,
          }
        }
      }
    }

  }

  // #endregion
  
}

export class ExpectedDocument {

  public type?:           string
  public id?:             string | null
  public attributes?:     Record<string, any>
  public exactAttributes: boolean = false
  public timestamps:      boolean = true

  public withID(id: string | null) {
    this.id = id
    return this
  }

  public withAttrs(attrs: Record<string, any>) {
    this.attributes = attrs
    return this
  }

  public withExactAttrs(attrs: Record<string, any>) {
    this.attributes = attrs
    this.exactAttributes = true
    return this
  }
  
  public withoutTimestamps() {
    this.timestamps = false
  }

  public match(actual: unknown, what: string, context: jest.MatcherContext): jest.CustomMatcherResult {
    if (!isPlainObject(actual)) {
      return {
        pass:    false,
        message: () => chalk`Expected ${what} to be a plain object, was a {bold ${describeType(actual)}}`,
      }
    }

    const resource = actual as Record<string, any>

    let result: jest.CustomMatcherResult | undefined
    if ((result = this.checkType(resource, what, context)) !== undefined) {
      return result
    }
    if ((result = this.checkID(resource, what, context)) !== undefined) {
      return result
    }
    if ((result = this.checkAttributes(resource, what, context)) !== undefined) {
      return result
    }
    
    return {
      pass:    true,
      message: () => `Did not expect ${what} to match`,
    }
  }


  private checkType(actual: Record<string, any>, what: string, context: jest.MatcherContext) {
    if (!('type' in actual)) {
      return {
        pass:    false,
        message: () => chalk`Expected ${what} to have {underline .type}`,
      }
    }

    if (this.type !== undefined && actual.type !== this.type) {
      return {
        pass:    false,
        message: () => chalk`Expected ${what} to have {underline .type} {bold ${this.type}}`,
      }
    }
  }

  private checkID(actual: Record<string, any>, what: string, context: jest.MatcherContext) {
    if (!('id' in actual)) {
      return {
        pass:    false,
        message: () => chalk`Expected ${what} to have {underline .id}`,
      }
    }

    if (this.id !== undefined && actual.id !== this.id) {
      return {
        pass:    false,
        message: () => chalk`Expected ${what} to have {underline .id} {bold ${this.id}}`,
      }
    }
  }
  
  private checkAttributes(actual: Record<string, any>, what: string, context: jest.MatcherContext) {
    if (!('attributes' in actual)) {
      return {
        pass:    false,
        message: () => chalk`Expected ${what} to have {underline .attributes}`,
      }
    }

    if (!isPlainObject(actual.attributes)) {
      return {
        pass:    false,
        message: () => chalk`Expected of ${what}{underline .attributes} to be a plain object, was a {bold ${describeType(actual.attributes)}}`,
      }
    }

    if (this.attributes === undefined && !this.timestamps) { return }

    const attributes = {
      ...this.attributes,
      ...this.timestamps && {
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    }

    for (const [name, value] of Object.entries(attributes)) {
      if (!(name in actual.attributes)) {
        return {
          pass:    false,
          message: () => chalk`Expected ${what}{underline .attributes} to contain {underline .${name}}`,
        }
      }

      if (!context.equals(actual.attributes[name], value)) {
        return {
          pass:    false,
          message: () => chalk`Expected ${what}{underline .attributes.${name}} to be {bold ${describeValue(value)}} but it was {bold ${describeValue(actual.attributes[name])}}`,
        }
      }
    }

    if (this.exactAttributes) {
      for (const name of Object.keys(actual.attributes)) {
        if (!(name in attributes)) {
          return {
            pass:    false,
            message: () => chalk`Did not expect ${what}{underline .attributes} to contain {underline .${name}}`,
          }
        }
      }
    }
  }

}

function describeValue(value: any) {
  if (isObject(value) && 'toAsymmetricMatcher' in value && isFunction(value.toAsymmetricMatcher)) {
    return value.toAsymmetricMatcher()
  } else if (isObject(value) && value.constructor != null) {
    const description = value.toString()
    if (!description.includes(value.constructor.name)) {
      return `${value.constructor.name}(${description})`
    }
  } else {
    return `${value}`
  }
}

function describeType(value: any) {
  if (isObject(value) && 'toAsymmetricMatcher' in value && isFunction(value.toAsymmetricMatcher)) {
    return value.toAsymmetricMatcher()
  } else if (isObject(value) && value.constructor != null) {
    return value.constructor.name
  } else {
    return typeof value
  }
}

export interface ExpectedListPackOptions {
  data?:      ExpectedDocument | ExpectedDocument[] | null
  meta?:      Meta
  exactMeta?: boolean
  links?:     Links
}

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeAListPackOf(expected: string, options?: ExpectedListPackOptions): R
    }
  }
}
