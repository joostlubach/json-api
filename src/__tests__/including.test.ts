import { MockJSONAPI } from './mock'

import RequestContext from '../RequestContext'
import db, { Parent } from './db'

describe("including", () => {

  let jsonAPI: MockJSONAPI

  beforeEach(() => {
    db.seed()

    // Rather than creating mock functions, we, we've created a mock DB with a mock adapter that actually
    // sort of works. This exemplifies JSON API better.
    jsonAPI = new MockJSONAPI()
  })

  function context(action: string) {
    return new RequestContext(action, {})
  }

  describe.each([
    {action: 'list', call: (include: string[]) => jsonAPI.list('parents', {filters: {id: 'alice'}}, context('list'), {include})},
    {action: 'show', call: (include: string[]) => jsonAPI.show('parents', {id: 'alice'}, context('show'), {include})},
  ])("$action", ({call}) => {

    let out: any

    beforeEach(async () => {
    })

    it("should by default not include related models", async () => {
      const pack = await call([])
      out = pack.serialize()
      expect(out.included).toEqual([])
    })

    it("should include related models if requested", async () => {
      const pack = await call(['spouse'])
      out = pack.serialize()
      expect(out.included).toEqual([
        {
          type: 'parents',
          id:   'bob',

          attributes: {
            name: "Bob",
            age:  40,
          },
          relationships: {
            spouse: {
              data: {type: 'parents', id: 'alice'},
            },
            children: {
              data: [
                {type: 'children', id: 'charlie'},
                {type: 'children', id: 'dolores'},
              ],
            },
          },
        },
      ])
    })

    it("should silently ignore invalid paths (because they might be valid for models not retrieved)", async () => {
      const pack = await call(['grandparent'])
      out = pack.serialize()
      expect(out.included).toEqual([])
    })

    it("should allow specifying multiple paths to include", async () => {
      const pack = await call(['spouse', 'children'])
      out = pack.serialize()
      expect(out.included).toEqual([
        expect.objectContaining({type: 'parents', id: 'bob'}),
        expect.objectContaining({type: 'children', id: 'charlie'}),
        expect.objectContaining({type: 'children', id: 'dolores'}),
      ])
    })

    it("should allow specifying a compound expression to drill down using a + as a separator", async () => {
      // First, take away the children from Alice, but not from Bob.
      const alice = db('parents').get('alice') as Parent
      alice.children = []

      // Ensure that we don't retrieve these anymore.
      const out1 = (await call(['spouse', 'children'])).serialize()
      expect(out1.included).toEqual([
        expect.objectContaining({type: 'parents', id: 'bob'}),
      ])

      // Now, let's use the + to include Bob's children. Note that this also includes Bob, why not.
      const out2 = (await call(['spouse+children'])).serialize()
      expect(out2.included).toEqual([
        expect.objectContaining({type: 'parents', id: 'bob'}),
        expect.objectContaining({type: 'children', id: 'charlie'}),
        expect.objectContaining({type: 'children', id: 'dolores'}),
      ])
    })
  
  })

  describe("duplicates", () => {

    it("should never include the same model twice, nor get caught on cycles", async () => {
      const pack = await jsonAPI.show('parents', {id: 'alice'}, context('show'), {
        include: [
          'spouse',
          'spouse',
          'children',
          'spouse+children',
          'spouse+spouse',
          'spouse+spouse+children',
          'children+parent+spouse+children',
        ],
      })
      const out = pack.serialize()
      expect(out.included.map((it: any) => it.id).sort()).toEqual([
        'bob',
        'charlie',
        'dolores',
      ])
    })


    it("should never include models that are already present in the main data set", async () => {
      const pack = await jsonAPI.list('parents', {}, context('show'), {
        include: [
          'spouse',
          'spouse',
          'children',
          'spouse+children',
          'spouse+spouse',
          'spouse+spouse+children',
          'children+parent+spouse+children',
        ],
      })
      const out = pack.serialize()
      expect(out.included.map((it: any) => it.id).sort()).toEqual([
        'charlie',
        'dolores',
        'henry',
        'isaac',
      ])
    })

  })

    
})