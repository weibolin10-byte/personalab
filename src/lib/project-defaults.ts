// 项目级默认文案常量。
// 单独放在无 'use client' 的纯模块里，方便服务端路由与客户端共享，
// 避免从 zustand store 直接导入导致的服务端解析问题。

export const DEFAULT_PRODUCT_DESCRIPTION = '尚未填写产品描述';
export const DEFAULT_RESEARCH_GOAL = '了解目标用户的真实需求与使用场景';
