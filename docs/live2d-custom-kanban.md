# Live2D 自定义看板娘接入说明

这份文档记录本项目把默认看板娘换成自定义 Live2D 模型「雪莉」的完整过程。写法尽量通俗，方便以后复盘、维护，或者换成别的 Live2D 模型。

## 1. 最终效果

现在页面右下角的看板娘来自项目里的本地模型资源：

```text
雪莉/
```

她现在支持：

- 加载本地 `.model3.json + .moc3` Live2D 模型。
- 固定显示在页面右下角。
- 鼠标移到看板娘身上显示控制按钮。
- 可拖动位置。
- 可隐藏。
- 有轻微呼吸、浮动、左右摆动等待机效果。
- 点击看板娘会触发苹果动作。
- 可以手动切换「常态 / 抬手 / 举手 / 苹果 / 魔女 / 动作」。

## 2. 这次用到的框架

本项目没有继续使用旧的 `live2d-widget`，而是换成了：

```text
Live2D Cubism Core
PixiJS
pixi-live2d-display
```

HTML 中引入的是：

```html
<script src="https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/pixi.js@6.5.10/dist/browser/pixi.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/pixi-live2d-display@0.4.0/dist/cubism4.min.js"></script>
<script src="./live2d.js"></script>
```

简单理解：

- `Live2D Cubism Core`：Live2D 官方核心运行时，负责读懂 `.moc3` 模型。
- `PixiJS`：网页 2D 渲染引擎，负责把模型画到 canvas 上。
- `pixi-live2d-display`：把 Live2D 模型接入 PixiJS 的桥梁。
- `public/live2d.js`：我们自己写的交互层，负责加载雪莉、按钮、动作、拖动、待机动画。

## 3. 为什么不用 live2d-widget

旧版看板娘代码使用的是：

```html
<script src="https://cdn.jsdelivr.net/npm/live2d-widget@3.1.4/lib/L2Dwidget.min.js"></script>
```

旧代码加载的是远程模型：

```js
jsonPath: "https://unpkg.com/live2d-widget-model-shizuku@1.0.5/assets/shizuku.model.json"
```

这个方案通常适合旧格式模型，例如：

```text
xxx.model.json
xxx.moc
```

但是雪莉是新版 Cubism 模型，关键文件是：

```text
雪莉/雪莉.model3.json
雪莉/雪莉.moc3
```

所以需要使用支持 Cubism 3/4 的运行时，也就是：

```text
pixi-live2d-display 的 cubism4 bundle
```

## 4. 雪莉模型资源说明

项目里的雪莉目录大致是这样：

```text
雪莉/
  雪莉.model3.json
  雪莉.moc3
  雪莉.physics3.json
  雪莉.cdi3.json
  雪莉.vtube.json
  苹果.motion3.json
  taishou.exp3.json
  jushou.exp3.json
  pingguo.exp3.json
  monv.exp3.json
  雪莉.8192/
    texture_00.png
    texture_01.png
```

每类文件的作用：

| 文件 | 作用 |
|---|---|
| `雪莉.model3.json` | 模型配置入口，告诉运行时要加载哪些模型、贴图、物理、表情、动作 |
| `雪莉.moc3` | Live2D 模型本体 |
| `雪莉.8192/*.png` | 模型贴图 |
| `雪莉.physics3.json` | 物理配置，比如头发、衣服、装饰物的摆动 |
| `雪莉.cdi3.json` | 参数显示信息，里面能看到模型有哪些参数 |
| `苹果.motion3.json` | 动作文件，当前接在 `TapBody` 动作组上 |
| `*.exp3.json` | 表情文件，控制部分参数开关 |
| `雪莉.vtube.json` | VTube Studio 配置，里面记录了一些热键、表情、动作配置 |

## 5. 第一步：让浏览器能访问模型文件

浏览器不能直接读电脑文件夹里的模型文件。比如它不能直接读取：

```text
C:\Users\...\socket.io\雪莉\雪莉.model3.json
```

它需要通过 HTTP 地址访问。

所以在 `server.js` 里增加了静态资源路由：

