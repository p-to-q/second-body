/**
 * 把 STL / OBJ 读成 glTF Document，好让真实机器人的 CAD 网格走**同一条**规范化流水线。
 *
 * 为什么需要这个文件：198 件资产至今全部来自 Rodin，Rodin 只吐 glb，所以 `normalize.ts`
 * 直接 `io.read()` 就够了。而厂商公开的机器人几何（ROS `*_description`、MuJoCo Menagerie）
 * 是 STL 和 OBJ —— 这是唯一挡在「真机几何」和「我们的槽位契约」之间的格式差。
 *
 * 为什么不在 normalize.ts 里就地解析：那个文件跑着 198 件已入库资产，它的语义一个字节都不能动。
 * 格式转换是**读取之前**的事，和规范化无关，所以它属于这里。normalize 只多认一种输入。
 *
 * 为什么用 three 的 loader 而不是自己写：three 已经是仓库的依赖（app 用它渲染），
 * 它的 STLLoader / OBJLoader 不碰 DOM、不碰 window，在 Node 里直接可用（已验证）。
 * 自己写 STL 解析器要处理 ASCII/二进制两种、字节序、以及 OBJ 的 negative index —— 没有理由重写。
 *
 * **DAE / Collada 走不通**：ColladaLoader 需要 `DOMParser`，Node 22 没有这个全局。
 * 要支持 DAE 得加 `@xmldom/xmldom` 这类新依赖 —— 没加，见 `docs/33` §5。
 * 好消息是 Menagerie 全是 STL/OBJ，DAE 只在老的 ROS 包里才是必须的。
 */
import { Document } from '@gltf-transform/core';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

/** 我们能从原始网格里认的东西只有这两样 —— 贴图和 UV 在规范化第 2 步无论如何都会被丢掉。 */
interface RawPrim { position: Float32Array; normal?: Float32Array; index?: Uint32Array; }

export const IMPORTABLE_EXT = ['.stl', '.obj'];
export const isImportableMesh = (path: string) => IMPORTABLE_EXT.includes(extname(path).toLowerCase());

function primsFromStl(buf: Buffer): RawPrim[] {
  // STLLoader 要一个真正的 ArrayBuffer；Buffer 是共享 pool 上的视图，直接传会读到邻居的字节。
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const g = new STLLoader().parse(ab);
  return [{
    position: g.attributes.position.array as Float32Array,
    normal: g.attributes.normal?.array as Float32Array | undefined,
  }];
}

function primsFromObj(buf: Buffer): RawPrim[] {
  const root = new OBJLoader().parse(buf.toString('utf8'));
  const out: RawPrim[] = [];
  // OBJ 的 group / usemtl 会被拆成多个子 Mesh。全部收下，交给 normalize 的 join() 合成单 mesh
  // —— 契约要求单 mesh，但合并是规范化的职责，不是读取的职责。
  root.traverse((o: any) => {
    const g = o.geometry;
    if (!g?.attributes?.position) return;
    out.push({
      position: g.attributes.position.array as Float32Array,
      normal: g.attributes.normal?.array as Float32Array | undefined,
      index: g.index ? Uint32Array.from(g.index.array as ArrayLike<number>) : undefined,
    });
  });
  return out;
}

/**
 * 读一个 STL/OBJ，返回一个只含几何的 Document。
 * 故意不建材质：规范化第 2 步会把材质清成中性，运行时统一套 `materials[]`（docs/03 §4）。
 */
export function readMeshFile(path: string): Document {
  const buf = readFileSync(path);
  const ext = extname(path).toLowerCase();
  const prims = ext === '.stl' ? primsFromStl(buf) : primsFromObj(buf);
  if (!prims.length || !prims.some((p) => p.position.length)) throw new Error(`${path}: 没读出任何顶点`);

  const doc = new Document();
  const buffer = doc.createBuffer();
  const mesh = doc.createMesh('imported');
  for (const p of prims) {
    if (!p.position.length) continue;
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(p.position)).setBuffer(buffer));
    if (p.normal?.length === p.position.length)
      prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(p.normal)).setBuffer(buffer));
    if (p.index?.length)
      prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(p.index).setBuffer(buffer));
    mesh.addPrimitive(prim);
  }
  doc.createScene().addChild(doc.createNode('imported').setMesh(mesh));
  return doc;
}
