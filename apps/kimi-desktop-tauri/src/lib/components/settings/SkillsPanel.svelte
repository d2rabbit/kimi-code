<!-- SkillsPanel.svelte — skill management GUI (filesystem CRUD).
     Lists user-level skills from ~/.kimi-code/skills/, with create/edit/delete.
     The editor works directly on the raw SKILL.md content (frontmatter + body). -->
<script lang="ts">
  import { onMount } from 'svelte';
  import * as client from '../../stores/client.svelte';
  import Button from '../ui/Button.svelte';
  import Icon from '../ui/Icon.svelte';
  import IconButton from '../ui/IconButton.svelte';

  let view = $state<'list' | 'edit'>('list');
  let editingName = $state<string>('');
  let editorContent = $state<string>('');
  let saving = $state(false);
  let error = $state<string | null>(null);
  let filter = $state('');

  // Load skills on mount.
  onMount(() => {
    void client.client.refreshUserSkills();
  });

  // Combined skill list: user-level files (editable) + daemon skills (read-only,
  // may include project/builtin/extra). Deduplicated by name (user files win).
  const allSkills = $derived.by(() => {
    const userNames = new Set(client.skillFiles.map((s) => s.name.toLowerCase()));
    const daemonOnly = client.skills.filter((s) => !userNames.has(s.name.toLowerCase()));
    return [
      ...client.skillFiles.map((s) => ({ ...s, editable: true, source: 'user' as const })),
      ...daemonOnly.map((s) => ({ name: s.name, description: s.description, source: s.source, editable: false })),
    ];
  });

  // Filtered view.
  const filteredSkills = $derived.by(() => {
    if (!filter.trim()) return allSkills;
    const q = filter.toLowerCase();
    return allSkills.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q),
    );
  });

  const SOURCE_LABELS: Record<string, string> = {
    user: '用户',
    project: '项目',
    extra: '额外',
    builtin: '内置',
  };

  const DEFAULT_TEMPLATE = `---
name: my-skill
description: A brief description of what this skill does and when to use it
type: prompt
whenToUse: When the user asks me to ...
disableModelInvocation: false
---

# My Skill

Write your skill instructions here. This markdown is sent to the model when the skill is activated.

You can use parameter placeholders:
- $ARGUMENTS — all arguments passed by the user
- $0, $1 — positional arguments
- \${KIMI_SKILL_DIR} — the directory containing this skill file
`;

  function startCreate() {
    editingName = '';
    editorContent = DEFAULT_TEMPLATE;
    view = 'edit';
    error = null;
  }

  function startEdit(name: string, content: string) {
    editingName = name;
    editorContent = content;
    view = 'edit';
    error = null;
  }

  async function handleSave() {
    // Parse the name from the frontmatter if creating new.
    let name = editingName;
    if (!name) {
      name = getName(editorContent) ?? '';
    }
    if (!name) {
      error = '请填写 skill 名称（在 frontmatter 的 name 字段中）';
      return;
    }
    saving = true;
    error = null;
    try {
      await client.client.saveUserSkill(name, editorContent);
      view = 'list';
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      saving = false;
    }
  }

  async function handleDelete(name: string) {
    if (!confirm(`确定删除 skill "${name}"？此操作不可撤销。`)) return;
    try {
      await client.client.deleteUserSkill(name);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  function cancelEdit() {
    view = 'list';
    error = null;
  }

  // Extract the YAML frontmatter block (between --- fences) from SKILL.md content.
  function extractFrontmatter(content: string): string {
    const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    return m ? m[1] : '';
  }

  // Read a field from frontmatter text, stripping surrounding quotes.
  function frontmatterField(fm: string, key: string): string | null {
    const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    if (!m) return null;
    return m[1].trim().replace(/^["']|["']$/g, '');
  }

  // Parse frontmatter description for display.
  function getDescription(content: string): string {
    return frontmatterField(extractFrontmatter(content), 'description') ?? '(无描述)';
  }

  function getType(content: string): string {
    return frontmatterField(extractFrontmatter(content), 'type') ?? 'prompt';
  }

  function isDisabled(content: string): boolean {
    const fm = extractFrontmatter(content);
    const v = frontmatterField(fm, 'disableModelInvocation')
      ?? frontmatterField(fm, 'disable-model-invocation')
      ?? frontmatterField(fm, 'disable_model_invocation');
    return v === 'true';
  }

  function getName(content: string): string | null {
    return frontmatterField(extractFrontmatter(content), 'name');
  }
</script>

{#if view === 'list'}
  <!-- === Skill list === -->
  <div class="skills-list-view">
    <div class="section-header">
      <h3>Skills <span class="count-badge">{allSkills.length}</span></h3>
      <Button size="sm" variant="default" icon="plus" onclick={startCreate}>新建 Skill</Button>
    </div>

    <p class="hint">
      用户级 Skills 存储在 <code>~/.kimi-code/skills/</code>，可编辑。项目级和内置 Skills 只读。
    </p>

    <!-- Search filter -->
    <input
      class="skill-search"
      bind:value={filter}
      placeholder="搜索 skill…"
      spellcheck="false"
      autocomplete="off"
    />

    {#if error}
      <div class="msg-error">{error}</div>
    {/if}

    {#if allSkills.length === 0}
      <div class="empty-state">
        <Icon name="sparkles" size="lg" />
        <p>还没有 Skill</p>
        <p class="sub-hint">点击「新建 Skill」创建你的第一个</p>
      </div>
    {:else if filteredSkills.length === 0}
      <div class="empty-state">
        <p>没有匹配「{filter}」的 Skill</p>
      </div>
    {:else}
      <div class="skill-list">
        {#each filteredSkills as skill (skill.name)}
          <div class="skill-row">
            <div class="skill-info">
              <div class="skill-top">
                <span class="skill-name">{skill.name}</span>
                <span class="skill-source source-{skill.source}">{SOURCE_LABELS[skill.source] ?? skill.source}</span>
                {#if skill.editable}
                  <span class="skill-type">{getType(skill.content)}</span>
                  {#if isDisabled(skill.content)}
                    <span class="skill-badge warn">手动调用</span>
                  {:else}
                    <span class="skill-badge ok">自动可用</span>
                  {/if}
                {/if}
              </div>
              <div class="skill-desc">{skill.description ?? (skill.editable ? getDescription(skill.content) : '(无描述)')}</div>
            </div>
            <div class="skill-actions">
              {#if skill.editable}
                <IconButton name="pencil" label="编辑" size="sm" onclick={() => startEdit(skill.name, skill.content)} />
                <IconButton name="close" label="删除" size="sm" onclick={() => handleDelete(skill.name)} />
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{:else}
  <!-- === Skill editor === -->
  <div class="skill-editor-view">
    <div class="editor-header">
      <h3>{editingName ? `编辑: ${editingName}` : '新建 Skill'}</h3>
      <div class="editor-actions">
        <Button size="sm" variant="ghost" onclick={cancelEdit} disabled={saving}>取消</Button>
        <Button size="sm" variant="primary" onclick={handleSave} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </Button>
      </div>
    </div>

    {#if error}
      <div class="msg-error">{error}</div>
    {/if}

    <div class="editor-hint">
      <details>
        <summary>SKILL.md 格式说明</summary>
        <div class="format-help">
          <p><strong>必需字段</strong>（目录形式 SKILL.md）：</p>
          <ul>
            <li><code>name</code> — Skill 名称</li>
            <li><code>description</code> — 一行描述，模型用它判断何时调用（≤240字符）</li>
          </ul>
          <p><strong>可选字段</strong>：</p>
          <ul>
            <li><code>type</code> — <code>prompt</code>（默认）/ <code>flow</code>（仅手动调用）/ <code>reference</code>（仅模型参考）</li>
            <li><code>whenToUse</code> — 触发条件描述</li>
            <li><code>disableModelInvocation: true</code> — 禁止模型自动调用</li>
            <li><code>arguments: target mode</code> — 命名参数</li>
          </ul>
          <p><strong>正文占位符</strong>：</p>
          <ul>
            <li><code>$ARGUMENTS</code> — 全部参数</li>
            <li><code>$0, $1</code> — 位置参数</li>
            <li><code>${'${KIMI_SKILL_DIR}'}</code> — Skill 文件所在目录</li>
          </ul>
        </div>
      </details>
    </div>

    <textarea
      bind:value={editorContent}
      class="skill-editor-textarea"
      spellcheck="false"
      autocomplete="off"
      autocapitalize="off"
      placeholder="输入 SKILL.md 内容..."
    ></textarea>
  </div>
{/if}

<style>
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .section-header h3 { margin: 0; font-size: var(--text-base, 14px); font-weight: var(--weight-medium, 500); display: flex; align-items: center; gap: 6px; }

  .count-badge {
    font-size: 11px;
    padding: 1px 7px;
    border-radius: var(--radius-full, 999px);
    background: var(--color-surface-raised, #1a1a1e);
    color: var(--color-text-muted, #9a9aa2);
    font-weight: var(--weight-regular, 400);
  }

  .skill-search {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 12px;
    border-radius: var(--radius-sm, 6px);
    border: 1px solid var(--color-line, #2a2a2e);
    background: var(--color-surface-raised, #1a1a1e);
    color: var(--color-text, #e7e7ea);
    font-size: var(--text-sm, 13px);
    margin-bottom: 12px;
    outline: none;
  }
  .skill-search:focus { border-color: var(--color-accent, #7c8cff); }
  .skill-search::placeholder { color: var(--color-text-faint, #6a6a72); }

  .skill-source {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: var(--radius-full, 999px);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .source-user { background: var(--color-accent-soft, rgba(124,140,255,0.15)); color: var(--color-accent, #7c8cff); }
  .source-project { background: var(--color-success-soft, rgba(78,201,176,0.15)); color: var(--color-success, #4ec9b0); }
  .source-builtin { background: var(--color-surface-raised, #1a1a1e); color: var(--color-text-faint, #6a6a72); }
  .source-extra { background: var(--color-warning-soft, rgba(255,193,7,0.15)); color: var(--color-warning, #ffc107); }

  .hint { font-size: var(--text-xs, 12px); color: var(--color-text-faint, #6a6a72); margin: 0 0 16px; }
  .hint code, .sub-hint code {
    font-family: var(--font-mono, monospace);
    background: var(--color-surface-raised, #1a1a1e);
    padding: 1px 5px;
    border-radius: var(--radius-xs, 4px);
    font-size: 11px;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 48px 20px;
    color: var(--color-text-faint, #6a6a72);
  }
  .empty-state p { margin: 0; font-size: var(--text-sm, 13px); }
  .sub-hint { font-size: var(--text-xs, 12px) !important; opacity: 0.7; }

  .skill-list { display: flex; flex-direction: column; gap: 6px; }

  .skill-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 12px 14px;
    border-radius: var(--radius-md, 8px);
    border: 1px solid var(--color-line, #2a2a2e);
    transition: border-color var(--duration-fast, 120ms);
  }
  .skill-row:hover { border-color: var(--color-line-strong, #3a3a3e); }

  .skill-info { flex: 1; min-width: 0; }
  .skill-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
  .skill-name { font-weight: var(--weight-medium, 500); font-size: var(--text-sm, 13px); }
  .skill-type {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: var(--radius-full, 999px);
    background: var(--color-surface-raised, #1a1a1e);
    color: var(--color-text-muted, #9a9aa2);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .skill-badge { font-size: 10px; padding: 1px 6px; border-radius: var(--radius-full, 999px); }
  .skill-badge.ok { background: var(--color-success-soft, rgba(78,201,176,0.15)); color: var(--color-success, #4ec9b0); }
  .skill-badge.warn { background: var(--color-warning-soft, rgba(255,193,7,0.15)); color: var(--color-warning, #ffc107); }

  .skill-desc {
    font-size: var(--text-xs, 12px);
    color: var(--color-text-muted, #9a9aa2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .skill-actions { display: flex; gap: 4px; flex: none; margin-left: 8px; }

  .msg-error {
    padding: 8px 12px;
    border-radius: var(--radius-sm, 6px);
    font-size: var(--text-sm, 13px);
    background: var(--color-danger-soft, rgba(255,107,107,0.12));
    color: var(--color-danger, #ff6b6b);
    margin-bottom: 12px;
  }

  /* Editor */
  .editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  .editor-header h3 { margin: 0; font-size: var(--text-base, 14px); font-weight: var(--weight-medium, 500); }
  .editor-actions { display: flex; gap: 8px; }

  .editor-hint { margin-bottom: 12px; }
  .editor-hint summary {
    cursor: pointer;
    font-size: var(--text-xs, 12px);
    color: var(--color-text-muted, #9a9aa2);
    padding: 4px 0;
  }
  .format-help {
    padding: 12px 16px;
    background: var(--color-surface-raised, #1a1a1e);
    border-radius: var(--radius-sm, 6px);
    margin-top: 8px;
    font-size: var(--text-xs, 12px);
    color: var(--color-text-muted, #9a9aa2);
  }
  .format-help p { margin: 0 0 4px; }
  .format-help ul { margin: 0 0 8px; padding-left: 16px; }
  .format-help li { margin: 2px 0; }
  .format-help code {
    font-family: var(--font-mono, monospace);
    background: var(--color-surface, #121214);
    padding: 1px 4px;
    border-radius: 3px;
  }

  .skill-editor-textarea {
    width: 100%;
    min-height: 400px;
    padding: 14px;
    border-radius: var(--radius-md, 8px);
    border: 1px solid var(--color-line, #2a2a2e);
    background: var(--color-surface-raised, #1a1a1e);
    color: var(--color-text, #e7e7ea);
    font-family: var(--font-mono, monospace);
    font-size: 13px;
    line-height: 1.6;
    resize: vertical;
    outline: none;
    box-sizing: border-box;
  }
  .skill-editor-textarea:focus {
    border-color: var(--color-accent, #7c8cff);
  }
</style>