```js
app.use("/models/xueli", express.static(path.join(__dirname, "雪莉")));
```

这行的意思是：

```text
本地文件夹：雪莉/
映射成网页路径：/models/xueli/
```

因此浏览器可以访问：

```text
http://localhost:3000/models/xueli/雪莉.model3.json
```

代码里实际使用 URL 编码后的路径：

```js
const MODEL_PATH = "/models/xueli/%E9%9B%AA%E8%8E%89.model3.json";
```

`%E9%9B%AA%E8%8E%89` 就是「雪莉」两个字的 URL 编码。这样写可以减少中文路径在浏览器或部署环境里出问题的概率。

## 6. 第二步：在 HTML 中引入运行时

在 `public/index.html` 的底部，引入这些脚本：

```html
<script src="/socket.io/socket.io.js"></script>
<script src="./app.js"></script>
<script src="https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/pixi.js@6.5.10/dist/browser/pixi.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/pixi-live2d-display@0.4.0/dist/cubism4.min.js"></script>
<script src="./live2d.js"></script>
```

注意顺序：

1. 先加载 Live2D Cubism Core。
2. 再加载 PixiJS。
3. 再加载 `pixi-live2d-display`。
4. 最后加载我们自己的 `live2d.js`。

如果顺序错了，`live2d.js` 里可能拿不到：

```js
window.PIXI.live2d.Live2DModel
```

就会导致模型无法加载。

## 7. 第三步：创建看板娘容器

在 `public/live2d.js` 里，页面加载后会动态创建一个容器：

```js
const shell = document.createElement("aside");
shell.className = "live2d-companion";

const canvas = document.createElement("canvas");
canvas.className = "live2d-canvas";

shell.append(canvas, actions);
document.body.append(shell);
```

这里的结构可以理解为：

```text
aside.live2d-companion
  canvas.live2d-canvas
  div.live2d-actions
    button 常态
    button 抬手
    button 举手
    button 苹果
    button 魔女
    button 动作
    button 雪莉
    button ×
```

`canvas` 是真正画模型的地方。

`live2d-actions` 是鼠标移上去时出现的按钮面板。

## 8. 第四步：用 PixiJS 创建画布

在 `live2d.js` 里创建 Pixi 应用：

```js
const app = new PIXI.Application({
  view: canvas,
  width: 260,
  height: 380,
  autoStart: true,
  transparent: true,
  antialias: true
});
```

含义：

- `view: canvas`：使用刚刚创建的 canvas。
- `width: 260`：画布宽度。
- `height: 380`：画布高度。
- `transparent: true`：背景透明，这样不会出现黑色或白色方块。
- `antialias: true`：抗锯齿，边缘更平滑。

## 9. 第五步：加载雪莉模型

核心加载代码：

```js
const model = await PIXI.live2d.Live2DModel.from(MODEL_PATH);
```

加载成功后，把模型加入 Pixi 舞台：

```js
app.stage.addChild(model);
```

这样雪莉才会真正显示在网页上。

## 10. 第六步：调整模型大小和位置

模型原始尺寸不一定适合网页。为了让她刚好站在右下角，需要自动缩放：

```js
const bounds = model.getLocalBounds();
const scale = Math.min(width / bounds.width, height / bounds.height) * 0.92;

model.scale.set(scale);
model.x = width / 2;
model.y = height * 0.54;
```

简单说就是：

1. 先拿到模型原始大小。
2. 根据画布大小计算缩放比例。
3. 把模型放到画布中间偏下的位置。

同时保存基础位置和基础缩放：

```js
model.__baseScale = scale;
model.__baseX = model.x;
model.__baseY = model.y;
```

后面的待机动画、点击反馈都会基于这些基础值计算。

## 11. 第七步：加待机动画

雪莉模型目录里没有真正的 `Idle` 待机动作文件。

也就是说，她默认只会自动眨眼。

为了让她更像一个活的看板娘，我们在 JS 里做了程序化待机动画。

主要逻辑：

