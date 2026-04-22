import { Request } from 'express'
import { omit } from 'lodash'
import { Deps } from 'ydeps'
import { Constructor, objectKeys, sparse } from 'ytil'
import { z } from 'zod'
import config from './config'
import { ActionClass, Filters, Sort } from './types'
import { booleanQueryParam } from './util'

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

  public type() {
    return this.param('$type') as string
  }

  // #region Action related info

  public get actionClass() {
    if (this.action === 'list' || this.action === 'show') {
      return ActionClass.Read
    } else if (this.action === 'create' || this.action === 'update') {
      return ActionClass.Write
    } else if (this.action === 'delete') {
      return ActionClass.Delete
    } else {
      return ActionClass.Unknown
    }
  }

  public get isMutating() {
    return this.actionClass === ActionClass.Write || this.actionClass === ActionClass.Delete
  }

  // #endregion

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
      const issues = result.error.issues.map(issue => ({...issue, path: [name, ...issue.path]}))
      throw new z.ZodError(issues)
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

  private _scope: string | undefined
  private _search: string | undefined
  private _filters: Filters | undefined
  private _sorts: Sort[] | undefined
  private _dryRun: boolean | undefined

  public scope(scope?: string) {
    if (scope != null) {
      this._scope = scope
    }

    return this._scope ?? this.defaultScope()
  }

  private defaultScope() {
    if (config.paramExtractors.scope != null) {
      return config.paramExtractors.scope(this)
    } else {
      return this.param('scope', $wellKnownParams.scope)
    }
  }

  public search(search?: string) {
    if (search != null) {
      this._search = search
    }

    return this._search ?? this.defaultSearch()
  }

  private defaultSearch() {
    if (config.paramExtractors.search != null) {
      return config.paramExtractors.search(this)
    } else {
      return this.param('search', $wellKnownParams.search)
    }
  }

  public filters(): Filters {
    return {
      ...this._filters,
      ...this.defaultFilters(),
    }
  }

  public filter(filters: Partial<Filters>) {
    this._filters = {
      ...this._filters,
      ...filters,
    }
  }

  private defaultFilters() {
    if (config.paramExtractors.filters != null) {
      return config.paramExtractors.filters(this)
    } else {
      return this.param('filters', $wellKnownParams.filters)
    }
  }

  public sorts(sorts?: Sort[]): Sort[] {
    if (sorts != null) {
      this._sorts = sorts
    }

    return this._sorts ?? this.defaultSorts()
  }

  private defaultSorts() {
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

  public get isDryRun() {
    if (this._dryRun != null) {
      return this._dryRun
    } else {
      return this.defaultDryRun()
    }
  }

  private defaultDryRun() {
    if (config.paramExtractors.dryRun != null) {
      return config.paramExtractors.dryRun(this)
    } else {
      return this.param('dryrun', booleanQueryParam().default(false))
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

  // #region Custom data

  private customData = new Map<string, any>()

  public getCustom<T>(key: string): T | undefined {
    return this.customData.get(key) as T | undefined
  } 

  public setCustom(key: string, value: unknown) {
    this.customData.set(key, value)
  }

  // #endregion

}

export const $wellKnownParams = {
  scope:     z.string().optional(),
  filters:   z.record(z.string(), z.unknown()).default(() => ({})),
  search:    z.string().optional(),
  sorts:     z.array(sort()).default(() => []),
  pageToken: z.string().nullable().default(null),
  dryRun:    booleanQueryParam().default(false),
}

function sort() {
  return z.object({
    field:     z.string(),
    direction: z.number().int().refine(n => n === 1 || n === -1, {message: 'Must be 1 (ascending) or -1 (descending)'}) as z.ZodType<-1 | 1>,
  })
}

export type WellKnownParam = keyof typeof $wellKnownParams
export type WellKnownParamTypeMap = {
  [P in keyof typeof $wellKnownParams]: z.output<typeof $wellKnownParams[P]>
}