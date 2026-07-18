<!-- SubagentsView.svelte — 子智能体模块页：独立系统提示 + 工具白名单 + 默认模型。 -->
<script lang="ts">
  // NOTE: daemon 暂未暴露子智能体定义的 REST 接口；定义文件位于
  // <agent-home>/agents/。接口就绪后此页直接替换数据源，视图结构不变。
  interface SubagentDef {
    name: string;
    description: string;
    tools: string[];
    model: string;
    enabled: boolean;
  }
  let agents = $state<SubagentDef[]>([]);
</script>

<div class="page">
  <div class="page-head">
    <h2>子智能体</h2>
    <span class="sub">独立系统提示 + 工具白名单 + 默认模型</span>
    <div class="right">
      <span class="btn pri sm" role="button" tabindex="0">＋ 新建</span>
    </div>
  </div>
  <div class="page-body">
    {#if agents.length === 0}
      <div class="empty">
        <span class="empty-ic">◈</span>
        <p>暂无子智能体</p>
        <p class="dim">主会话中可通过 @agent 显式调用，或由主 agent 按任务自动路由。</p>
      </div>
    {:else}
      {#each agents as a (a.name)}
        <div class="card ag">
          <span class="ai">◈</span>
          <span class="ab">
            <span class="an">{a.name}</span>
            <span class="ad">{a.description}</span>
            <span class="tools">{#each a.tools as t}<span class="tchip">{t}</span>{/each}</span>
          </span>
          <span class="mpill">{a.model} ▾</span>
          <span class="swt" class:off={!a.enabled}></span>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .page { flex: 1; display: flex; flex-direction: column; min-width: 0; height: 100%; }
  .page-head { display: flex; align-items: center; gap: 12px; padding: 16px 22px 14px; border-bottom: 1px solid var(--bd); }
  .page-head h2 { font-size: 17px; font-weight: 700; letter-spacing: -0.01em; }
  .page-head .sub { font-size: 11px; color: var(--tx3); }
  .page-head .right { margin-left: auto; display: flex; gap: 8px; }
  .page-body { flex: 1; overflow-y: auto; padding: 16px 22px; display: flex; flex-direction: column; gap: 12px; }

  .empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 64px 0; color: var(--tx2); font-size: 13px; }
  .empty-ic { font-size: 28px; color: var(--ac); opacity: 0.6; }
  .empty .dim { font-size: 11px; color: var(--tx3); }

  .card { border: 1px solid var(--bd); border-radius: var(--r-lg); background: var(--l2); box-shadow: var(--toplight); }
  .ag { display: flex; align-items: center; gap: 10px; padding: 12px 14px; }
  .ai { width: 28px; height: 28px; border-radius: var(--r-md); background: var(--l3); border: 1px solid var(--bd); display: flex; align-items: center; justify-content: center; font-size: 12px; color: var(--ac); flex: none; }
  .ab { flex: 1; min-width: 0; }
  .an { font-size: 12.5px; font-weight: 600; }
  .ad { display: block; font-size: 10.5px; color: var(--tx3); margin-top: 1px; }
  .tools { display: flex; gap: 4px; margin-top: 5px; }
  .tchip { font-size: 9px; padding: 1px 5px; border-radius: 4px; background: var(--l3); color: var(--tx3); font-family: var(--font-mono); }
  .mpill { font-size: 10px; padding: 3px 8px; border-radius: 5px; border: 1px solid var(--bd2); color: var(--tx2); white-space: nowrap; }
  .swt { width: 30px; height: 17px; border-radius: 99px; background: var(--ac); position: relative; flex: none; cursor: pointer; }
  .swt::after { content: ""; position: absolute; right: 2px; top: 2px; width: 13px; height: 13px; border-radius: 50%; background: #fff; }
  .swt.off { background: var(--bd2); }
  .swt.off::after { right: auto; left: 2px; }
  .btn { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 12px; border-radius: var(--r-md); font-size: 12px; font-weight: 600; border: 1px solid var(--bd2); color: var(--tx2); cursor: pointer; }
  .btn.pri { background: var(--ac); border-color: transparent; color: #fff; }
  .btn.sm { height: 22px; padding: 0 9px; font-size: 11px; border-radius: var(--r-sm); }
</style>
