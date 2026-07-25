<!-- QuestionCard.svelte — agent question card with single/multi/other choice.
     Supports multi-step questions with navigation. -->
<script lang="ts">
  import Button from '../ui/Button.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import Chip from '../ui/Chip.svelte';
  import * as client from '../../stores/client.svelte';

  type QuestionOption = { id: string; label: string; description?: string; recommended?: boolean };
  type QuestionItem = {
    id: string;
    question: string;
    header?: string;
    body?: string;
    options: QuestionOption[];
    multiSelect?: boolean;
    allowOther?: boolean;
    otherLabel?: string;
  };

  let {
    question,
  }: {
    question: {
      questionId: string;
      sessionId: string;
      questions: QuestionItem[];
    };
  } = $props();

  let busy = $state(false);
  let step = $state(0);
  let minimized = $state(false);
  // Per-question answers: Record<questionId, answer>
  let answers = $state<Record<string, string | string[]>>({});

  const total = $derived(question.questions.length);
  const current = $derived(question.questions[step] ?? question.questions[0]);
  const isLast = $derived(step >= total - 1);
  const currentAnswer = $derived(answers[current?.id]);

  function pickSingle(qid: string, optionId: string) {
    answers[qid] = currentAnswer === optionId ? '' : optionId;
    answers = { ...answers };
  }

  function toggleMulti(qid: string, optionId: string) {
    const arr = (answers[qid] as string[]) ?? [];
    const idx = arr.indexOf(optionId);
    if (idx >= 0) {
      answers[qid] = arr.filter((id) => id !== optionId);
    } else {
      answers[qid] = [...arr, optionId];
    }
    answers = { ...answers };
  }

  function canSubmit(): boolean {
    if (!current) return false;
    const a = answers[current.id];
    if (current.multiSelect) return Array.isArray(a) && a.length > 0;
    return typeof a === 'string' && a.length > 0;
  }

  async function submit() {
    busy = true;
    try {
      const response = {
        answers: Object.fromEntries(
          Object.entries(answers).map(([qid, val]) => {
            if (Array.isArray(val)) return [qid, { kind: 'multi', optionIds: val }];
            return [qid, { kind: 'single', optionId: val }];
          }),
        ),
        method: 'click' as const,
      };
      await client.client.respondQuestion(question.questionId, response);
    } catch {
      // Error shown by caller.
    } finally {
      busy = false;
    }
  }

  async function dismiss() {
    busy = true;
    try {
      await client.client.dismissQuestion(question.questionId);
    } catch {
      // Ignore.
    } finally {
      busy = false;
    }
  }
</script>

<div class="question-card" class:minimized>
  <!-- Header -->
  <div class="q-header">
    {#if total > 1}
      <div class="q-steps">
        {#each question.questions as q, i (q.id)}
          <button
            class="q-step-dot"
            class:active={i === step}
            class:done={!!answers[q.id]}
            onclick={() => step = i}
            aria-label={`问题 ${i + 1}`}
          ></button>
        {/each}
      </div>
    {/if}
    <span class="q-title">{current?.header ?? 'Agent 提问'}</span>
    <IconButton
      name={minimized ? 'chevron-down' : 'chevron-right'}
      label={minimized ? '展开' : '折叠'}
      size="sm"
      onclick={() => minimized = !minimized}
    />
  </div>

  {#if !minimized && current}
    <div class="q-body">
      <div class="q-question">{current.question}</div>
      {#if current.body}
        <div class="q-desc">{current.body}</div>
      {/if}

      <!-- Options -->
      <div class="q-options">
        {#each current.options as opt (opt.id)}
          <button
            class="q-option"
            class:selected={current.multiSelect
              ? Array.isArray(currentAnswer) && currentAnswer.includes(opt.id)
              : currentAnswer === opt.id}
            onclick={() => current.multiSelect ? toggleMulti(current.id, opt.id) : pickSingle(current.id, opt.id)}
          >
            <span class="q-bullet">
              {#if current.multiSelect}
                {Array.isArray(currentAnswer) && currentAnswer.includes(opt.id) ? '■' : '□'}
              {:else}
                {currentAnswer === opt.id ? '●' : '○'}
              {/if}
            </span>
            <span class="q-option-text">{opt.label}</span>
            {#if opt.recommended}
              <Chip tone="success">推荐</Chip>
            {/if}
          </button>
        {/each}
      </div>
    </div>

    <!-- Footer -->
    <div class="q-footer">
      {#if total > 1 && step > 0}
        <Button size="sm" variant="ghost" onclick={() => step--} disabled={busy}>上一题</Button>
      {/if}
      <div class="q-footer-right">
        <Button size="sm" variant="ghost" onclick={dismiss} disabled={busy}>忽略</Button>
        {#if !isLast}
          <Button size="sm" variant="default" onclick={() => step++} disabled={busy || !canSubmit()}>下一题</Button>
        {:else}
          <Button size="sm" variant="primary" onclick={submit} disabled={busy || !canSubmit()}>
            {busy ? '提交中…' : '提交'}
          </Button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .question-card {
    border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--ac-bd);
    border-radius: var(--g-radius-card, var(--r-lg));
    overflow: hidden;
    background: var(--mat-surface-2, var(--l2));
    backdrop-filter: var(--mat-blur, none);
    -webkit-backdrop-filter: var(--mat-blur, none);
    box-shadow: var(--elev-card, var(--toplight));
    margin-bottom: 8px;
  }
  .question-card.minimized {
    border-color: var(--g-border-color, var(--bd));
  }

  .q-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 12px;
    background: var(--ac-soft);
    color: var(--ac);
  }
  .question-card.minimized .q-header { background: transparent; color: var(--tx2); }
  .q-steps {
    display: flex;
    gap: 5px;
  }
  .q-step-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: none;
    background: var(--bd2);
    cursor: pointer;
    transition: background var(--duration-fast) var(--ease), transform var(--duration-fast) var(--ease);
  }
  .q-step-dot:hover { transform: scale(1.25); }
  .q-step-dot.active { background: var(--ac); }
  .q-step-dot.done { background: var(--ok); }
  .q-title {
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    flex: 1;
  }

  .q-body {
    padding: 10px 12px 8px;
  }
  .q-question {
    font-size: 12.5px;
    margin-bottom: 8px;
    line-height: 1.55;
    color: var(--tx);
  }
  .q-desc {
    font-size: 11.5px;
    color: var(--tx2);
    margin-bottom: 8px;
  }

  .q-options {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .q-option {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 9px 10px;
    border-radius: var(--g-radius-control, var(--r-md));
    border: var(--g-border-w, 1px) var(--g-border-style, solid) var(--g-border-color, var(--bd));
    background: transparent;
    color: var(--tx2);
    font-size: 12px;
    cursor: pointer;
    text-align: left;
    transition: border-color var(--duration-fast) var(--ease), background var(--duration-fast) var(--ease), color var(--duration-fast) var(--ease);
  }
  .q-option:hover {
    border-color: var(--bd2);
    color: var(--tx);
  }
  .q-option.selected {
    border-color: var(--ac);
    background: var(--ac-soft);
    color: var(--tx);
  }
  .q-bullet {
    flex: none;
    color: var(--tx3);
    font-size: 13px;
  }
  .q-option.selected .q-bullet {
    color: var(--ac);
  }
  .q-option-text {
    flex: 1;
  }

  .q-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px 12px;
  }
  .q-footer-right {
    display: flex;
    gap: 8px;
    margin-left: auto;
  }
</style>