```js
const breath = Math.sin(time * 1.7);
const sway = Math.sin(time * 0.72);

model.scale.set(baseScale * (1 + breath * 0.012 + model.__clickPulse * 0.085));
model.x = baseX + sway * 4;
model.y = baseY + breath * 3 - model.__clickPulse * 10;
model.rotation = sway * 0.012 + model.__clickPulse * 0.045;
```

效果是：

- `scale` 轻微放大缩小，模拟呼吸。
- `x` 左右轻微移动。
- `y` 上下轻微浮动。
- `rotation` 小幅旋转。
- `__clickPulse` 用于点击反馈，点击时更明显。

这部分不是模型自带动作，而是网页层面给整个模型加了轻微动态。

## 12. 第八步：尝试写入 Live2D 参数

除了整体浮动，还尝试写入模型内部参数：

```js
setModelParam(model, "ParamBreath", breath);
setModelParam(model, "ParamAngleX", pointerX * 22 + slowSway * 8);
setModelParam(model, "ParamAngleY", -pointerY * 14 + softBounce * 5);
setModelParam(model, "ParamAngleZ", slowSway * 6);
setModelParam(model, "ParamBodyAngleX", pointerX * 12 + slowSway * 6);
setModelParam(model, "ParamBodyAngleY", -pointerY * 8 + softBounce * 4);
setModelParam(model, "ParamBodyAngleZ", slowSway * 5);
setModelParam(model, "ParamEyeBallX", pointerX);
setModelParam(model, "ParamEyeBallY", -pointerY);
```

这些参数来自 `雪莉.cdi3.json`，例如：

- `ParamBreath`
- `ParamAngleX`
- `ParamAngleY`
- `ParamAngleZ`
- `ParamBodyAngleX`
- `ParamBodyAngleY`
- `ParamBodyAngleZ`
- `ParamEyeBallX`
- `ParamEyeBallY`

有一点很重要：

Cubism4 的内部更新发生在渲染阶段，直接在普通 `ticker` 里写参数可能会被运行时覆盖。

所以代码监听了：

```js
model.internalModel.on("beforeModelUpdate", applyIdle);
```

含义是：在模型真正更新绘制前，尽量把参数写进去。

不过实际视觉效果仍然要看模型参数绑定程度，所以项目里同时保留了整体容器动画作为兜底。

## 13. 第九步：绑定动作文件

雪莉目录里真正的动作文件只有一个：

```text
苹果.motion3.json
```

它在 `雪莉.model3.json` 中被挂到了 `TapBody` 动作组：

```json
"Motions": {
  "TapBody": [
    {
      "File": "苹果.motion3.json"
    }
  ]
}
```

所以播放动作时调用：

```js
model.motion("TapBody", 0, forcePriority);
```

含义：

- `TapBody`：动作组名。
- `0`：播放这个动作组里的第一个动作。
- `forcePriority`：强制优先级，避免动作被别的状态打断。

代码中：

```js
const forcePriority = window.PIXI?.live2d?.MotionPriority?.FORCE ?? 3;
model.motion("TapBody", 0, forcePriority).catch(() => {});
```

点击雪莉和点击「动作」按钮都会触发这个动作。

## 14. 第十步：绑定表情文件

雪莉有 4 个表情文件：

```text
taishou.exp3.json
jushou.exp3.json
pingguo.exp3.json
monv.exp3.json
```

它们在 `雪莉.model3.json` 里配置为：

```json
"Expressions": [
  {
    "Name": "taishou",
    "File": "taishou.exp3.json"
  },
  {
    "Name": "jushou",
    "File": "jushou.exp3.json"
  },
  {
    "Name": "pingguo",
    "File": "pingguo.exp3.json"
  },
  {
    "Name": "monv",
    "File": "monv.exp3.json"
  }
]
```

调用方式：

```js
model.expression("taishou");
model.expression("jushou");
model.expression("pingguo");
model.expression("monv");
```

当前按钮对应关系：

