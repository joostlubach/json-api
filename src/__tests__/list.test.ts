import { MockJSONAPI } from './mock'

import RequestContext from '../RequestContext'
import { resource } from '../testing/matchers'

describe("list", () => {

  let jsonAPI: MockJSONAPI

  beforeEach(() => {
    // Rather than creating mock functions, we, we've created a mock DB with a mock adapter that actually
    // sort of works. This exemplifies JSON API better.
    jsonAPI = new MockJSONAPI()
  })

  function context(action: string) {
    return new RequestContext(action, {})
  }


  it("should list resources", async () => {
    const pack = await jsonAPI.list('parents', {}, context('list'))
    expect(pack).toBeAListPackOf('parents', {
      data: [
        resource().withExactAttrs({name: "Parent 3", age: 60}),
        resource().withExactAttrs({name: "Parent 4", age: 80}),
      ],
    })
  })

  // it("should allow filtering", async () => {
  //   const response = await io.call('data.parents.list', [{
  //     filters: {
  //       age: {$gt: 40},
  //     },
  //   }], context(user))
  //   expect(response).toBeAListPackOf('parents', {
  //     data: [
  //       resource().withExactAttrs({name: "Parent 3", age: 60}),
  //       resource().withExactAttrs({name: "Parent 4", age: 80}),
  //     ],
  //   })
  // })

  // it("should allow searching", async () => {
  //   registry.modify(Parent, {
  //     search: searchOn('name'),
  //   })
  //   const response = await io.call('data.parents.list', [{
  //     search: "3",
  //   }], context(user))
  //   expect(response).toBeAListPackOf('parents', {
  //     data: [
  //       resource().withExactAttrs({name: "Parent 3", age: 60}),
  //     ],
  //   })
  // })

  // it("should allow sorting", async () => {
  //   const response = await io.call('data.parents.list', [{
  //     sorts: [
  //       {field: 'age', direction: -1},
  //     ],
  //   }], context(user))
  //   expect(response).toBeAListPackOf('parents', {
  //     data: [
  //       resource().withExactAttrs({name: "Parent 4", age: 80}),
  //       resource().withExactAttrs({name: "Parent 3", age: 60}),
  //       resource().withExactAttrs({name: "Parent 2", age: 40}),
  //       resource().withExactAttrs({name: "Parent 1", age: 20}),
  //     ],
  //   })
  // })

  // it("should allow pagination", async () => {
  //   const response = await io.call('data.parents.list', [{
  //     offset: 1,
  //     limit:  2,
  //   }], context(user))
  //   expect(response).toBeAListPackOf('parents', {
  //     data: [
  //       resource().withExactAttrs({name: "Parent 2", age: 40}),
  //       resource().withExactAttrs({name: "Parent 3", age: 60}),
  //     ],
  //   })
  // })

  // it("should not include detail properties", async () => {
  //   registry.modify(Parent, {
  //     attributes: {
  //       name: true,
  //       age:  {detail: true},
  //     },
  //   })

  //   const response = await io.call('data.parents.list', [{
  //     limit: 1,
  //   }], context(user))
  //   expect(response).toBeAListPackOf('parents', {
  //     data: [
  //       resource().withExactAttrs({name: "Parent 1"}),
  //     ],
  //   })
  // })

  // it("should include pagination info in the meta", async () => {
  //   const response = await io.call('data.parents.list', [], context(user))
  //   expect(response).toBeAListPackOf('parents', {
  //     meta: {
  //       total:      4,
  //       count:      4,
  //       offset:     0,
  //       limit:      dataConfig.pageSize,
  //       nextOffset: null,
  //       isFirst:    true,
  //       isLast:     true,
  //     },
  //   })
  // })

  // it("should reflect proper pagination info if offset and limit are given", async () => {
  //   const response = await io.call('data.parents.list', [{
  //     offset: 3,
  //     limit:  2,
  //   }], context(user))
  //   expect(response).toBeAListPackOf('parents', {
  //     meta: {
  //       total:      4,
  //       count:      1,
  //       offset:     3,
  //       limit:      2,
  //       nextOffset: null,
  //       isFirst:    false,
  //       isLast:     true,
  //     },
  //   })
  // })
    
})