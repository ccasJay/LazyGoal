/**
 * Web 模型目录与模型选项数据传输对象 (DTO)。
 *
 * @remarks
 * 类型与约束的唯一来源是 [`wire.ts`](./wire.ts)；本模块只保留既有公开导入路径。
 */

export type {
    BrowserModelCatalog,
    BrowserModelCatalogError,
    BrowserModelCatalogNotice,
    BrowserModelCatalogReadResult,
    BrowserModelMetadataSource,
    BrowserModelOption,
    BrowserModelSource,
    BrowserModelSourceRef,
} from "./wire";
