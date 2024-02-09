import { MockJSONAPI } from './mock'

import RequestContext from '../RequestContext'

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

  describe("without parameters", () => {

    let out: any

    beforeEach(async () => {
      const pack = await jsonAPI.list('parents', {}, context('list'))
      out = pack.serialize()
    })

    it("should list documents of a specific resource type", async () => {
      expect(out).toEqual({
        data: [
          expect.objectContaining({type: 'parents', id: 'alice'}),
          expect.objectContaining({type: 'parents', id: 'bob'}),
          expect.objectContaining({type: 'parents', id: 'eve'}),
          expect.objectContaining({type: 'parents', id: 'frank'}),
        ],
        meta:     expect.any(Object),
        included: [],
        links:    {},
      })
    })
  
    it("should include relationships", async () => {
      expect(out.data[0].relationships).toEqual({
        spouse:   {data: {type: 'parents', id: 'bob'}},
        children: {data: [{type: 'children', id: 'charlie'}, {type: 'children', id: 'dolores'}]},
      })
      expect(out.data[1].relationships).toEqual({
        spouse:   {data: {type: 'parents', id: 'alice'}},
        children: {data: [{type: 'children', id: 'charlie'}, {type: 'children', id: 'dolores'}]},
      })
      expect(out.data[2].relationships).toEqual({
        spouse:   {data: {type: 'parents', id: 'frank'}},
        children: {data: [{type: 'children', id: 'isaac'}, {type: 'children', id: 'henry'}]},
      })
      expect(out.data[3].relationships).toEqual({
        spouse:   {data: {type: 'parents', id: 'eve'}},
        children: {data: [{type: 'children', id: 'isaac'}, {type: 'children', id: 'henry'}]},
      })
    
    })
  
  })

  describe("filtering", () => {

    let out: any

    beforeEach(async () => {
      const pack = await jsonAPI.list('parents', {
        filters: {
          age: (age: number) => age >= 40 && age < 60, // Our mock DB allows filter functions.
        },
      }, context('list'))
      out = pack.serialize()
    })

    it("should allow filtering", async () => {
      expect(out).toEqual({
        data: [
          expect.objectContaining({type: 'parents', id: 'bob'}),
          expect.objectContaining({type: 'parents', id: 'eve'}),
        ],
        meta:     expect.any(Object),
        included: [],
        links:    {},
      })
    })
  
  })


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