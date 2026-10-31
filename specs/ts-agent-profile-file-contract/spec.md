---
status: proposed
created_at: 2026-10-31
supersedes: []
superseded_by: null
---

# AgentProfile 文件契约迁移 Spec

## 目标与范围

将 Storage 的 AgentProfile 文件结构从 TS 接口与 Zod 双重维护，改为 TS 类型和约束单源，由 Catalog 生成绑定并接入真实文件读取。只迁移此文件；Goal Snapshot、其他 Storage 契约和 Runtime Profile 不在本步范围。

## 需求与验收标准

- <a id="spec-req-1-1"></a>**1.1 单源**：维护 `AgentProfileFile` 的 TS 字段及约束，从 Catalog 生成 Schema、Reader、Manifest 和共享绑定；字段、版本常量与非空字符串约束均有唯一权威来源。数组元素的非空约束同样从 TS 定义生成，不手写第二份字段 Schema。
- <a id="spec-req-1-2"></a>**1.2 严格读取**：文件根对象包含未知字段时必须拒绝；缺失字段、错误类型、非当前版本或空字符串及空数组元素应拒绝。原本合法的空数组与其他合法文件继续接受，成功数据隔离，不修改输入。
- <a id="spec-req-1-3"></a>**1.3 真实文件边界**：`JsonFileAgentProfileStore.load` 使用生成绑定的 `reject` 策略；文件缺失仍返回 `undefined`，不安全路径、非法 JSON、无效文件和文件 ID 不一致仍通过 `AgentProfileConfigurationError` 报错。Runtime Profile 映射和文件读取行为保持不变。
- <a id="spec-req-1-4"></a>**1.4 可定位错误**：无效文件保留稳定错误码、Profile ID 和文件路径，并提供可定位字段的安全问题信息；问题不包含字段值或原始文件正文。删除本文件无其他生产消费者的旧 Zod 结构声明，不保留双读或失败回退。
- <a id="spec-req-1-5"></a>**1.5 生成与验收**：更改 TS 字段或约束应改变生成制品和相应接受规则；不支持或失效的注解、缺失制品与漂移检查失败。实际文件加载、边界和错误场景、Catalog 检查及完整回归通过。

## 架构与核心决策

文件 DTO 和路径/ID 规则归 Storage；共享读取能力由[数据契约运行时绑定](../contract-runtime-binding/spec.md)提供。Catalog 和生成器如需表达数组元素约束，仅增加本契约所需的受验证能力，不为通过测试放宽其他约束。错误问题采用共享绑定提供的安全信息，不将 Zod 原始错误强加给新绑定；不改变用户可判断的错误码与失败边界。

本 Spec 可与 Web 查询输入、业务工具和模型动态组合迁移并行准备；共用 Catalog 和生成器的差异在集成时协调，最终以实际生成制品及真实文件测试验证。本步不依赖工具与模型统一切换，也不将 Snapshot 迁移结果视为已完成。

## 风险与否定性保证

风险等级：中。关键操作是替换持久化文件的结构校验与错误映射，须验证严格未知字段、非空数组元素和加载路径；不改变文件版本、持久化格式、权限或执行语义，不增加旧格式兼容层。
