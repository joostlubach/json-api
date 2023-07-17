import * as FS from 'fs-extra'
import * as YAML from 'js-yaml'
import { get } from 'lodash'
import * as Path from 'path'

export default class OpenAPIGenerator {

  constructor(
    private readonly dir: string,
    private readonly version: string,
    private readonly baseURL: string
  ) {}

  public async generate() {
    return {
      ...await this.loadBase(),

      components: [
        ...await this.loadResources(),
      ],
    }
  }

  private async loadBase() {
    return await this.loadFile('openapi.yml', {
      version: this.version,
      baseURL: this.baseURL,
    }) as Record<string, any>
  }

  private async loadResources() {
    const resourceDir = Path.join(this.dir, 'resources')
    const files       = await FS.readdir(resourceDir)
    return await Promise.all(files.map(file => this.loadResource(Path.join(resourceDir, file))))
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async loadResource(path: string) {
    // TODO
    return {}
  }

  //------
  // Support

  private async loadFile(path: string, interpolation: Record<string, any> = {}) {
    const fullPath = Path.isAbsolute(path) ? path : Path.join(this.dir, path)

    let yaml = await FS.readFile(fullPath, 'utf8')
    yaml = yaml.replace(/\{\{(.*?)\}\}/g, (_, expression) => {
      const parts = (expression as string).split('.', 2).map(it => it.trim())

      let value = interpolation[parts[0]]
      if (value != null && parts.length > 1) {
        value = get(value, parts[1])
      }
      return value ?? ''
    })

    return YAML.load(yaml)
  }

}