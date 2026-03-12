import { Request } from 'express'
import { omit } from 'lodash'
import { Deps } from 'ydeps'
import { Constructor, objectKeys, safeParseInt, sparse } from 'ytil'
import { z } from 'zod'
import APIError from './APIError'
import config from './config'
import { Filters, Sort } from './types'

export default class RequestContext<P extends Record<string, any> = Record<string, any>> {

  constructor(
    public readonly action: string,
    private readonly params: P,
    public readonly request: Request | null,
    deps?: Deps,
  ) {
    this.deps = new Deps({upstream: deps})
  }

  public readonly deps: Deps

  public clone(resetWellKnownParams: boolean = false) {
    const params = resetWellKnownParams ? omit(this.params, objectKeys($wellKnownParams)) : this.params
    return new RequestContext(this.action, params, this.request, this.deps)
  }

  // #region Parameters

  /**
   * Retrieves a param, and optionally validates / coerces it to the given type.
   *
   * @param name The name of the parameter to retrieve.
   * @param type Optionally a type to validate against.
   */
  public param<T extends z.ZodType<any>>(name: string & keyof P, schema: T): z.infer<T>
  public param(name: string & keyof P): unknown
  public param(name: string & keyof P, schema?: z.Schema) {
    let value = this.params[name]
    if (schema == null) { return value }

    const result = schema.safeParse(value)
    if (result.error != null) {
      throw new APIError(500, `Parameter \`${name}\`: ${result.error.message}`)
    }

    return result.data
  }

  public hasParam(name: string) {
    return this.param(name) != null    
  }

  public setParams(params: Partial<P>) {
    Object.assign(this.params, params)
  }

  // #endregion

  // #region Well known params

  public type() {
    return this.param('$type') as string
  }

  public scope() {
    if (config.paramExtractors.scope != null) {
      return config.paramExtractors.scope(this)
    } else {
      return this.param('scope', $wellKnownParams.scope)
    }
  }

  public search() {
    if (config.paramExtractors.search != null) {
      return config.paramExtractors.search(this)
    } else {
      return this.param('search', $wellKnownParams.search)
    }
  }

  public filters(): Filters {
    if (config.paramExtractors.filters != null) {
      return config.paramExtractors.filters(this)
    } else {
      return this.param('filters', $wellKnownParams.filters)
    }
  }

  public sorts(): Sort[] {
    if (config.paramExtractors.sorts != null) {
      return config.paramExtractors.sorts(this)
    } else {
      const sort = this.param('sort', z.string().optional())
      if (sort == null) { return [] }

      return sparse(sort.split(',').map(part => {
        part = part.trim()
        if (part.length === 0) { return null }

        let direction: 1 | -1 = 1
        if (part.startsWith('-')) {
          direction = -1
          part = part.substring(1)
        } else if (part.startsWith('+')) {
          part = part.substring(1)
        }

        return {field: part, direction}
      }))
    }
  }

  public skip(): number {
    if (config.paramExtractors.skip != null) {
      return config.paramExtractors.skip(this)
    } else {
      const raw = this.param('skip')
      const num = typeof raw === 'string' ? safeParseInt(raw) : raw
      return $wellKnownParams.skip.parse(num)
    }
  }

  public take(defaultPageSize: number | null) {
    const take = this.takeMaybe
    if (take == null && defaultPageSize !== undefined) {
      return defaultPageSize
    } else {
      return take
    }
  }

  private get takeMaybe() {
    if (config.paramExtractors.take != null) {
      return config.paramExtractors.take(this)
    } else {
      const raw = this.param('take')
      const num = typeof raw === 'string' ? safeParseInt(raw) : raw
      return $wellKnownParams.take.parse(num)
    }
  }

  // #endregion

  // #region Dependencies

  // Expose these to the context as direct methods, as they are used a lot, and the context is in
  // essence a dependency provider.

  public provide<Ctor extends Constructor<any>>(key: Ctor, getter: () => InstanceType<Ctor> | Promise<InstanceType<Ctor>>): void
  public provide<T>(key: any, getter: () => any | Promise<any>): void
  public provide(key: any, getter: () => any | Promise<any>) {
    return this.deps.provide(key, getter)
  }

  public get<Ctor extends Constructor<any>>(key: Ctor): InstanceType<Ctor>
  public get<T>(key: any): T
  public get(key: any) {
    return this.deps.get(key)
  }

  public getAsync<Ctor extends Constructor<any>>(key: Ctor): Promise<InstanceType<Ctor>>
  public getAsync<T>(key: any): Promise<T>
  public getAsync(key: any) {
    return this.deps.getAsync(key)
  }

  // #endregion

}

export const $wellKnownParams = {
  scope: z.string().optional(),
  filters: z.record(z.string(), z.unknown()).default(() => ({})),
  search: z.string().optional(),
  sorts: z.array(sort()).default(() => []),
  skip: z.number().int().default(0),
  take: z.number().int().optional(),
}

function sort() {
  return z.object({
    field: z.string(),
    direction: z.number().int().refine(n => n === 1 || n === -1, {message: 'Must be 1 (ascending) or -1 (descending)'}) as z.ZodType<-1 | 1>,
  })
}

export type WellKnownParam = keyof typeof $wellKnownParams
export type WellKnownParamTypeMap = {
  [P in keyof typeof $wellKnownParams]: z.output<typeof $wellKnownParams[P]>
}