| 按钮 | 调用 |
|---|---|
| 抬手 | `model.expression("taishou")` |
| 举手 | `model.expression("jushou")` |
| 苹果 | `model.expression("pingguo")` |
| 魔女 | `model.expression("monv")` |
| 常态 | 重置 expression |
| 动作 | `model.motion("TapBody", 0, FORCE)` |

## 15. 第十一步：让点击更可靠

最初只监听模型自己的点击：

```js
model.on("pointertap", playTapBody);
```

但是 Live2D 模型的透明区域、HitArea、canvas 命中区域可能导致点击不稳定。

所以后来增加了外层容器点击判断：

```js
makeDraggable(shell, playTapBody);
```

在 `makeDraggable` 中：

```js
const shouldClick = dragging && !moved && event.target.tagName !== "BUTTON";
if (shouldClick) onClick();
```

也就是说：

- 如果按下后没有明显移动，就当作点击。
- 如果移动距离超过阈值，就当作拖动。
- 如果点的是按钮，不触发看板娘动作。

这样点击雪莉区域会更稳定。

## 16. 第十二步：加拖动功能

拖动逻辑大致是：

```js
shell.addEventListener("pointerdown", ...);
shell.addEventListener("pointermove", ...);
shell.addEventListener("pointerup", ...);
```

按下时记录：

```js
startX = event.clientX;
startY = event.clientY;
originX = shell.offsetLeft;
originY = shell.offsetTop;
```

移动时更新位置：

```js
shell.style.left = `${originX + event.clientX - startX}px`;
shell.style.top = `${originY + event.clientY - startY}px`;
shell.style.right = "auto";
shell.style.bottom = "auto";
```

这样雪莉就可以被拖到页面任意位置。

## 17. 第十三步：加控制按钮

鼠标移到雪莉身上，会出现控制面板：

```text
常态 / 抬手 / 举手 / 苹果 / 魔女 / 动作 / 雪莉 / ×
```

按钮在 JS 中动态创建：

```js
createActionButton("normal", "常态", "恢复默认表情");
createActionButton("taishou", "抬手", "切换抬手表情");
createActionButton("jushou", "举手", "切换举手表情");
createActionButton("pingguo", "苹果", "切换苹果表情");
createActionButton("monv", "魔女", "切换魔女表情");
createActionButton("appleMotion", "动作", "播放苹果动作");
createActionButton("home", "雪莉", "让雪莉回到屏幕角落");
createActionButton("hide", "×", "隐藏看板娘");
```

按钮事件：

```js
actionButtons.normal.addEventListener("click", resetExpression);
actionButtons.taishou.addEventListener("click", () => setExpression("taishou"));
actionButtons.jushou.addEventListener("click", () => setExpression("jushou"));
actionButtons.pingguo.addEventListener("click", () => setExpression("pingguo"));
actionButtons.monv.addEventListener("click", () => setExpression("monv"));
actionButtons.appleMotion.addEventListener("click", playTapBody);
actionButtons.home.addEventListener("click", ...);
actionButtons.hide.addEventListener("click", ...);
```

## 18. 第十四步：CSS 控制显示位置和样式

看板娘外壳样式在 `public/styles.css`：

```css
.live2d-companion {
  position: fixed;
  right: 16px;
  bottom: 6px;
  z-index: 20;
  width: min(260px, 42vw);
  height: min(380px, 58vh);
  user-select: none;
  touch-action: none;
  filter: drop-shadow(0 24px 42px rgba(0, 0, 0, 0.32));
}
```

按钮默认隐藏：

```css
.live2d-actions {
  opacity: 0;
  transform: translateY(6px);
}
```

鼠标移上去显示：

```css
.live2d-companion:hover .live2d-actions,
.live2d-companion:focus-within .live2d-actions {
  opacity: 1;
  transform: translateY(0);
}
```

移动端缩小：

```css
@media (max-width: 860px) {
  .live2d-companion {
    width: 170px;
    height: 250px;
    right: 2px;
    bottom: 64px;
  }
}
```

## 19. 当前没有音效

检查过雪莉目录，没有音频文件：

```text
.wav
.mp3
.ogg
.m4a
.aac
.flac
```

