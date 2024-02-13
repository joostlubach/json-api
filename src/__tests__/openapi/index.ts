import * as FS from 'fs-extra'
import * as YAML from 'js-yaml'
import { OpenAPIV3_1 } from 'openapi-types'
import * as Path from 'path'

import { OpenAPIMeta } from '../../types'

export const info = YAML.load(FS.readFileSync(Path.join(__dirname, 'info.yml'), 'utf-8')) as OpenAPIV3_1.InfoObject
export const parents = YAML.load(FS.readFileSync(Path.join(__dirname, 'parents.yml'), 'utf-8')) as OpenAPIMeta
export const children = YAML.load(FS.readFileSync(Path.join(__dirname, 'children.yml'), 'utf-8')) as OpenAPIMeta