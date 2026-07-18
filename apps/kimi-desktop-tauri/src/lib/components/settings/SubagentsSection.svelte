<!-- SubagentsSection.svelte — 子智能体 section（设置页与侧栏模块页共用同一实现）。 -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte';
</script>

<h2>子智能体</h2>
<p class="sub-desc">独立系统提示 + 工具白名单 + 默认模型</p>
<div class="list-meta"><span>已安装 0 项</span><span class="dim-i">来自已启用插件，当前只读</span></div>
<div class="item-row">
  <span class="isq purple"><Icon name="git-branch" size="sm" /></span>
  <span class="ir">
    <span class="it">coder</span>
    <span class="id mono">通用代码编写 agent · 定义文件位于 agent 私有 home 的 agents/ 目录</span>
  </span>
  <span class="pchip">插件</span>
</div>
<p class="empty-text">管理界面即将推出；当前页展示结构与设计稿一致，数据接入后自动填充。</p>

<style>
  h2 { font-size: 20px; font-weight: 600; color: var(--tx); margin: 0 0 4px; letter-spacing: -0.02em; }
  .sub-desc { font-size: 12px; color: var(--tx3); margin: 0 0 20px; }
  .list-meta { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; font-size: 11px; color: var(--tx2); }
  .list-meta .dim-i { color: var(--tx3); font-style: italic; }
  .item-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 12px; background: var(--l2); border: 1px solid var(--bd); box-shadow: var(--toplight); margin-bottom: 8px; }
  .isq { width: 28px; height: 28px; border-radius: 8px; background: var(--ac-soft); color: var(--ac); display: flex; align-items: center; justify-content: center; flex: none; }
  .isq.purple { background: var(--color-done-soft); color: var(--color-done); }
  .ir { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .it { font-size: 13px; font-weight: 500; color: var(--tx); display: flex; align-items: center; gap: 6px; }
  .id { font-size: 11px; color: var(--tx3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .id.mono { font-family: var(--font-mono); }
  .pchip { font-size: 10px; color: var(--color-done); background: var(--color-done-soft); border-radius: 99px; padding: 2px 8px; font-weight: 600; }
  .empty-text { color: var(--tx3); font-size: 13px; }
</style>
