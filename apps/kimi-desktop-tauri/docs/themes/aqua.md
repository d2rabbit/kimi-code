# Aqua — 凝胶语言（aqua）

Mac OS X 时代的糖果凝胶：顶部镜面高光带、竖向凝胶渐变、细条纹表面、水蓝发光 CTA 微脉动。

## 几何

| 部位 | 值 |
|---|---|
| chip | 999px |
| 控件 / 卡片 / 气泡 | 10px |
| 输入 | 8px |
| overlay | 12px |
| 边框 | 1px `rgba(0,30,90,0.15)` 海军蓝发丝边 |

## 材质

- 表面：`#ffffff → #eef1f5` 竖向凝胶渐变。
- sheen 槽：`radial-gradient(100% 60% at 50% 0%, 60% 白 → 透明)` 顶部穹顶高光——凝胶的灵魂。
- 控件：径向顶部高光 + `#f8fafc → #dee3eb` 渐变。
- 主按钮：径向爆光 + `#7ab4f9 → #1862d8 → #0a3fa8` 三段凝胶蓝 + 文字投影。
- sidebar：细条纹 `repeating-linear-gradient(180deg, #f4f6fa 0 2px, #e2e7ef 2px 4px)`（pinstripe）。
- 背景：body 同款条纹。

## Elevation

软外投影 + inset 顶高光 + inset 底暗影（三段凝胶截面）。按压时外投影收平、内暗影加深——「按进凝胶」。

## 动效

- 按压：`scale(0.96)`；无 hover 位移。
- 入场：`aqua-in` 240ms（scale 0.96 + 微上浮）。
- CTA：`aqua-pulse` 2.4s 亮度/饱和度脉动——整个设计系统唯一的循环动画，只给主 CTA。

## 排版

控件字重 500、主按钮 600 + `0 1px 1px rgba(0,30,90,0.30)` 文字投影。

## Do / Don't

- ✅ 每个凸起表面都要有顶部高光带；凝胶 = 渐变 + 高光 + 内暗影，缺一不可。
- ✅ 条纹只给大背景/侧栏，不给卡片。
- ❌ 禁止 backdrop-filter、禁止平涂无高光、禁止硬偏移阴影。
- ❌ 除 CTA pulse 外不要任何循环动画。