`雪莉.vtube.json` 中也没有绑定声音。

所以当前雪莉没有自带音效。

项目里的聊天通知音是前端用 `AudioContext` 合成的提示音，不是雪莉资源包自带声音。

如果以后拿到语音包，可以扩展成：

- 点击雪莉播放语音。
- 切换表情播放不同音效。
- 收到消息时让雪莉说话。
- 播放动作时同步音频。

## 20. 常见问题排查

### 20.1 模型不显示

优先检查模型配置能否访问：

```text
http://localhost:3000/models/xueli/雪莉.model3.json
```

如果 404，说明 `server.js` 静态路由不对：

```js
app.use("/models/xueli", express.static(path.join(__dirname, "雪莉")));
```

### 20.2 控制台提示 Live2D runtime was not loaded

说明运行时脚本没加载成功，检查 HTML 中这几个脚本：

```html
<script src="https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/pixi.js@6.5.10/dist/browser/pixi.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/pixi-live2d-display@0.4.0/dist/cubism4.min.js"></script>
```

还要检查顺序，`live2d.js` 必须最后加载。

### 20.3 页面只有眨眼，其他不动

原因通常是模型没有 `Idle` 动作。

本项目用两种方式处理：

1. 写入 Live2D 参数，例如 `ParamBreath`、`ParamAngleX`。
2. 给整个模型容器加轻微浮动、缩放、旋转，作为可见待机动画。

### 20.4 点击没有动作

检查动作组是否存在：

```json
"Motions": {
  "TapBody": [
    {
      "File": "苹果.motion3.json"
    }
  ]
}
```

然后检查 JS 调用：

```js
model.motion("TapBody", 0, forcePriority);
```

本项目还做了外壳点击兜底，所以点击透明区域也能触发。

### 20.5 中文路径出问题

如果部署后中文路径访问异常，可以考虑：

1. 继续使用 URL 编码：

```js
const MODEL_PATH = "/models/xueli/%E9%9B%AA%E8%8E%89.model3.json";
```

2. 或者把模型文件重命名成英文，例如：

```text
xueli.model3.json
xueli.moc3
xueli.physics3.json
xueli.8192/
```

重命名时要同步修改 `model3.json` 内部引用。

## 21. 如果以后要换另一个 Live2D 模型

大致步骤：

1. 把新模型文件夹放到项目根目录，例如：

```text
新模型/
```

2. 确认里面有：

```text
xxx.model3.json
xxx.moc3
贴图 png
```

3. 在 `server.js` 增加静态路由：

```js
app.use("/models/new-model", express.static(path.join(__dirname, "新模型")));
```

4. 修改 `public/live2d.js`：

```js
const MODEL_PATH = "/models/new-model/xxx.model3.json";
```

5. 检查新模型的动作和表情：

```text
*.motion3.json
*.exp3.json
```

6. 在 `model3.json` 里确认 `Motions` 和 `Expressions` 已配置。

7. 在 `live2d.js` 里增加对应按钮和调用：

```js
model.motion("动作组名", 0, forcePriority);
model.expression("表情名");
```

## 22. 当前关键文件

这次自定义看板娘主要涉及：

```text
server.js
public/index.html
public/live2d.js
public/styles.css
雪莉/雪莉.model3.json
雪莉/苹果.motion3.json
雪莉/*.exp3.json
```

其中最重要的是：

- `server.js`：负责让浏览器访问模型文件。
- `public/index.html`：负责引入 Cubism / Pixi / pixi-live2d-display。
- `public/live2d.js`：负责加载模型和实现所有交互。
- `public/styles.css`：负责看板娘位置、按钮样式、移动端适配。

## 23. 一句话总结

这次自定义看板娘的本质是：

```text
把本地 Live2D 模型文件通过 Express 暴露成网页资源，
再用 Live2D Cubism Core + PixiJS + pixi-live2d-display 加载模型，
最后用自己写的 live2d.js 控制显示、拖动、表情、动作和待机动画。
```

也就是说，雪莉不是一张图片，而是一个被实时渲染和控制的 Live2D 模型。
