(function () {
  const MODEL_PATH = "/models/xueli/%E9%9B%AA%E8%8E%89.model3.json";

  function createCompanionShell() {
    const shell = document.createElement("aside");
    shell.className = "live2d-companion";
    shell.setAttribute("aria-label", "雪莉看板娘");

    const canvas = document.createElement("canvas");
    canvas.className = "live2d-canvas";

    const actions = document.createElement("div");
    actions.className = "live2d-actions";
    const actionButtons = {};

    const createActionButton = (key, text, title) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = text;
      button.title = title;
      button.dataset.live2dAction = key;
      actionButtons[key] = button;
      return button;
    };

    const resetButton = createActionButton("home", "雪莉", "让雪莉回到屏幕角落");
    actions.append(
      createActionButton("normal", "常态", "恢复默认表情"),
      createActionButton("taishou", "抬手", "切换抬手表情"),
      createActionButton("jushou", "举手", "切换举手表情"),
      createActionButton("pingguo", "苹果", "切换苹果表情"),
      createActionButton("monv", "魔女", "切换魔女表情"),
      createActionButton("appleMotion", "动作", "播放苹果动作"),
      resetButton,
      createActionButton("hide", "×", "隐藏看板娘")
    );
    shell.append(canvas, actions);
    document.body.append(shell);

    return { shell, canvas, actionButtons };
  }

  function fitModel(model, app) {
    const width = app.renderer.width;
    const height = app.renderer.height;
    const bounds = model.getLocalBounds();
    const scale = Math.min(width / bounds.width, height / bounds.height) * 0.92;

    model.scale.set(scale);
    model.x = width / 2;
    model.y = height * 0.54;
    model.__baseScale = scale;
    model.__baseX = model.x;
    model.__baseY = model.y;
  }

  function setModelParam(model, id, value, weight = 1) {
    const coreModel = model?.internalModel?.coreModel;
    if (!coreModel?.setParameterValueById) return;

    try {
      coreModel.setParameterValueById(id, value, weight);
    } catch {
      // 不同模型的参数命名可能不同；缺失参数直接跳过，不影响渲染。
    }
  }

  function addProceduralIdle(model, app, shell) {
    let pointerX = 0;
    let pointerY = 0;

    window.addEventListener("pointermove", (event) => {
      const rect = shell.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      pointerX = Math.max(-1, Math.min(1, (event.clientX - centerX) / window.innerWidth * 3.2));
      pointerY = Math.max(-1, Math.min(1, (event.clientY - centerY) / window.innerHeight * 3.2));

      if (typeof model.focus === "function") {
        model.focus(event.clientX, event.clientY);
      }
    });

    const applyIdle = () => {
      const time = performance.now() / 1000;
      const breath = 0.5 + Math.sin(time * 1.7) * 0.5;
      const slowSway = Math.sin(time * 0.72);
      const softBounce = Math.sin(time * 1.18);

      setModelParam(model, "ParamBreath", breath);
      setModelParam(model, "ParamAngleX", pointerX * 22 + slowSway * 8);
      setModelParam(model, "ParamAngleY", -pointerY * 14 + softBounce * 5);
      setModelParam(model, "ParamAngleZ", slowSway * 6);
      setModelParam(model, "ParamBodyAngleX", pointerX * 12 + slowSway * 6);
      setModelParam(model, "ParamBodyAngleY", -pointerY * 8 + softBounce * 4);
      setModelParam(model, "ParamBodyAngleZ", slowSway * 5);
      setModelParam(model, "ParamEyeBallX", pointerX);
      setModelParam(model, "ParamEyeBallY", -pointerY);
    };

    // Cubism4 的内部更新发生在渲染阶段；这里必须在 beforeModelUpdate 写入，
    // 否则外部 ticker 里的参数会被运行时后续的动作、物理和聚焦流程覆盖。
    model.internalModel.on("beforeModelUpdate", applyIdle);
    app.ticker.add(() => {
      const time = performance.now() / 1000;
      const breath = Math.sin(time * 1.7);
      const sway = Math.sin(time * 0.72);
      const baseScale = model.__baseScale || model.scale.x;
      model.__clickPulse = Math.max(0, (model.__clickPulse || 0) - app.ticker.deltaMS / 260);

      // 兜底的可见待机动画：即使模型参数被运行时恢复，整体容器也会自然呼吸和轻晃。
      model.scale.set(baseScale * (1 + breath * 0.012 + model.__clickPulse * 0.085));
      model.x = (model.__baseX || app.renderer.width / 2) + sway * 4;
      model.y = (model.__baseY || app.renderer.height * 0.54) + breath * 3 - model.__clickPulse * 10;
      model.rotation = sway * 0.012 + model.__clickPulse * 0.045;
    });
  }

  function makeDraggable(shell, onClick) {
    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;

    shell.addEventListener("pointerdown", (event) => {
      if (event.target.tagName === "BUTTON") return;
      dragging = true;
      moved = false;
      startX = event.clientX;
      startY = event.clientY;
      originX = shell.offsetLeft;
      originY = shell.offsetTop;
      shell.setPointerCapture(event.pointerId);
    });

    shell.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      if (Math.hypot(deltaX, deltaY) > 4) moved = true;
      shell.style.left = `${originX + event.clientX - startX}px`;
      shell.style.top = `${originY + event.clientY - startY}px`;
      shell.style.right = "auto";
      shell.style.bottom = "auto";
    });

    shell.addEventListener("pointerup", (event) => {
      const shouldClick = dragging && !moved && event.target.tagName !== "BUTTON";
      dragging = false;
      shell.releasePointerCapture(event.pointerId);
      if (shouldClick) onClick();
    });
  }

  async function initLive2D() {
    if (!window.PIXI?.live2d?.Live2DModel) {
      console.warn("Live2D runtime was not loaded.");
      return;
    }

    const { shell, canvas, actionButtons } = createCompanionShell();
    const app = new PIXI.Application({
      view: canvas,
      width: 260,
      height: 380,
      autoStart: true,
      transparent: true,
      antialias: true
    });

    try {
      const model = await PIXI.live2d.Live2DModel.from(MODEL_PATH);

      model.anchor.set(0.5, 0.5);
      model.interactive = true;
      model.buttonMode = true;
      app.stage.addChild(model);
      window.__xueliModel = model;
      window.__xueliApp = app;
      fitModel(model, app);
      addProceduralIdle(model, app, shell);

      // 点击雪莉时播放模型自带的 TapBody 动作；如果动作缺失则静默跳过。
      const playTapBody = () => {
        const forcePriority = window.PIXI?.live2d?.MotionPriority?.FORCE ?? 3;
        model.__clickPulse = 1;
        model.motion("TapBody", 0, forcePriority).catch(() => {});
      };
      const setExpression = (name) => {
        model.__clickPulse = 0.72;
        model.expression(name).catch(() => {});
      };
      const resetExpression = () => {
        model.__clickPulse = 0.45;
        model.internalModel?.motionManager?.expressionManager?.resetExpression?.();
      };

      model.on("pointertap", playTapBody);
      canvas.addEventListener("click", playTapBody);

      actionButtons.normal.addEventListener("click", resetExpression);
      actionButtons.taishou.addEventListener("click", () => setExpression("taishou"));
      actionButtons.jushou.addEventListener("click", () => setExpression("jushou"));
      actionButtons.pingguo.addEventListener("click", () => setExpression("pingguo"));
      actionButtons.monv.addEventListener("click", () => setExpression("monv"));
      actionButtons.appleMotion.addEventListener("click", playTapBody);
      actionButtons.home.addEventListener("click", () => {
        shell.removeAttribute("style");
        fitModel(model, app);
      });

      actionButtons.hide.addEventListener("click", () => {
        shell.classList.add("hidden");
      });

      window.addEventListener("resize", () => fitModel(model, app));
      makeDraggable(shell, playTapBody);
    } catch (error) {
      console.warn("Failed to load Sherry Live2D model.", error);
      shell.remove();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLive2D);
  } else {
    initLive2D();
  }
})();
