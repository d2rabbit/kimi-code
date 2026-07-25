# Aurora — 旗舰设计语言（dark / light / system）

极光天空下的圆润呼吸玻璃：柔和的圆角半透明表面浮在缓慢漂移的极光之上，界面像有生命一样轻轻呼吸。dark / light / system 是同一语言的暗 / 明 / 自动三模式，契约值通过 `var(--l*-glass)` 等引用各自 primitives 自动翻转。

## 几何

| 部位 | 值 |
|---|---|
| chip | 999px（全圆药丸） |
| 控件 / 输入 | 10px |
| 卡片 | 14px |
| overlay | 16px |
| 气泡 | 16px 16px 16px 4px（左下小尾角） |
| 边框 | 1px `--bd-glass` 折射边色 |

全主题无直角——圆润是 Aurora 的第一性格。

## 材质

- 表面：`--l1/l2/l3-glass` 三层半透明（0.55 / 0.65 / 0.78 不透明度），`backdrop-filter: blur(16px) saturate(1.4)`。
- sheen 槽：顶部 55% 白色渐变（`--shine-overlay`），玻璃受光面。
- 背景：body 极光漂移层（`--aurora-bg` 四团径向渐变 + `aurora-drift` 40s）+ 全局噪点颗粒。
- 主按钮：`--ac-gradient`（蓝→青绿 135° 品牌渐变）。

## Elevation

柔和弥散阴影（`--shadow-sm..xl` 双层：环境光 + 直射光）+ inset 顶光（`--toplight`）。按压不改变阴影。

## 动效（呼吸感是语言的一部分）

- 按压：`scale(0.97)`；hover：`translateY(-1px)`（控件）/ `-2px`（卡片）。
- 入场：`aero-drop-in`（scale 0.92 + 上浮，200ms ease-out）。
- CTA：`newtask-glow` 3s 光晕呼吸；ambient（welcome logo 等）：`w-breathe` 3s。
- 有机动效：极光漂移、头像呼吸、welcome chips 错峰波浪、状态点 glow 脉动。
- 缓动：入场 `--ease-out`，弹性 `--ease-spring`。

## 排版

Inter Variable；控件字重 500，主按钮 600；无字距/大小写变换。

## Do / Don't

- ✅ 表面永远半透明 + 模糊，让极光背景透出来；圆角永远 ≥10px。
- ✅ 动效缓慢、低频、错峰——呼吸而不是闪烁。
- ❌ 不要实色不透明卡片（reduced-transparency 守卫除外）、不要直角、不要硬偏移阴影。
- ❌ 不要快速/高频动画。
